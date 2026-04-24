import type { ConnectionPool } from 'mssql'
import { isMissingPayTodayMerchantIdColumnError } from './productsRepo.js'

export type InventoryOverviewRow = {
  variantId: string
  productId: string
  productName: string
  productSlug: string
  isActive: boolean
  sku: string
  variantName: string
  priceCents: number
  currency: string
  quantity: number
  lowStockThreshold: number | null
  reservedQuantity: number
}

export type ListInventoryMerchantScope = {
  /** When set and non-empty, restrict rows to products with these `pay_today_merchant_id` values. */
  payTodayMerchantIds?: number[]
}

function bindPayTodayMerchantIds(req: import('mssql').Request, ids: number[], prefix: string): string {
  const clean = ids.filter((n) => Number.isInteger(n) && n >= 0)
  clean.forEach((id, i) => req.input(`${prefix}${i}`, id))
  return clean.map((_, i) => `@${prefix}${i}`).join(', ')
}

export type StockMovementRow = {
  id: string
  variantId: string
  sku: string
  productName: string
  warehouseId: string
  deltaQty: number
  reason: string
  referenceType: string | null
  referenceId: string | null
  createdAt: string
}

export async function getPrimaryWarehouseId(pool: ConnectionPool): Promise<string | null> {
  const r = await pool.request().query<{ id: string }>(
    `SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`,
  )
  return r.recordset[0]?.id ?? null
}

async function queryInventoryOverview(
  _pool: ConnectionPool,
  merchantFilterSql: string,
  req: import('mssql').Request,
): Promise<InventoryOverviewRow[]> {
  const r = await req.query<{
    variantId: string
    productId: string
    productName: string
    productSlug: string
    is_active: number | boolean
    sku: string
    variantName: string
    price_cents: number
    currency: string
    quantity: number
    low_stock_threshold: number | null
    reservedQuantity: number
  }>(`
    SELECT
      CAST(v.id AS NVARCHAR(36)) AS variantId,
      CAST(p.id AS NVARCHAR(36)) AS productId,
      p.name AS productName,
      p.slug AS productSlug,
      p.is_active AS is_active,
      v.sku,
      v.name AS variantName,
      v.price_cents,
      v.currency,
      ISNULL(qty.sumQty, 0) AS quantity,
      v.low_stock_threshold,
      ISNULL(res.reserved, 0) AS reservedQuantity
    FROM dbo.product_variants v
    INNER JOIN dbo.products p ON p.id = v.product_id
    LEFT JOIN (
      SELECT variant_id, SUM(quantity) AS sumQty
      FROM dbo.inventory_quantity
      GROUP BY variant_id
    ) qty ON qty.variant_id = v.id
    LEFT JOIN (
      SELECT ir.variant_id, SUM(ir.quantity) AS reserved
      FROM dbo.inventory_reservations ir
      INNER JOIN dbo.orders o ON o.id = ir.order_id
      WHERE o.status = N'pending_payment'
      GROUP BY ir.variant_id
    ) res ON res.variant_id = v.id
    WHERE 1 = 1${merchantFilterSql}
    ORDER BY p.name, v.sku
  `)
  return r.recordset.map((row) => ({
    variantId: row.variantId,
    productId: row.productId,
    productName: row.productName,
    productSlug: row.productSlug,
    isActive: Boolean(row.is_active),
    sku: row.sku,
    variantName: row.variantName,
    priceCents: row.price_cents,
    currency: (row.currency ?? 'NAD').trim(),
    quantity: Number(row.quantity ?? 0),
    lowStockThreshold: row.low_stock_threshold == null ? null : Number(row.low_stock_threshold),
    reservedQuantity: Number(row.reservedQuantity ?? 0),
  }))
}

export async function listInventoryOverview(
  pool: ConnectionPool,
  opts?: ListInventoryMerchantScope,
): Promise<InventoryOverviewRow[]> {
  const ids = opts?.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  if (ids.length === 0) {
    const req = pool.request()
    return queryInventoryOverview(pool, '', req)
  }
  const req = pool.request()
  const merchantSql = ` AND p.pay_today_merchant_id IN (${bindPayTodayMerchantIds(req, ids, 'inv')})`
  try {
    return await queryInventoryOverview(pool, merchantSql, req)
  } catch (e) {
    if (isMissingPayTodayMerchantIdColumnError(e)) {
      const r2 = pool.request()
      return queryInventoryOverview(pool, '', r2)
    }
    throw e
  }
}

export async function listRecentStockMovements(
  pool: ConnectionPool,
  limit: number,
  opts?: ListInventoryMerchantScope,
): Promise<StockMovementRow[]> {
  const take = Math.min(Math.max(Number(limit) || 30, 1), 200)
  const ids = opts?.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []

  const run = async (merchantSql: string, req: import('mssql').Request) => {
    req.input('lim', take)
    const r = await req.query<{
      id: string
      variantId: string
      sku: string
      productName: string
      warehouseId: string
      deltaQty: number
      reason: string
      referenceType: string | null
      referenceId: string | null
      createdAt: Date
    }>(`
      SELECT TOP (@lim)
        CAST(sm.id AS NVARCHAR(36)) AS id,
        CAST(sm.variant_id AS NVARCHAR(36)) AS variantId,
        v.sku,
        p.name AS productName,
        CAST(sm.warehouse_id AS NVARCHAR(36)) AS warehouseId,
        sm.delta_qty AS deltaQty,
        sm.reason,
        sm.reference_type AS referenceType,
        CAST(sm.reference_id AS NVARCHAR(36)) AS referenceId,
        sm.created_at AS createdAt
      FROM dbo.stock_movements sm
      INNER JOIN dbo.product_variants v ON v.id = sm.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE 1 = 1${merchantSql}
      ORDER BY sm.created_at DESC
    `)
    return r.recordset.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.sku,
      productName: row.productName,
      warehouseId: row.warehouseId,
      deltaQty: row.deltaQty,
      reason: row.reason,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }))
  }

  if (ids.length === 0) {
    const req = pool.request()
    return run('', req)
  }
  const req = pool.request()
  const merchantSql = ` AND p.pay_today_merchant_id IN (${bindPayTodayMerchantIds(req, ids, 'mov')})`
  try {
    return await run(merchantSql, req)
  } catch (e) {
    if (isMissingPayTodayMerchantIdColumnError(e)) {
      const r2 = pool.request()
      return run('', r2)
    }
    throw e
  }
}

