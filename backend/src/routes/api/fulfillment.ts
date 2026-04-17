import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { allocatePickupCode } from '../../services/depositService.js'
import { importInventoryFromCsv } from '../../services/inventoryCsvImport.js'
import { resolveOrderNotificationTarget } from '../../services/orderNotificationEmail.js'
import { enqueueNotification } from '../../services/notifications.js'
import { resolveOutboxChannel } from '../../services/notificationRouting.js'

export const fulfillmentRouter = Router()
fulfillmentRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

fulfillmentRouter.get('/orders', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const r = await pool.request().query<{
    orderId: string
    status: string
    total_cents: number
    currency: string
    stage: string
    delivery_method: string
  }>(`
    SELECT CAST(o.id AS NVARCHAR(36)) AS orderId, o.status, o.total_cents, o.currency, f.stage, o.delivery_method
    FROM dbo.orders o
    INNER JOIN dbo.fulfillment_tasks f ON f.order_id = o.id
    ORDER BY o.created_at DESC
  `)
  res.json({ items: r.recordset })
})

fulfillmentRouter.patch('/orders/:orderId/stage', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = req.params.orderId
  const stage = typeof req.body?.stage === 'string' ? req.body.stage : ''
  const allowed = new Set(['pending', 'picking', 'packing', 'packed', 'shipped', 'delivered', 'pick'])
  if (!stage || !allowed.has(stage)) {
    res.status(400).json({ error: 'stage required (pending|picking|packing|packed|shipped|delivered|pick)' })
    return
  }
  const normalized = stage === 'pick' ? 'picking' : stage

  const existing = await pool
    .request()
    .input('oid', orderId)
    .query<{ stage: string }>(`SELECT stage FROM dbo.fulfillment_tasks WHERE order_id = @oid`)
  const prevStage = existing.recordset[0]?.stage
  if (prevStage === undefined) {
    res.status(404).json({ error: 'Fulfillment task not found' })
    return
  }

  const upd = await pool
    .request()
    .input('oid', orderId)
    .input('stage', normalized)
    .query(`UPDATE dbo.fulfillment_tasks SET stage = @stage, updated_at = SYSUTCDATETIME() WHERE order_id = @oid`)
  if ((upd.rowsAffected?.[0] ?? 0) === 0) {
    res.status(404).json({ error: 'Fulfillment task not found' })
    return
  }

  if (normalized === 'picking' || normalized === 'packing' || normalized === 'packed') {
    await pool
      .request()
      .input('oid', orderId)
      .query(
        `UPDATE dbo.orders SET status = N'processing', updated_at = SYSUTCDATETIME() WHERE id = @oid AND status = N'paid'`,
      )
  }

  if (normalized === 'delivered') {
    await pool
      .request()
      .input('oid', orderId)
      .query(`UPDATE dbo.orders SET status = N'delivered', updated_at = SYSUTCDATETIME() WHERE id = @oid`)
  }
  if (normalized === 'shipped') {
    await pool
      .request()
      .input('oid', orderId)
      .query(`UPDATE dbo.orders SET status = N'shipped', updated_at = SYSUTCDATETIME() WHERE id = @oid`)
  }

  if (String(prevStage).trim().toLowerCase() !== normalized.toLowerCase()) {
    const target = await resolveOrderNotificationTarget(pool, orderId)
    const channel = await resolveOutboxChannel(
      pool,
      target?.userId ?? null,
      target?.guestEmail ?? null,
      'fulfillment_stage_updated',
    )
    await enqueueNotification(pool, {
      userId: target?.userId ?? null,
      email: target?.email ?? null,
      channel,
      templateKey: 'fulfillment_stage_updated',
      payload: JSON.stringify({
        orderId,
        stage: normalized,
        previousStage: prevStage,
      }),
    })
  }

  res.json({ ok: true })
})

fulfillmentRouter.post('/orders/:orderId/pickup-code', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const locationId = typeof req.body?.locationId === 'string' ? req.body.locationId : ''
  if (!locationId) {
    res.status(400).json({ error: 'locationId required' })
    return
  }
  try {
    const { pickupCode, expiresAt } = await allocatePickupCode(pool, req.params.orderId, locationId)
    const target = await resolveOrderNotificationTarget(pool, req.params.orderId)
    const channel = await resolveOutboxChannel(pool, target?.userId ?? null, target?.guestEmail ?? null, 'pickup_code_ready')
    await enqueueNotification(pool, {
      userId: target?.userId ?? null,
      email: target?.email ?? null,
      channel,
      templateKey: 'pickup_code_ready',
      payload: JSON.stringify({
        orderId: req.params.orderId,
        code: pickupCode,
        expiresAt: expiresAt.toISOString(),
      }),
    })
    res.json({ pickupCode, expiresAt: expiresAt.toISOString() })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Allocation failed' })
  }
})

fulfillmentRouter.post('/inventory/csv', async (req, res) => {
  if (!req.user || !['admin', 'ops'].includes(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const csv = typeof req.body?.csv === 'string' ? req.body.csv : ''
  if (!csv.trim()) {
    res.status(400).json({ error: 'csv required' })
    return
  }
  try {
    const result = await importInventoryFromCsv(pool, csv)
    if (result.parseErrors.length > 0) {
      res.status(400).json({ ok: false, applied: 0, parseErrors: result.parseErrors, errors: [] })
      return
    }
    if (result.errors.length > 0) {
      res.status(400).json({ ok: false, applied: 0, errors: result.errors, parseErrors: [] })
      return
    }
    res.json({ ok: true, applied: result.applied })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'CSV import failed' })
  }
})
