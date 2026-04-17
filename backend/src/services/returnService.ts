import type { ConnectionPool, Transaction } from 'mssql'
import { env } from '../config/env.js'
import { CUSTOMER_REFUND_HANDLING_FEE_BPS } from './orderService.js'
import { enqueueNotification } from './notifications.js'
import { resolveOutboxChannel } from './notificationRouting.js'
import { resolveOrderNotificationTarget } from './orderNotificationEmail.js'
import { tryCreditWalletReturnCaseRefund } from './demoWalletService.js'

export const RETURN_CASE_STATUSES = ['pending', 'approved', 'rejected', 'received', 'completed'] as const
export type ReturnCaseStatus = (typeof RETURN_CASE_STATUSES)[number]

export type ReturnCaseLineInput = {
  productId: string
  variantId: string
  quantity: number
}

async function notifyReturnCase(
  pool: ConnectionPool,
  orderId: string,
  returnCaseId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const target = await resolveOrderNotificationTarget(pool, orderId)
  if (!target?.email && !target?.userId) return
  const channel = await resolveOutboxChannel(pool, target.userId, target.guestEmail, 'return_case_status')
  const payload = {
    orderId,
    returnCaseId,
    status,
    ...extra,
  }
  await enqueueNotification(pool, {
    userId: target.userId,
    email: target.email,
    channel,
    templateKey: 'return_case_status',
    payload: JSON.stringify(payload),
  })
}

/** Quantities already tied to non-rejected return cases for this order (per variant). */
async function reservedReturnQtyByVariant(
  exec: ConnectionPool | Transaction,
  orderId: string,
): Promise<Map<string, number>> {
  const r = await exec
    .request()
    .input('oid', orderId)
    .query<{ variant_id: string; q: number }>(`
      SELECT CAST(rcl.variant_id AS NVARCHAR(36)) AS variant_id, SUM(rcl.quantity) AS q
      FROM dbo.return_case_lines rcl
      INNER JOIN dbo.return_cases rc ON rc.id = rcl.return_case_id
      WHERE rc.order_id = @oid AND rc.status <> N'rejected'
      GROUP BY rcl.variant_id
    `)
  const m = new Map<string, number>()
  for (const row of r.recordset) {
    m.set(String(row.variant_id), Number(row.q ?? 0))
  }
  return m
}

export type ReturnableLineRow = {
  variantId: string
  productId: string
  productName: string
  variantName: string
  sku: string
  orderedQty: number
  reservedByReturnsQty: number
  availableToReturnQty: number
  unitPriceCents: number
  currency: string
}

export async function getReturnableLinesForOrder(
  pool: ConnectionPool,
  orderId: string,
): Promise<{ orderStatus: string; lines: ReturnableLineRow[]; windowOk: boolean; daysSinceOrder: number } | null> {
  const o = await pool
    .request()
    .input('oid', orderId)
    .query<{ status: string; created_at: Date; currency: string }>(
      `SELECT status, created_at, currency FROM dbo.orders WHERE id = @oid`,
    )
  const orow = o.recordset[0]
  if (!orow) return null
  const created = orow.created_at instanceof Date ? orow.created_at : new Date(String(orow.created_at))
  const daysSince = Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000))
  const windowOk = daysSince <= env.storeReturnWindowDays

  const transaction = pool.transaction()
  await transaction.begin()
  let reserved: Map<string, number>
  try {
    reserved = await reservedReturnQtyByVariant(transaction, orderId)
    await transaction.commit()
  } catch (e) {
    await transaction.rollback()
    throw e
  }

  const linesR = await pool
    .request()
    .input('oid', orderId)
    .query<{
      variant_id: string
      product_id: string
      product_name: string
      variant_name: string
      sku: string
      quantity: number
      unit_price_cents: number
    }>(`
      SELECT CAST(ol.variant_id AS NVARCHAR(36)) AS variant_id,
        CAST(p.id AS NVARCHAR(36)) AS product_id,
        p.name AS product_name,
        v.name AS variant_name,
        v.sku,
        ol.quantity,
        ol.unit_price_cents
      FROM dbo.order_lines ol
      INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE ol.order_id = @oid
    `)

  const lines: ReturnableLineRow[] = []
  for (const l of linesR.recordset) {
    const vid = String(l.variant_id)
    const ordered = Number(l.quantity ?? 0)
    const res = reserved.get(vid) ?? 0
    lines.push({
      variantId: vid,
      productId: String(l.product_id),
      productName: String(l.product_name ?? ''),
      variantName: String(l.variant_name ?? ''),
      sku: String(l.sku ?? ''),
      orderedQty: ordered,
      reservedByReturnsQty: res,
      availableToReturnQty: Math.max(0, ordered - res),
      unitPriceCents: Number(l.unit_price_cents ?? 0),
      currency: String(orow.currency ?? 'NAD').trim(),
    })
  }

  return {
    orderStatus: String(orow.status),
    lines,
    windowOk,
    daysSinceOrder: daysSince,
  }
}

