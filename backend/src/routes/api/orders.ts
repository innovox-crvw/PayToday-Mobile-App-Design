import crypto from 'node:crypto'
import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth } from '../../middleware/auth.js'
import { tryCreditWalletStoreRefund } from '../../services/demoWalletService.js'
import { allocateCustomerVolatilePickupCode, CUSTOMER_PICKUP_CODE_TTL_SECONDS } from '../../services/depositService.js'
import { enqueueNotification } from '../../services/notifications.js'
import { resolveOutboxChannel } from '../../services/notificationRouting.js'
import { resolveOrderNotificationTarget } from '../../services/orderNotificationEmail.js'
import {
  cancelCustomerUnpaidOrder,
  CUSTOMER_REFUND_HANDLING_FEE_BPS,
  refundCustomerPaidOrderWithFee,
} from '../../services/orderService.js'
import { getReturnableLinesForOrder } from '../../services/returnService.js'

export const ordersRouter = Router()

function isStaff(role: string | undefined): boolean {
  return role === 'admin' || role === 'ops' || role === 'fulfillment'
}

ordersRouter.get('/mine', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const r = await pool
    .request()
    .input('uid', req.user.sub)
    .query<{
      orderId: string
      status: string
      total_cents: number
      currency: string
      created_at: Date
      delivery_method: string
    }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS orderId, status, total_cents, currency, created_at, delivery_method
      FROM dbo.orders WHERE user_id = @uid ORDER BY created_at DESC
    `)
  res.json({ items: r.recordset })
})

ordersRouter.post('/:orderId/pickup/verify', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (!code) {
    res.status(400).json({ error: 'code required' })
    return
  }

  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const u = req.user
  const emailQ = typeof req.query.email === 'string' ? req.query.email : ''
  const allowed =
    isStaff(u?.role) ||
    (u && detail.order.user_id === u.sub) ||
    (!!detail.order.guest_email && emailQ && detail.order.guest_email.toLowerCase() === emailQ.toLowerCase())
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const hash = crypto.createHash('sha256').update(code, 'utf8').digest()
  const r = await pool
    .request()
    .input('oid', orderId)
    .input('h', hash)
    .query<{ id: string }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.pickup_codes
      WHERE order_id = @oid AND code_hash = @h AND used_at IS NULL AND expires_at > SYSUTCDATETIME()
    `)
  const pid = r.recordset[0]?.id
  if (!pid) {
    res.status(400).json({ error: 'Invalid or expired code' })
    return
  }

  await pool
    .request()
    .input('id', pid)
    .query(`UPDATE dbo.pickup_codes SET used_at = SYSUTCDATETIME() WHERE id = @id`)

  res.json({ ok: true, message: 'Pickup confirmed' })
})

/** Guest lookup by order id + email (limited self-service). */
ordersRouter.get('/track', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : ''
  const email = typeof req.query.email === 'string' ? req.query.email : ''
  if (!orderId || !email) {
    res.status(400).json({ error: 'orderId and email query required' })
    return
  }
  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order || detail.order.guest_email?.toLowerCase() !== email.toLowerCase()) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(detail)
})

function guestEmailFromReq(req: { query: unknown; body?: unknown }): string {
  const q = typeof (req.query as { email?: unknown }).email === 'string' ? String((req.query as { email: string }).email) : ''
  const b =
    req.body && typeof (req.body as { email?: unknown }).email === 'string'
      ? String((req.body as { email: string }).email)
      : ''
  return (q || b).trim().toLowerCase()
}

function canAccessOrderSelfService(
  user: { sub: string; role?: string } | undefined,
  order: { user_id: string | null; guest_email: string | null },
  guestEmailNorm: string,
): boolean {
  if (isStaff(user?.role)) {
    const owns = Boolean(user && order.user_id === user.sub)
    return owns
  }
  if (user && order.user_id === user.sub) {
    return true
  }
  if (!user && order.guest_email && guestEmailNorm && order.guest_email.toLowerCase() === guestEmailNorm) {
    return true
  }
  return false
}

