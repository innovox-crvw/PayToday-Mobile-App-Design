import crypto from 'node:crypto'
import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth } from '../../middleware/auth.js'

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
  } | null
  lines: { variantId: string; quantity: number; unitPriceCents: number; sku: string; productName: string }[]
  fulfillment: { stage: string; carrier_name: string | null; tracking_reference: string | null } | null
  pickupMasked: boolean
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
    }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, status,
        ISNULL(subtotal_cents, total_cents) AS subtotal_cents,
        ISNULL(shipping_cents, 0) AS shipping_cents,
        ISNULL(tax_cents, 0) AS tax_cents,
        total_cents, currency, delivery_method, guest_email,
        CAST(user_id AS NVARCHAR(36)) AS user_id, created_at, paytoday_reference
      FROM dbo.orders WHERE id = @oid
    `)
  const row = o.recordset[0]
  if (!row) {
    return { order: null, lines: [], fulfillment: null, pickupMasked: true }
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

  const hasPickup = await pool
    .request()
    .input('oid', orderId)
    .query<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.pickup_codes WHERE order_id = @oid`)

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
    pickupMasked: (hasPickup.recordset[0]?.n ?? 0) === 0,
  }
}