export async function createReturnCase(
  pool: ConnectionPool,
  input: {
    orderId: string
    userId: string | null
    guestEmailNorm: string | null
    reason: string
    lines: ReturnCaseLineInput[]
    imageUrls?: string[] | null
  },
): Promise<{ returnCaseId: string }> {
  const reason = input.reason.trim()
  if (!reason || reason.length > 2000) {
    throw new Error('Reason is required (max 2000 characters)')
  }
  if (!input.lines?.length) {
    throw new Error('At least one return line is required')
  }

  const mergedMap = new Map<string, ReturnCaseLineInput>()
  for (const line of input.lines) {
    const k = `${line.productId}:${line.variantId}`
    const prev = mergedMap.get(k)
    if (prev) {
      mergedMap.set(k, { ...prev, quantity: prev.quantity + line.quantity })
    } else {
      mergedMap.set(k, { ...line })
    }
  }
  const normalizedLines = [...mergedMap.values()]

  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const ord = await transaction
      .request()
      .input('oid', input.orderId)
      .query<{
        status: string
        user_id: string | null
        guest_email: string | null
        created_at: Date
      }>(
        `SELECT status, CAST(user_id AS NVARCHAR(36)) AS user_id, guest_email, created_at
         FROM dbo.orders WITH (UPDLOCK, ROWLOCK) WHERE id = @oid`,
      )
    const o = ord.recordset[0]
    if (!o) {
      throw new Error('Order not found')
    }
    const st = String(o.status).toLowerCase()
    if (st !== 'shipped' && st !== 'delivered') {
      throw new Error('Returns are only available after the order has been shipped or delivered')
    }

    const created = o.created_at instanceof Date ? o.created_at : new Date(String(o.created_at))
    const daysSince = Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000))
    if (daysSince > env.storeReturnWindowDays) {
      throw new Error(
        `Return window expired (orders older than ${env.storeReturnWindowDays} days cannot request a return here)`,
      )
    }

    if (input.userId) {
      if (!o.user_id || o.user_id !== input.userId) {
        throw new Error('Forbidden')
      }
    } else {
      const ge = o.guest_email?.trim().toLowerCase() ?? ''
      if (!ge || !input.guestEmailNorm || ge !== input.guestEmailNorm) {
        throw new Error('Guest email must match the order')
      }
    }

    const reserved = await reservedReturnQtyByVariant(transaction, input.orderId)

    for (const line of normalizedLines) {
      if (!Number.isFinite(line.quantity) || line.quantity < 1 || !Number.isInteger(line.quantity)) {
        throw new Error('Each line must have a positive integer quantity')
      }
      const vr = await transaction
        .request()
        .input('vid', line.variantId)
        .input('pid', line.productId)
        .query<{ product_id: string }>(`SELECT CAST(product_id AS NVARCHAR(36)) AS product_id FROM dbo.product_variants WHERE id = @vid`)
      const pid = vr.recordset[0]?.product_id
      if (!pid || pid !== line.productId) {
        throw new Error('Product and variant do not match')
      }

      const ol = await transaction
        .request()
        .input('oid', input.orderId)
        .input('vid', line.variantId)
        .query<{ quantity: number }>(`SELECT quantity FROM dbo.order_lines WHERE order_id = @oid AND variant_id = @vid`)
      const ordered = Number(ol.recordset[0]?.quantity ?? 0)
      if (ordered < 1) {
        throw new Error('Variant is not on this order')
      }
      const already = reserved.get(line.variantId) ?? 0
      if (line.quantity > ordered - already) {
        throw new Error(`Return quantity exceeds available amount for variant ${line.variantId}`)
      }
    }

    const ins = await transaction
      .request()
      .input('oid', input.orderId)
      .input('uid', input.userId)
      .input('em', o.guest_email)
      .input('reason', reason)
      .input('img', input.imageUrls?.length ? JSON.stringify(input.imageUrls.slice(0, 8)) : null)
      .query<{ id: string }>(`
        INSERT INTO dbo.return_cases (order_id, user_id, guest_email, reason, status, image_urls_json)
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@oid, @uid, @em, @reason, N'pending', @img)
      `)
    const returnCaseId = ins.recordset[0]?.id
    if (!returnCaseId) {
      throw new Error('Failed to create return case')
    }

    for (const line of normalizedLines) {
      await transaction
        .request()
        .input('rcid', returnCaseId)
        .input('pid', line.productId)
        .input('vid', line.variantId)
        .input('qty', line.quantity)
        .query(`
          INSERT INTO dbo.return_case_lines (return_case_id, product_id, variant_id, quantity)
          VALUES (@rcid, @pid, @vid, @qty)
        `)
    }

    await transaction.commit()

    await notifyReturnCase(pool, input.orderId, returnCaseId, 'pending', {
      message: 'We received your return request and will review it shortly.',
    })

    return { returnCaseId }
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

