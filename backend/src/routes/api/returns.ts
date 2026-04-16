import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js'

export const returnsRouter = Router()

returnsRouter.post('/request', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : ''
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  if (!orderId || !reason) {
    res.status(400).json({ error: 'orderId and reason required' })
    return
  }

  const o = await pool
    .request()
    .input('oid', orderId)
    .query<{ status: string; user_id: string | null; guest_email: string | null }>(
      `SELECT status, CAST(user_id AS NVARCHAR(36)) AS user_id, guest_email FROM dbo.orders WHERE id = @oid`,
    )
  const row = o.recordset[0]
  if (!row || row.status !== 'delivered') {
    res.status(400).json({ error: 'Returns only allowed on delivered orders' })
    return
  }

  const u = req.user
  if (u) {
    if (row.user_id !== u.sub && !['admin', 'ops', 'fulfillment'].includes(u.role)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
  } else {
    if (!row.guest_email || row.guest_email.toLowerCase() !== email) {
      res.status(403).json({ error: 'Guest email must match order' })
      return
    }
  }

  await pool
    .request()
    .input('oid', orderId)
    .input('uid', u?.sub ?? null)
    .input('em', row.guest_email)
    .input('reason', reason)
    .query(`
      INSERT INTO dbo.return_requests (order_id, user_id, guest_email, reason, status)
      VALUES (@oid, @uid, @em, @reason, N'pending')
    `)
  res.status(201).json({ ok: true })
})

export const adminReturnsRouter = Router()
adminReturnsRouter.use(requireAuth, requireRole('admin', 'ops'))

adminReturnsRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const r = await pool.request().query<{
    id: string
    order_id: string
    reason: string
    status: string
    created_at: Date
  }>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, CAST(order_id AS NVARCHAR(36)) AS order_id, reason, status, created_at
    FROM dbo.return_requests ORDER BY created_at DESC
  `)
  res.json({ items: r.recordset })
})

adminReturnsRouter.post('/:id/approve', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const id = req.params.id
  const rr = await pool
    .request()
    .input('id', id)
    .query<{ order_id: string; status: string }>(`SELECT CAST(order_id AS NVARCHAR(36)) AS order_id, status FROM dbo.return_requests WHERE id = @id`)
  const row = rr.recordset[0]
  if (!row || row.status !== 'pending') {
    res.status(400).json({ error: 'Invalid return request' })
    return
  }

  const lines = await pool
    .request()
    .input('oid', row.order_id)
    .query<{ variant_id: string; quantity: number }>(
      `SELECT CAST(variant_id AS NVARCHAR(36)) AS variant_id, quantity FROM dbo.order_lines WHERE order_id = @oid`,
    )

  const wh = await pool.request().query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`)
  const wid = wh.recordset[0]?.id
  if (!wid) {
    res.status(500).json({ error: 'No warehouse' })
    return
  }

  for (const l of lines.recordset) {
    await pool
      .request()
      .input('vid', l.variant_id)
      .input('wid', wid)
      .input('qty', l.quantity)
      .input('oid', row.order_id)
      .query(`
        UPDATE dbo.inventory_quantity SET quantity = quantity + @qty WHERE variant_id = @vid AND warehouse_id = @wid
      `)
    await pool
      .request()
      .input('vid', l.variant_id)
      .input('wid', wid)
      .input('qty', l.quantity)
      .input('oid', row.order_id)
      .query(`
        INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
        VALUES (@vid, @wid, @qty, N'return_restock', N'order', @oid)
      `)
  }

  await pool
    .request()
    .input('id', id)
    .query(`UPDATE dbo.return_requests SET status = N'approved', resolved_at = SYSUTCDATETIME() WHERE id = @id`)

  res.json({ ok: true })
})
