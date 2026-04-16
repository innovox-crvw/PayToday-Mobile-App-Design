import type { ConnectionPool, Transaction } from 'mssql'
import crypto from 'node:crypto'

const MAX_REASON_LEN = 80

export type CsvImportRowResult = { line: number; sku: string; ok: true } | { line: number; sku: string; ok: false; message: string }

function parseCsvLines(csv: string): string[][] {
  const lines = csv.split(/\r?\n/u).map((l) => l.trim())
  const rows: string[][] = []
  for (const line of lines) {
    if (!line) continue
    rows.push(line.split(',').map((c) => c.trim()))
  }
  return rows
}

/**
 * Expected header: sku,qty_delta,reason (reason required per row for audit).
 * All rows after header are data rows. Unquoted commas only in values (no embedded commas).
 */
export function parseInventoryAdjustmentCsv(csv: string): {
  rows: { sku: string; qtyDelta: number; reason: string }[]
  parseErrors: { line: number; message: string }[]
  firstDataLine: number
} {
  const grid = parseCsvLines(csv)
  const parseErrors: { line: number; message: string }[] = []
  if (grid.length === 0) {
    return { rows: [], parseErrors: [{ line: 0, message: 'CSV is empty' }], firstDataLine: 1 }
  }

  const header = grid[0].map((h) => h.toLowerCase())
  const hasHeader =
    header.includes('sku') && header.includes('qty_delta') && (header.includes('reason') || header.length >= 3)
  const dataStart = hasHeader ? 1 : 0
  if (hasHeader && !header.includes('reason')) {
    parseErrors.push({ line: 1, message: 'Header must include reason column (sku,qty_delta,reason)' })
    return { rows: [], parseErrors, firstDataLine: 2 }
  }

  const firstDataLine = hasHeader ? 2 : 1
  const rows: { sku: string; qtyDelta: number; reason: string }[] = []
  let lineNo = dataStart + 1
  for (let i = dataStart; i < grid.length; i += 1, lineNo += 1) {
    const cols = grid[i]
    if (cols.length < 2) {
      parseErrors.push({ line: lineNo, message: 'Need at least sku and qty_delta' })
      continue
    }
    const sku = cols[0] ?? ''
    const qtyRaw = cols[1] ?? ''
    const reasonRaw = (cols[2] ?? '').trim() || (hasHeader ? '' : 'csv_import')
    if (!sku) {
      parseErrors.push({ line: lineNo, message: 'Missing sku' })
      continue
    }
    if (!reasonRaw) {
      parseErrors.push({ line: lineNo, message: 'Missing reason (required for audit)' })
      continue
    }
    const qtyDelta = Number.parseInt(qtyRaw, 10)
    if (!Number.isFinite(qtyDelta)) {
      parseErrors.push({ line: lineNo, message: `Invalid qty_delta: ${qtyRaw}` })
      continue
    }
    const reason = reasonRaw.slice(0, MAX_REASON_LEN)
    rows.push({ sku, qtyDelta, reason })
  }
  return { rows, parseErrors, firstDataLine }
}

/**
 * Applies adjustments in one transaction. Does not commit/rollback — caller owns transaction lifecycle.
 */
export async function applyInventoryCsvRowsInTransaction(
  transaction: Transaction,
  rows: { sku: string; qtyDelta: number; reason: string }[],
  batchReferenceId: string,
  firstDataLine: number,
): Promise<CsvImportRowResult[]> {
  const wh = await transaction.request().query<{ id: string }>(
    `SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`,
  )
  const warehouseId = wh.recordset[0]?.id
  if (!warehouseId) {
    throw new Error('No warehouse configured')
  }

  const results: CsvImportRowResult[] = []

  for (let ri = 0; ri < rows.length; ri += 1) {
    const line = firstDataLine + ri
    const row = rows[ri]!
    const vr = await transaction
      .request()
      .input('sku', row.sku)
      .query<{ id: string }>(`SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.product_variants WHERE sku = @sku`)
    const variantId = vr.recordset[0]?.id
    if (!variantId) {
      results.push({ line, sku: row.sku, ok: false, message: 'Unknown SKU' })
      continue
    }

    const cur = await transaction
      .request()
      .input('vid', variantId)
      .input('wid', warehouseId)
      .query<{ quantity: number }>(
        `SELECT quantity FROM dbo.inventory_quantity WHERE variant_id = @vid AND warehouse_id = @wid`,
      )
    const currentQty = cur.recordset[0]?.quantity ?? 0
    const nextQty = currentQty + row.qtyDelta
    if (nextQty < 0) {
      results.push({
        line,
        sku: row.sku,
        ok: false,
        message: `Would make quantity negative (current ${currentQty}, delta ${row.qtyDelta})`,
      })
      continue
    }

    const upd = await transaction
      .request()
      .input('vid', variantId)
      .input('wid', warehouseId)
      .input('delta', row.qtyDelta)
      .query(`
        UPDATE dbo.inventory_quantity
        SET quantity = quantity + @delta
        WHERE variant_id = @vid AND warehouse_id = @wid
      `)
    if ((upd.rowsAffected[0] ?? 0) === 0) {
      await transaction
        .request()
        .input('vid', variantId)
        .input('wid', warehouseId)
        .input('q', Math.max(0, nextQty))
        .query(`
          INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
          VALUES (@vid, @wid, @q)
        `)
    }

    await transaction
      .request()
      .input('vid', variantId)
      .input('wid', warehouseId)
      .input('delta', row.qtyDelta)
      .input('reason', row.reason)
      .input('ref', batchReferenceId)
      .query(`
        INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
        VALUES (@vid, @wid, @delta, @reason, N'csv_import', @ref)
      `)

    results.push({ line, sku: row.sku, ok: true })
  }

  return results
}

export async function importInventoryFromCsv(
  pool: ConnectionPool,
  csv: string,
): Promise<{ applied: number; errors: CsvImportRowResult[]; parseErrors: { line: number; message: string }[] }> {
  const { rows, parseErrors, firstDataLine } = parseInventoryAdjustmentCsv(csv)
  if (parseErrors.length > 0) {
    return { applied: 0, errors: [], parseErrors }
  }
  if (rows.length === 0) {
    return { applied: 0, errors: [], parseErrors: [{ line: 0, message: 'No data rows' }] }
  }

  const batchId = crypto.randomUUID()
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const rowResults = await applyInventoryCsvRowsInTransaction(transaction, rows, batchId, firstDataLine)
    const rowErrors = rowResults.filter((r): r is Extract<CsvImportRowResult, { ok: false }> => !r.ok)

    if (rowErrors.length > 0) {
      await transaction.rollback()
      return { applied: 0, errors: rowErrors, parseErrors: [] }
    }

    await transaction.commit()
    return {
      applied: rowResults.length,
      errors: [],
      parseErrors: [],
    }
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}
