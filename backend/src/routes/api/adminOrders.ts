import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { cancelUnshippedOrderAdmin } from '../../services/orderService.js'

export const adminOrdersRouter = Router()
adminOrdersRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminOrdersRouter.get('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
  const base = `
    SELECT CAST(o.id AS NVARCHAR(36)) AS orderId, o.status, o.total_cents, o.currency, o.created_at, o.delivery_method,
      o.guest_email, CAST(o.user_id AS NVARCHAR(36)) AS user_id,
      LTRIM(RTRIM(u.email)) AS customer_email,
      ISNULL(dc.dispute_count, 0) AS dispute_count,
      ISNULL(dc.dispute_active_count, 0) AS dispute_active_count
    FROM dbo.orders o
    LEFT JOIN dbo.users u ON u.id = o.user_id
    LEFT JOIN (
      SELECT order_id,
        COUNT_BIG(*) AS dispute_count,
        SUM(CASE WHEN status IN (N'open', N'in_review') THEN 1 ELSE 0 END) AS dispute_active_count
      FROM dbo.order_disputes
      GROUP BY order_id
    ) dc ON dc.order_id = o.id
  `
  const r = status
    ? await pool.request().input('st', status).query<{
        orderId: string
        status: string
        total_cents: number
        currency: string
        created_at: Date
        delivery_method: string
        guest_email: string | null
        user_id: string | null
        customer_email: string | null
        dispute_count: number
        dispute_active_count: number
      }>(`${base} WHERE o.status = @st ORDER BY o.created_at DESC`)
    : await pool.request().query<{
        orderId: string
        status: string
        total_cents: number
        currency: string
        created_at: Date
        delivery_method: string
        guest_email: string | null
        user_id: string | null
        customer_email: string | null
        dispute_count: number
        dispute_active_count: number
      }>(`${base} ORDER BY o.created_at DESC`)
  res.json({ items: r.recordset })
})

adminOrdersRouter.post('/:orderId/cancel', requireRole('admin', 'ops'), async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const oid = typeof req.params.orderId === 'string' ? req.params.orderId : String(req.params.orderId ?? '')
  const cur = await pool.request().input('oid', oid).query<{ status: string }>(`SELECT status FROM dbo.orders WHERE id = @oid`)
  const st = cur.recordset[0]?.status
  if (!st) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (st === 'shipped' || st === 'delivered' || st === 'cancelled' || st === 'refunded') {
    res.status(400).json({ error: 'Cannot cancel this order' })
    return
  }
  try {
    await cancelUnshippedOrderAdmin(pool, oid)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cancel failed'
    if (msg === 'Order not found') {
      res.status(404).json({ error: msg })
      return
    }
    if (msg === 'Cannot cancel this order') {
      res.status(400).json({ error: msg })
      return
    }
    res.status(500).json({ error: msg })
    return
  }
  res.json({ ok: true })
})

adminOrdersRouter.post('/:orderId/refund', requireRole('admin', 'ops'), async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const oid = req.params.orderId
  await pool
    .request()
    .input('oid', oid)
    .query(`UPDATE dbo.orders SET status = N'refunded', refunded_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @oid`)
  res.json({ ok: true, note: 'Manual PSP refund required; status updated for operations.' })
})
