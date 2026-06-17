import { Router } from 'express'
import { env } from '../../config/env.js'
import { getSqlPool } from '../../db/pool.js'

/**
 * Sandbox / placeholder webhook: expects JSON `{ "orderId": "<uuid>", "status": "...", "trackingUrl": "..." }`
 * and header `X-Yango-Secret` matching `YANGO_WEBHOOK_SECRET` when that env is set.
 */
export const yangoWebhookRouter = Router()

yangoWebhookRouter.post('/', async (req, res) => {
  const secret = env.yangoWebhookSecret
  if (secret) {
    const got = typeof req.get('x-yango-secret') === 'string' ? req.get('x-yango-secret')!.trim() : ''
    if (got !== secret) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
  }

  const body = req.body as { orderId?: unknown; status?: unknown; trackingUrl?: unknown }
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId) {
    res.status(400).json({ error: 'orderId required' })
    return
  }
  const status = typeof body.status === 'string' ? body.status.trim().slice(0, 120) : null
  const trackingUrl = typeof body.trackingUrl === 'string' ? body.trackingUrl.trim().slice(0, 2000) : null

  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }

  try {
    await pool
      .request()
      .input('oid', orderId)
      .input('yst', status)
      .input('yurl', trackingUrl)
      .query(`
        UPDATE dbo.fulfillment_tasks SET
          yango_status = COALESCE(@yst, yango_status),
          yango_tracking_url = COALESCE(@yurl, yango_tracking_url),
          updated_at = SYSUTCDATETIME()
        WHERE order_id = @oid
      `)
  } catch (e) {
    console.warn('[webhooks/yango] update failed', e)
    res.status(500).json({ error: 'Update failed' })
    return
  }

  res.json({ ok: true })
})