/** Customer: cancel unpaid order (releases reserved stock for pending_payment). */
ordersRouter.post('/:orderId/cancel', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const guestEmail = guestEmailFromReq(req)
  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!canAccessOrderSelfService(req.user, detail.order, guestEmail)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  try {
    await cancelCustomerUnpaidOrder(pool, orderId)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cancel failed'
    if (msg === 'PAID_USE_REFUND') {
      res.status(400).json({ error: 'This order is already paid. Request a refund instead.' })
      return
    }
    if (msg === 'Order not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

/**
 * Customer: refund a paid/processing (unshipped) order — 10% handling fee retained, remainder credited to demo wallet when applicable.
 * Body: `{ confirm: true, email?: string }` (email for guests, same as order detail).
 */
ordersRouter.post('/:orderId/refund', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  if (req.body?.confirm !== true) {
    res.status(400).json({ error: 'Set confirm: true to acknowledge the handling fee and complete the refund.' })
    return
  }
  const orderId = String(req.params.orderId)
  const guestEmail = guestEmailFromReq(req)
  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!canAccessOrderSelfService(req.user, detail.order, guestEmail)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  try {
    const breakdown = await refundCustomerPaidOrderWithFee(pool, orderId, CUSTOMER_REFUND_HANDLING_FEE_BPS)
    let walletNote: string | undefined
    let walletBalanceAfter: number | undefined
    if (breakdown.userId && breakdown.netRefundCents >= 1) {
      const w = await tryCreditWalletStoreRefund(pool, breakdown.userId, orderId, breakdown.netRefundCents)
      if (w.ok) {
        walletBalanceAfter = w.balanceAfter
        if (w.duplicate) {
          walletNote = 'Wallet was already credited for this refund.'
        }
      } else {
        walletNote =
          w.code === 'schema_missing'
            ? 'Refund recorded; demo wallet credit skipped (wallet tables missing).'
            : `Refund recorded; demo wallet credit failed: ${w.error}`
      }
    } else if (!breakdown.userId) {
      walletNote =
        'Refund recorded. PayToday card/wallet settlement is processed separately — contact support if money does not appear within a few days.'
    }
    res.json({
      ok: true,
      handlingFeeBps: CUSTOMER_REFUND_HANDLING_FEE_BPS,
      totalCents: breakdown.totalCents,
      handlingFeeCents: breakdown.handlingFeeCents,
      netRefundCents: breakdown.netRefundCents,
      currency: breakdown.currency,
      walletBalanceAfter,
      walletNote,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Refund failed'
    if (msg === 'Order not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

/**
 * Customer: generate a short-lived pickup code for deposit-box orders (same access as order detail).
 * Replaces any previous unused code. Valid for {@link CUSTOMER_PICKUP_CODE_TTL_SECONDS} seconds.
 */
ordersRouter.post('/:orderId/pickup-code', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const guestEmail = guestEmailFromReq(req)
  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!canAccessOrderSelfService(req.user, detail.order, guestEmail)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  try {
    const { pickupCode, expiresAt } = await allocateCustomerVolatilePickupCode(pool, orderId)
    const target = await resolveOrderNotificationTarget(pool, orderId)
    const channel = await resolveOutboxChannel(pool, target?.userId ?? null, target?.guestEmail ?? null, 'pickup_code_ready')
    await enqueueNotification(pool, {
      userId: target?.userId ?? null,
      email: target?.email ?? null,
      channel,
      templateKey: 'pickup_code_ready',
      payload: JSON.stringify({
        orderId,
        code: pickupCode,
        expiresAt: expiresAt.toISOString(),
      }),
    })
    res.json({
      pickupCode,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: CUSTOMER_PICKUP_CODE_TTL_SECONDS,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'Order not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

/** Lines available for post-delivery return (same access as order detail). */
ordersRouter.get('/:orderId/returnable', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const guestEmail = guestEmailFromReq(req)
  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!canAccessOrderSelfService(req.user, detail.order, guestEmail)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const ret = await getReturnableLinesForOrder(pool, orderId)
  if (!ret) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(ret)
})

/** Order detail: owner, guest (with ?email=), or staff. */
ordersRouter.get('/:orderId', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const emailQ = typeof req.query.email === 'string' ? req.query.email : ''

  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  const u = req.user
  if (isStaff(u?.role)) {
    res.json(detail)
    return
  }
  if (u && detail.order.user_id === u.sub) {
    res.json(detail)
    return
  }
  if (!u && detail.order.guest_email && emailQ && detail.order.guest_email.toLowerCase() === emailQ.toLowerCase()) {
    res.json(detail)
    return
  }

  res.status(403).json({ error: 'Forbidden' })
})

async function loadOrderDetail(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  orderId: string,
): Promise<{
  order: {
    orderId: string
    status: string
    subtotal_cents: number
    shipping_cents: number
    tax_cents: number
    total_cents: number
    currency: string
    delivery_method: string
    guest_email: string | null
    user_id: string | null
    created_at: Date
    paytoday_reference: string | null
    deposit_location_id: string | null
    deposit_location_name: string | null
  } | null
  lines: { variantId: string; quantity: number; unitPriceCents: number; sku: string; productName: string }[]
  fulfillment: { stage: string; carrier_name: string | null; tracking_reference: string | null } | null
  /** True when there is no unused, unexpired pickup code (legacy field name). */
  pickupMasked: boolean
  activePickupCodes: number
}> {
  const o = await pool
    .request()
    .input('oid', orderId)
    .query<{
      id: string
      status: string
      subtotal_cents: number
      shipping_cents: number
      tax_cents: number
      total_cents: number
      currency: string
      delivery_method: string
      guest_email: string | null
      user_id: string | null
      created_at: Date
      paytoday_reference: string | null
      deposit_location_id: string | null
      deposit_location_name: string | null
    }>(`
      SELECT CAST(o.id AS NVARCHAR(36)) AS id, o.status,
        ISNULL(o.subtotal_cents, o.total_cents) AS subtotal_cents,
        ISNULL(o.shipping_cents, 0) AS shipping_cents,
        ISNULL(o.tax_cents, 0) AS tax_cents,
        o.total_cents, o.currency, o.delivery_method, o.guest_email,
        CAST(o.user_id AS NVARCHAR(36)) AS user_id, o.created_at, o.paytoday_reference,
        CAST(o.deposit_location_id AS NVARCHAR(36)) AS deposit_location_id,
        (SELECT TOP 1 dl.name FROM dbo.deposit_locations dl WHERE dl.id = o.deposit_location_id) AS deposit_location_name
      FROM dbo.orders o WHERE o.id = @oid
    `)
  const row = o.recordset[0]
  if (!row) {
    return { order: null, lines: [], fulfillment: null, pickupMasked: true, activePickupCodes: 0 }
  }

  const linesR = await pool
    .request()
    .input('oid', orderId)
    .query<{
      variant_id: string
      quantity: number
      unit_price_cents: number
      sku: string
      product_name: string
    }>(`
      SELECT CAST(ol.variant_id AS NVARCHAR(36)) AS variant_id, ol.quantity, ol.unit_price_cents,
        v.sku, p.name AS product_name
      FROM dbo.order_lines ol
      INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE ol.order_id = @oid
    `)

  const f = await pool
    .request()
    .input('oid', orderId)
    .query<{ stage: string; carrier_name: string | null; tracking_reference: string | null }>(`
      SELECT stage, carrier_name, tracking_reference FROM dbo.fulfillment_tasks WHERE order_id = @oid
    `)

  const activePickup = await pool
    .request()
    .input('oid', orderId)
    .query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM dbo.pickup_codes WHERE order_id = @oid AND used_at IS NULL AND expires_at > SYSUTCDATETIME()`,
    )
  const activePickupCodes = Number(activePickup.recordset[0]?.n ?? 0)

  return {
    order: {
      orderId: row.id,
      status: row.status,
      subtotal_cents: row.subtotal_cents,
      shipping_cents: row.shipping_cents,
      tax_cents: row.tax_cents,
      total_cents: row.total_cents,
      currency: row.currency,
      delivery_method: row.delivery_method,
      guest_email: row.guest_email,
      user_id: row.user_id,
      created_at: row.created_at,
      paytoday_reference: row.paytoday_reference,
      deposit_location_id: row.deposit_location_id,
      deposit_location_name: row.deposit_location_name,
    },
    lines: linesR.recordset.map((l) => ({
      variantId: l.variant_id,
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      sku: l.sku,
      productName: l.product_name,
    })),
    fulfillment: f.recordset[0]
      ? {
          stage: f.recordset[0].stage,
          carrier_name: f.recordset[0].carrier_name,
          tracking_reference: f.recordset[0].tracking_reference,
        }
      : null,
    pickupMasked: activePickupCodes === 0,
    activePickupCodes,
  }
}
