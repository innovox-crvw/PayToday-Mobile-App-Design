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
import { getOrderReviewByOrderId, insertOrderReview } from '../../queries/orderReviews.js'
import { listDisputesForOrderStaff } from '../../services/disputeService.js'

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

/** Review for an order (same access as order detail). */
ordersRouter.get('/:orderId/review', optionalAuth, async (req, res) => {
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
  const allowedStaff = isStaff(u?.role)
  const allowedOwner = Boolean(u && detail.order.user_id === u.sub)
  const allowedGuest =
    Boolean(!u && detail.order.guest_email && emailQ && detail.order.guest_email.toLowerCase() === emailQ.toLowerCase())
  if (!allowedStaff && !allowedOwner && !allowedGuest) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const row = await getOrderReviewByOrderId(pool, orderId)
  if (!row) {
    res.json({ review: null })
    return
  }
  res.json({
    review: {
      rating: row.rating,
      comment: row.comment ?? '',
      submittedAt: row.created_at.toISOString(),
    },
  })
})

/**
 * Submit one review per delivered order (customer or guest with matching email).
 * Body: `{ rating: number, comment?: string, email?: string }` (email for guests).
 */
ordersRouter.post('/:orderId/review', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const guestEmail = guestEmailFromReq(req)
  const ratingRaw = req.body?.rating
  const rating =
    typeof ratingRaw === 'number' ? ratingRaw : typeof ratingRaw === 'string' ? Number(ratingRaw) : NaN
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be between 1 and 5' })
    return
  }
  const rounded = Math.round(rating)
  let comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''
  if (comment.length > 2000) comment = comment.slice(0, 2000)

  const detail = await loadOrderDetail(pool, orderId)
  if (!detail.order) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!canAccessOrderSelfService(req.user, detail.order, guestEmail)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (detail.order.status !== 'delivered') {
    res.status(400).json({ error: 'Reviews are only allowed for delivered orders' })
    return
  }

  const existing = await getOrderReviewByOrderId(pool, orderId)
  if (existing) {
    res.status(409).json({ error: 'A review already exists for this order' })
    return
  }

  try {
    await insertOrderReview(pool, {
      orderId,
      userId: req.user?.sub ?? null,
      rating: rounded,
      comment: comment.length ? comment : null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('UX_order_reviews') || msg.includes('duplicate') || msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'A review already exists for this order' })
      return
    }
    throw e
  }

  res.json({
    ok: true,
    review: {
      rating: rounded,
      comment,
      submittedAt: new Date().toISOString(),
    },
  })
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
    const disputes = await listDisputesForOrderStaff(pool, orderId)
    res.json({ ...detail, disputes })
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
    contains_alcohol: boolean
    delivery_scheduled_for: string | null
    home_delivery_window: { start: string; end: string; label: string | null } | null
  } | null
  lines: {
    variantId: string
    variantName: string | null
    quantity: number
    unitPriceCents: number
    sku: string
    productName: string
    packageLengthMm: number | null
    packageWidthMm: number | null
    packageHeightMm: number | null
    grossWeightG: number | null
  }[]
  fulfillment: {
    stage: string
    carrier_name: string | null
    tracking_reference: string | null
    yango_delivery_id: string | null
    yango_status: string | null
    yango_tracking_url: string | null
  } | null
  /** Snapshot from `addresses` at read time (lineup with shipping_address_id). */
  shippingAddress: {
    label: string | null
    line1: string
    line2: string | null
    city: string
    region: string | null
    postal_code: string | null
    country: string
  } | null
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
      contains_alcohol: number | boolean | null
      delivery_scheduled_for: Date | null
      home_delivery_window_start: Date | null
      home_delivery_window_end: Date | null
      home_delivery_window_label: string | null
      ship_label: string | null
      ship_line1: string | null
      ship_line2: string | null
      ship_city: string | null
      ship_region: string | null
      ship_postal: string | null
      ship_country: string | null
    }>(`
      SELECT CAST(o.id AS NVARCHAR(36)) AS id, o.status,
        ISNULL(o.subtotal_cents, o.total_cents) AS subtotal_cents,
        ISNULL(o.shipping_cents, 0) AS shipping_cents,
        ISNULL(o.tax_cents, 0) AS tax_cents,
        o.total_cents, o.currency, o.delivery_method, o.guest_email,
        CAST(o.user_id AS NVARCHAR(36)) AS user_id, o.created_at, o.paytoday_reference,
        CAST(o.deposit_location_id AS NVARCHAR(36)) AS deposit_location_id,
        (SELECT TOP 1 dl.name FROM dbo.deposit_locations dl WHERE dl.id = o.deposit_location_id) AS deposit_location_name,
        ISNULL(o.contains_alcohol, 0) AS contains_alcohol,
        o.delivery_scheduled_for,
        o.home_delivery_window_start,
        o.home_delivery_window_end,
        o.home_delivery_window_label,
        sa.label AS ship_label, sa.line1 AS ship_line1, sa.line2 AS ship_line2, sa.city AS ship_city,
        sa.region AS ship_region, sa.postal_code AS ship_postal, sa.country AS ship_country
      FROM dbo.orders o
      LEFT JOIN dbo.addresses sa ON sa.id = o.shipping_address_id
      WHERE o.id = @oid
    `)
  const row = o.recordset[0]
  if (!row) {
    return { order: null, lines: [], fulfillment: null, shippingAddress: null, pickupMasked: true, activePickupCodes: 0 }
  }

  const shippingAddress =
    row.ship_line1 && row.ship_city
      ? {
          label: row.ship_label,
          line1: row.ship_line1,
          line2: row.ship_line2,
          city: row.ship_city,
          region: row.ship_region,
          postal_code: row.ship_postal,
          country: row.ship_country ?? 'NA',
        }
      : null

  const linesR = await pool
    .request()
    .input('oid', orderId)
    .query<{
      variant_id: string
      quantity: number
      unit_price_cents: number
      sku: string
      product_name: string
      variant_name: string | null
      package_length_mm: number | null
      package_width_mm: number | null
      package_height_mm: number | null
      gross_weight_g: number | null
    }>(`
      SELECT CAST(ol.variant_id AS NVARCHAR(36)) AS variant_id, ol.quantity, ol.unit_price_cents,
        v.sku, p.name AS product_name,
        v.name AS variant_name,
        v.package_length_mm, v.package_width_mm, v.package_height_mm, v.gross_weight_g
      FROM dbo.order_lines ol
      INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE ol.order_id = @oid
    `)

  const f = await pool
    .request()
    .input('oid', orderId)
    .query<{
      stage: string
      carrier_name: string | null
      tracking_reference: string | null
      yango_delivery_id: string | null
      yango_status: string | null
      yango_tracking_url: string | null
    }>(`
      SELECT stage, carrier_name, tracking_reference,
        yango_delivery_id, yango_status, yango_tracking_url
      FROM dbo.fulfillment_tasks WHERE order_id = @oid
    `)

  const activePickup = await pool
    .request()
    .input('oid', orderId)
    .query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM dbo.pickup_codes WHERE order_id = @oid AND used_at IS NULL AND expires_at > SYSUTCDATETIME()`,
    )
  const activePickupCodes = Number(activePickup.recordset[0]?.n ?? 0)

  const winStart = row.home_delivery_window_start
  const winEnd = row.home_delivery_window_end
  const homeDeliveryWindow =
    winStart instanceof Date &&
    winEnd instanceof Date &&
    !Number.isNaN(winStart.getTime()) &&
    !Number.isNaN(winEnd.getTime())
      ? {
          start: winStart.toISOString(),
          end: winEnd.toISOString(),
          label: row.home_delivery_window_label?.trim() ? row.home_delivery_window_label.trim() : null,
        }
      : null
  const deliveryScheduled =
    row.delivery_scheduled_for instanceof Date && !Number.isNaN(row.delivery_scheduled_for.getTime())
      ? row.delivery_scheduled_for.toISOString()
      : null

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
      contains_alcohol: Boolean(Number(row.contains_alcohol ?? 0)),
      delivery_scheduled_for: deliveryScheduled,
      home_delivery_window: homeDeliveryWindow,
    },
    lines: linesR.recordset.map((l) => ({
      variantId: l.variant_id,
      variantName: l.variant_name,
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      sku: l.sku,
      productName: l.product_name,
      packageLengthMm: l.package_length_mm != null ? Number(l.package_length_mm) : null,
      packageWidthMm: l.package_width_mm != null ? Number(l.package_width_mm) : null,
      packageHeightMm: l.package_height_mm != null ? Number(l.package_height_mm) : null,
      grossWeightG: l.gross_weight_g != null ? Number(l.gross_weight_g) : null,
    })),
    fulfillment: f.recordset[0]
      ? {
          stage: f.recordset[0].stage,
          carrier_name: f.recordset[0].carrier_name,
          tracking_reference: f.recordset[0].tracking_reference,
          yango_delivery_id: f.recordset[0].yango_delivery_id ?? null,
          yango_status: f.recordset[0].yango_status ?? null,
          yango_tracking_url: f.recordset[0].yango_tracking_url ?? null,
        }
      : null,
    shippingAddress,
    pickupMasked: activePickupCodes === 0,
    activePickupCodes,
  }
}
