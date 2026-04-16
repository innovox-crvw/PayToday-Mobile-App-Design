import { Router } from 'express'
import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../../config/env.js'
import { getSqlPool } from '../../db/pool.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import { mergePayTodayRuntime } from '../../services/integrationRuntimeConfig.js'
import { confirmOrderPaid } from '../../services/paymentConfirmation.js'

export const paytodayWebhookRouter = Router()

const processedEventIds = new Set<string>()

function extractEventId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const id = o.eventId ?? o.id ?? o.paymentId ?? o.reference
  return typeof id === 'string' && id.length > 0 ? id : null
}

function extractOrderId(body: Record<string, unknown>): string | null {
  if (typeof body.orderId === 'string' && body.orderId.length > 0) {
    return body.orderId
  }
  const ref = body.reference
  if (typeof ref === 'string' && ref.startsWith('PTSTORE-')) {
    return ref.slice('PTSTORE-'.length)
  }
  return null
}

function isPaid(body: Record<string, unknown>): boolean {
  if (body.status === 'paid' || body.status === 'success') return true
  if (body.success === true) return true
  if (body.eventType === 'payment.succeeded') return true
  return false
}

function verifyHmac(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
  nodeEnv: string,
): boolean {
  if (!secret) {
    if (nodeEnv === 'production') {
      return false
    }
    return true
  }
  if (!signatureHeader) {
    return false
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    const a = Buffer.from(signatureHeader.trim(), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) {
      return false
    }
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

async function tryPersistEvent(pool: Awaited<ReturnType<typeof getSqlPool>>, eventId: string, payload: string): Promise<'new' | 'dup'> {
  if (!pool) {
    if (processedEventIds.has(eventId)) return 'dup'
    processedEventIds.add(eventId)
    return 'new'
  }
  const r = await pool
    .request()
    .input('id', eventId)
    .input('payload', payload)
    .query<{ inserted: number }>(`
      IF NOT EXISTS (SELECT 1 FROM dbo.payment_webhook_events WHERE event_id = @id)
      BEGIN
        INSERT INTO dbo.payment_webhook_events (event_id, payload) VALUES (@id, @payload)
        SELECT 1 AS inserted
      END
      ELSE SELECT 0 AS inserted
    `)
  const row = r.recordset[0]
  return row?.inserted === 1 ? 'new' : 'dup'
}

paytodayWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const raw = req.body
    if (!Buffer.isBuffer(raw)) {
      res.status(400).json({ error: 'Expected raw body' })
      return
    }

    const poolForSecret = await getSqlPool()
    const pt = mergePayTodayRuntime(await getIntegrationSettingsMap(poolForSecret))
    const sig = req.get('x-paytoday-signature') ?? req.get('X-PayToday-Signature')
    if (!verifyHmac(raw, sig, pt.webhookSecret, env.nodeEnv)) {
      res.status(401).json({ error: 'Invalid webhook signature' })
      return
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }

    const eventId = extractEventId(parsed)
    if (!eventId) {
      res.status(400).json({ error: 'Missing event id (eventId, id, paymentId, or reference)' })
      return
    }

    const pool = await getSqlPool()
    const persist = await tryPersistEvent(pool, eventId, JSON.stringify(parsed))
    if (persist === 'dup') {
      res.status(200).json({ ok: true, duplicate: true })
      return
    }

    const orderId = extractOrderId(parsed)
    if (orderId && isPaid(parsed) && pool) {
      try {
        await confirmOrderPaid(pool, orderId)
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'Apply failed' })
        return
      }
    }

    res.status(200).json({ ok: true, received: true, eventId, orderId: orderId ?? null })
  } catch (e) {
    console.error(e)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Webhook error' })
    }
  }
})

export function clearWebhookIdempotencyForTests(): void {
  processedEventIds.clear()
}