export async function approveReturnCase(pool: ConnectionPool, returnCaseId: string): Promise<void> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const r = await transaction
      .request()
      .input('id', returnCaseId)
      .query<{ order_id: string; status: string }>(
        `SELECT CAST(order_id AS NVARCHAR(36)) AS order_id, status FROM dbo.return_cases WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
      )
    const row = r.recordset[0]
    if (!row || String(row.status).toLowerCase() !== 'pending') {
      throw new Error('Return case is not pending approval')
    }
    await transaction
      .request()
      .input('id', returnCaseId)
      .query(`UPDATE dbo.return_cases SET status = N'approved', updated_at = SYSUTCDATETIME() WHERE id = @id`)
    await transaction.commit()
    await notifyReturnCase(pool, row.order_id, returnCaseId, 'approved', {
      message: 'Your return was approved. Send the items back; we will restock when they arrive.',
    })
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

export async function rejectReturnCase(
  pool: ConnectionPool,
  returnCaseId: string,
  rejectionReason: string,
): Promise<void> {
  const rr = rejectionReason.trim().slice(0, 1000)
  if (!rr) {
    throw new Error('Rejection reason is required')
  }
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const r = await transaction
      .request()
      .input('id', returnCaseId)
      .query<{ order_id: string; status: string }>(
        `SELECT CAST(order_id AS NVARCHAR(36)) AS order_id, status FROM dbo.return_cases WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
      )
    const row = r.recordset[0]
    if (!row || String(row.status).toLowerCase() !== 'pending') {
      throw new Error('Return case is not pending')
    }
    await transaction
      .request()
      .input('id', returnCaseId)
      .input('rej', rr)
      .query(
        `UPDATE dbo.return_cases SET status = N'rejected', rejection_reason = @rej, updated_at = SYSUTCDATETIME() WHERE id = @id`,
      )
    await transaction.commit()
    await notifyReturnCase(pool, row.order_id, returnCaseId, 'rejected', {
      message: rr,
    })
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

async function restockReturnLines(transaction: Transaction, returnCaseId: string): Promise<void> {
  const wh = await transaction.request().query<{ id: string }>(
    `SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`,
  )
  const warehouseId = wh.recordset[0]?.id
  if (!warehouseId) {
    throw new Error('No warehouse configured')
  }

  const lines = await transaction
    .request()
    .input('id', returnCaseId)
    .query<{ variant_id: string; quantity: number }>(`
      SELECT CAST(variant_id AS NVARCHAR(36)) AS variant_id, quantity
      FROM dbo.return_case_lines WHERE return_case_id = @id
    `)

  for (const line of lines.recordset) {
    const qty = Number(line.quantity ?? 0)
    if (qty < 1) continue
    const upd = await transaction
      .request()
      .input('vid', line.variant_id)
      .input('wid', warehouseId)
      .input('qty', qty)
      .query(`
        UPDATE dbo.inventory_quantity
        SET quantity = quantity + @qty
        WHERE variant_id = @vid AND warehouse_id = @wid
      `)
    if ((upd.rowsAffected[0] ?? 0) === 0) {
      await transaction
        .request()
        .input('vid', line.variant_id)
        .input('wid', warehouseId)
        .input('qty', qty)
        .query(`INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES (@vid, @wid, @qty)`)
    }
    await transaction
      .request()
      .input('vid', line.variant_id)
      .input('wid', warehouseId)
      .input('qty', qty)
      .input('rcid', returnCaseId)
      .query(`
        INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
        VALUES (@vid, @wid, @qty, N'return_received_restock', N'return_case', @rcid)
      `)
  }
}