export type LowStockRow = {
  sku: string
  product_name: string
  quantity: number
  low_stock_threshold: number | null
}

export async function listLowStockSkus(
  pool: ConnectionPool,
  opts?: ListInventoryMerchantScope,
): Promise<LowStockRow[]> {
  const ids = opts?.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []

  const run = async (merchantSql: string, req: import('mssql').Request) => {
    const r = await req.query<{
      sku: string
      product_name: string
      quantity: number
      low_stock_threshold: number | null
    }>(`
    SELECT v.sku, p.name AS product_name, SUM(iq.quantity) AS quantity, v.low_stock_threshold
    FROM dbo.inventory_quantity iq
    INNER JOIN dbo.product_variants v ON v.id = iq.variant_id
    INNER JOIN dbo.products p ON p.id = v.product_id
    WHERE v.low_stock_threshold IS NOT NULL${merchantSql}
    GROUP BY v.sku, p.name, v.low_stock_threshold
    HAVING SUM(iq.quantity) <= v.low_stock_threshold
    ORDER BY SUM(iq.quantity) ASC
  `)
    return r.recordset
  }

  if (ids.length === 0) {
    const req = pool.request()
    return run('', req)
  }
  const req = pool.request()
  const merchantSql = ` AND p.pay_today_merchant_id IN (${bindPayTodayMerchantIds(req, ids, 'low')})`
  try {
    return await run(merchantSql, req)
  } catch (e) {
    if (isMissingPayTodayMerchantIdColumnError(e)) {
      const r2 = pool.request()
      return run('', r2)
    }
    throw e
  }
}

/** Hyphenated hex GUID as returned by SQL Server `CAST(id AS NVARCHAR(36))` / `NEWSEQUENTIALID()` (not always RFC-4122 version bits). */
const UNIQUEIDENTIFIER_STRING_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidString(s: string): boolean {
  return UNIQUEIDENTIFIER_STRING_RE.test(s.trim())
}

/**
 * Sets absolute quantity at the primary warehouse for a variant; records stock_movements delta.
 */
export async function setVariantWarehouseQuantityAdmin(
  pool: ConnectionPool,
  variantId: string,
  quantityTarget: number,
): Promise<{ previous: number; warehouseId: string }> {
  if (!isUuidString(variantId)) {
    throw new Error('Invalid variant id')
  }
  if (!Number.isFinite(quantityTarget) || quantityTarget < 0 || !Number.isInteger(quantityTarget)) {
    throw new Error('quantityTarget must be a non-negative integer')
  }

  const warehouseId = await getPrimaryWarehouseId(pool)
  if (!warehouseId) {
    throw new Error('No warehouse configured')
  }

  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const cur = await transaction
      .request()
      .input('vid', variantId)
      .input('wid', warehouseId)
      .query<{ quantity: number | null }>(
        `SELECT quantity FROM dbo.inventory_quantity WHERE variant_id = @vid AND warehouse_id = @wid`,
      )
    const previous = Number(cur.recordset[0]?.quantity ?? 0)
    const delta = quantityTarget - previous

    if (delta === 0) {
      await transaction.commit()
      return { previous, warehouseId }
    }

    if (cur.recordset.length === 0) {
      await transaction
        .request()
        .input('vid', variantId)
        .input('wid', warehouseId)
        .input('qty', quantityTarget)
        .query(`INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES (@vid, @wid, @qty)`)
    } else {
      await transaction
        .request()
        .input('vid', variantId)
        .input('wid', warehouseId)
        .input('qty', quantityTarget)
        .query(`UPDATE dbo.inventory_quantity SET quantity = @qty WHERE variant_id = @vid AND warehouse_id = @wid`)
    }

    await transaction
      .request()
      .input('vid', variantId)
      .input('wid', warehouseId)
      .input('delta', delta)
      .query(`
        INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
        VALUES (@vid, @wid, @delta, N'admin_adjust', NULL, NULL)
      `)

    await transaction.commit()
    return { previous, warehouseId }
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

export async function setVariantLowStockThreshold(
  pool: ConnectionPool,
  variantId: string,
  threshold: number | null,
): Promise<void> {
  if (!isUuidString(variantId)) {
    throw new Error('Invalid variant id')
  }
  if (threshold !== null) {
    if (!Number.isFinite(threshold) || threshold < 0 || !Number.isInteger(threshold)) {
      throw new Error('lowStockThreshold must be null or a non-negative integer')
    }
  }
  const r = await pool
    .request()
    .input('vid', variantId)
    .input('th', threshold)
    .query(`UPDATE dbo.product_variants SET low_stock_threshold = @th WHERE id = @vid`)
  if ((r.rowsAffected[0] ?? 0) === 0) {
    throw new Error('Variant not found')
  }
}
