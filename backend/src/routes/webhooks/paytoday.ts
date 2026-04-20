import { Router } from 'express'
import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../../config/env.js'
import { getSqlPool } from '../../db/pool.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import { mergePayTodayRuntime } from '../../services/integrationRuntimeConfig.js'
import { confirmOrderPaid } from '../../services/paymentConfirmation.js'
import { cancelUnshippedOrderAdmin } from '../../services/orderService.js'
import {
  markPaymentFailedFromWebhook,
  markPaymentWebhookProcessed,
} from '../../repos/paymentsRepo.js'

export const paytodayWebhookRouter = Router()

const processedEventIds = new Set<string>()

function extractEventId(body: unknown, raw: Buffer): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    const id = o.eventId ?? o.id ?? o.paymentId ?? o.event_id
    if (typeof id === 'string' && id.length > 0) return id.slice(0, 200)
    const ref = o.reference
    const st = o.status ?? o.payment_status ?? o.eventType
    if (typeof ref === 'string' && ref.length > 0) {
      return `${ref}:${String(st ?? '')}`.slice(0, 200)
    }
  }
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64)
}

async function resolveOrderId(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  body: Record<string, unknown>,
): Promise<string | null> {
  if (typeof body.orderId === 'string' && body.orderId.length > 0) {
    return body.orderId
  }
  const ref = body.reference
  if (typeof ref === 'string' && ref.startsWith('PTSTORE-')) {
    return ref.slice('PTSTORE-'.length)
  }
  const tok = body.payment_intent_token ?? body.paymentIntentToken
  if (typeof tok === 'string' && tok.trim().length > 0) {
    try {
      const r = await pool
        .request()
        .input('t', tok.trim())
        .query<{ id: string }>(
          `SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.orders WHERE paytoday_payment_intent_token = @t`,
        )
      const id = r.recordset[0]?.id
      if (id) return id
    } catch {
      /* column may be missing */
    }
  }
  return null
}

function isPaid(body: Record<string, unknown>): boolean {
  const s = String(body.status ?? body.payment_status ?? '').toLowerCase()
  if (['paid', 'success', 'completed', 'captured', 'succeeded'].includes(s)) return true
  if (body.success === true) return true
  const et = String(body.eventType ?? '').toLowerCase()
  if (et.includes('payment') && et.includes('success')) return true
  if (et === 'payment.succeeded') return true
  return false
}

function isFailed(body: Record<string, unknown>): boolean {
  const s = String(body.status ?? body.payment_status ?? '').toLowerCase()
  return ['failed', 'declined', 'error', 'rejected'].includes(s)
}

function isCancelled(body: Record<string, unknown>): boolean {
  const s = String(body.status ?? body.payment_status ?? '').toLowerCase()
  return ['cancelled', 'canceled', 'void'].includes(s)
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

async function applyWebhook(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  parsed: Record<string, unknown>,
  orderId: string,
): Promise<{ action: 'paid' | 'failed' | 'cancelled' | 'noop' }> {
  const st = await pool
    .request()
    .input('oid', orderId)
    .query<{ status: string }>(`SELECT status FROM dbo.orders WHERE id = @oid`)
  const orderStatus = st.recordset[0]?.status?.toLowerCase() ?? ''
  const terminalPaid = ['paid', 'shipped', 'delivered'].includes(orderStatus)

  if (isPaid(parsed)) {
    await confirmOrderPaid(pool, orderId)
    await markPaymentWebhookProcessed(pool, orderId)
    return { action: 'paid' }
  }
  if (isFailed(parsed) || isCancelled(parsed)) {
    if (terminalPaid) {
      return { action: 'noop' }
    }
    try {
      await cancelUnshippedOrderAdmin(pool, orderId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/cannot cancel|not found|already|shipped|delivered/i.test(msg)) {
        console.warn('[paytoday webhook] cancel after failed payment:', msg)
      }
    }
    await markPaymentFailedFromWebhook(pool, orderId)
    return { action: isCancelled(parsed) ? 'cancelled' : 'failed' }
  }
  return { action: 'noop' }
}

export async function handlePayTodayWebhookRequest(req: Request, res: Response): Promise<void> {
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

    const eventId = extractEventId(parsed, raw)

    const pool = await getSqlPool()
    const persist = await tryPersistEvent(pool, eventId, JSON.stringify(parsed))
    if (persist === 'dup') {
      res.status(200).json({ ok: true, duplicate: true })
      return
    }

    const orderId = pool ? await resolveOrderId(pool, parsed) : null
    if (!orderId || !pool) {
      res.status(200).json({ ok: true, received: true, eventId, orderId: null, note: 'order not resolved' })
      return
    }

    const result = await applyWebhook(pool, parsed, orderId)

    res.status(200).json({ ok: true, received: true, eventId, orderId, action: result.action })
  } catch (e) {
    console.error(e)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Webhook error' })
    }
  }
}

paytodayWebhookRouter.post('/', handlePayTodayWebhookRequest)

export function clearWebhookIdempotencyForTests(): void {
  processedEventIds.clear()
}