export async function receiveReturnCase(pool: ConnectionPool, returnCaseId: string): Promise<void> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const r = await transaction
      .request()
      .input('id', returnCaseId)
      .query<{ order_id: string; status: string }>(
        `SELECT CAST(order_id AS NVARCHAR(36)) AS order_id, status FROM dbo.return_cases WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
      )
    const row = r.recordset[0]
    if (!row || String(row.status).toLowerCase() !== 'approved') {
      throw new Error('Return case must be approved before marking received')
    }

    await restockReturnLines(transaction, returnCaseId)

    await transaction
      .request()
      .input('id', returnCaseId)
      .query(`
        UPDATE dbo.return_cases
        SET status = N'received', received_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `)
    await transaction.commit()

    await notifyReturnCase(pool, row.order_id, returnCaseId, 'received', {
      message: 'We received your returned items and restocked inventory. Refund processing will follow.',
    })
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

export async function completeReturnCaseRefund(pool: ConnectionPool, returnCaseId: string): Promise<{
  subtotalCents: number
  handlingFeeCents: number
  netRefundCents: number
  currency: string
  walletNote?: string
}> {
  const rc = await pool
    .request()
    .input('id', returnCaseId)
    .query<{
      order_id: string
      status: string
      user_id: string | null
    }>(
      `SELECT CAST(order_id AS NVARCHAR(36)) AS order_id, status, CAST(user_id AS NVARCHAR(36)) AS user_id
       FROM dbo.return_cases WHERE id = @id`,
    )
  const row = rc.recordset[0]
  if (!row || String(row.status).toLowerCase() !== 'received') {
    throw new Error('Return case must be in received status before completing refund')
  }

  const lines = await pool
    .request()
    .input('id', returnCaseId)
    .input('oid', row.order_id)
    .query<{ variant_id: string; quantity: number; unit_price_cents: number }>(`
      SELECT CAST(rcl.variant_id AS NVARCHAR(36)) AS variant_id, rcl.quantity, ol.unit_price_cents
      FROM dbo.return_case_lines rcl
      INNER JOIN dbo.order_lines ol ON ol.order_id = @oid AND ol.variant_id = rcl.variant_id
      WHERE rcl.return_case_id = @id
    `)

  let subtotal = 0
  for (const l of lines.recordset) {
    subtotal += Number(l.unit_price_cents ?? 0) * Number(l.quantity ?? 0)
  }
  if (subtotal < 1) {
    throw new Error('Unable to compute refund amount for this return')
  }

  const curR = await pool
    .request()
    .input('oid', row.order_id)
    .query<{ currency: string }>(`SELECT currency FROM dbo.orders WHERE id = @oid`)
  const currency = String(curR.recordset[0]?.currency ?? 'NAD').trim()

  const fee = Math.floor((subtotal * CUSTOMER_REFUND_HANDLING_FEE_BPS) / 10000)
  const net = Math.max(0, subtotal - fee)

  let walletNote: string | undefined
  if (row.user_id && net >= 1) {
    const w = await tryCreditWalletReturnCaseRefund(pool, row.user_id, returnCaseId, net)
    if (w.ok) {
      walletNote = w.duplicate ? 'Wallet was already credited for this return.' : undefined
    } else if (w.code === 'schema_missing') {
      walletNote = 'Return completed; demo wallet credit skipped (wallet tables missing).'
    } else {
      throw new Error(w.error)
    }
  } else if (!row.user_id) {
    walletNote = 'Return completed. Guest/card refunds are processed outside the demo wallet.'
  }

  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const lock = await transaction
      .request()
      .input('id', returnCaseId)
      .query<{ status: string }>(
        `SELECT status FROM dbo.return_cases WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
      )
    if (String(lock.recordset[0]?.status).toLowerCase() !== 'received') {
      throw new Error('Return case is no longer in received status — refresh and retry')
    }

    const upd = await transaction
      .request()
      .input('id', returnCaseId)
      .input('sub', subtotal)
      .input('fee', fee)
      .input('net', net)
      .query(`
        UPDATE dbo.return_cases SET
          status = N'completed',
          refund_subtotal_cents = @sub,
          refund_handling_fee_cents = @fee,
          refund_net_cents = @net,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id AND status = N'received'
      `)
    if ((upd.rowsAffected[0] ?? 0) < 1) {
      throw new Error('Return case was already completed or is no longer in received status')
    }

    await transaction.commit()
  } catch (e) {
    await transaction.rollback()
    throw e
  }

  await notifyReturnCase(pool, row.order_id, returnCaseId, 'completed', {
    message: `Refund processed: net ${(net / 100).toFixed(2)} ${currency} after handling fee.`,
    netRefundCents: net,
    currency,
  })

  return { subtotalCents: subtotal, handlingFeeCents: fee, netRefundCents: net, currency, walletNote }
}

export type AdminReturnCaseRow = {
  id: string
  order_id: string
  reason: string
  status: string
  rejection_reason: string | null
  created_at: Date
  received_at: Date | null
  refund_net_cents: number | null
  line_count?: number
}

export async function listReturnCasesAdmin(pool: ConnectionPool): Promise<AdminReturnCaseRow[]> {
  const r = await pool.request().query<AdminReturnCaseRow>(`
    SELECT CAST(rc.id AS NVARCHAR(36)) AS id,
      CAST(rc.order_id AS NVARCHAR(36)) AS order_id,
      rc.reason,
      rc.status,
      rc.rejection_reason,
      rc.created_at,
      rc.received_at,
      rc.refund_net_cents,
      (SELECT COUNT_BIG(1) FROM dbo.return_case_lines rcl WHERE rcl.return_case_id = rc.id) AS line_count
    FROM dbo.return_cases rc
    ORDER BY rc.created_at DESC
  `)
  return r.recordset
}

export async function getReturnCaseAdmin(pool: ConnectionPool, returnCaseId: string): Promise<{
  case: AdminReturnCaseRow & { guest_email: string | null; user_id: string | null; image_urls_json: string | null }
  lines: { variant_id: string; product_id: string; quantity: number; sku: string; product_name: string; variant_name: string }[]
} | null> {
  const c = await pool
    .request()
    .input('id', returnCaseId)
    .query<{
      id: string
      order_id: string
      reason: string
      status: string
      rejection_reason: string | null
      created_at: Date
      received_at: Date | null
      refund_net_cents: number | null
      guest_email: string | null
      user_id: string | null
      image_urls_json: string | null
    }>(`
      SELECT CAST(rc.id AS NVARCHAR(36)) AS id,
        CAST(rc.order_id AS NVARCHAR(36)) AS order_id,
        rc.reason, rc.status, rc.rejection_reason, rc.created_at, rc.received_at, rc.refund_net_cents,
        rc.guest_email,
        CAST(rc.user_id AS NVARCHAR(36)) AS user_id,
        rc.image_urls_json
      FROM dbo.return_cases rc WHERE rc.id = @id
    `)
  const row = c.recordset[0]
  if (!row) return null

  const lines = await pool
    .request()
    .input('id', returnCaseId)
    .query<{
      variant_id: string
      product_id: string
      quantity: number
      sku: string
      product_name: string
      variant_name: string
    }>(`
      SELECT CAST(rcl.variant_id AS NVARCHAR(36)) AS variant_id,
        CAST(rcl.product_id AS NVARCHAR(36)) AS product_id,
        rcl.quantity,
        v.sku,
        p.name AS product_name,
        v.name AS variant_name
      FROM dbo.return_case_lines rcl
      INNER JOIN dbo.product_variants v ON v.id = rcl.variant_id
      INNER JOIN dbo.products p ON p.id = rcl.product_id
      WHERE rcl.return_case_id = @id
    `)

  return {
    case: {
      ...row,
      line_count: lines.recordset.length,
    },
    lines: lines.recordset.map((l) => ({
      variant_id: l.variant_id,
      product_id: l.product_id,
      quantity: l.quantity,
      sku: l.sku,
      product_name: l.product_name,
      variant_name: l.variant_name,
    })),
  }
}

export async function returnCaseAnalytics(pool: ConnectionPool): Promise<Record<string, number>> {
  const r = await pool.request().query<{ status: string; n: number }>(`
    SELECT status, COUNT_BIG(1) AS n FROM dbo.return_cases GROUP BY status
  `)
  const out: Record<string, number> = {}
  for (const row of r.recordset) {
    out[String(row.status)] = Number(row.n ?? 0)
  }
  return out
}
