import { randomUUID } from 'crypto'
import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import { tryDebitWalletHubDemo } from '../../services/demoWalletService.js'
import { enqueueNotification } from '../../services/notifications.js'
import { resolveOutboxChannel } from '../../services/notificationRouting.js'

export const hubDemoPaymentRouter = Router()
hubDemoPaymentRouter.use(requireAuth)

const SLUG_RE = /^[a-z][a-z0-9-]{0,79}$/u
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function bad(res: import('express').Response, status: number, message: string): void {
  res.status(status).json({ error: message })
}

type Variant = 'payments' | 'services'
type PayMethod = 'wallet' | 'card' | 'ussd' | 'bank_eft'

function parseVariant(v: unknown): Variant | null {
  return v === 'payments' || v === 'services' ? v : null
}

function parsePayMethod(v: unknown): PayMethod | null {
  return v === 'wallet' || v === 'card' || v === 'ussd' || v === 'bank_eft' ? v : null
}

function parseBody(req: import('express').Request): {
  variant: Variant
  categorySlug: string
  itemId: string | null
  serviceSlug: string | null
  payeeName: string
  amountCents: number
  payMethod: PayMethod
  reference: string
  /** Prepaid meter or municipal account — required for services `water` and `electricity` demos. */
  meterOrAccountRef: string | null
} | null {
  const b = req.body as Record<string, unknown>
  const variant = parseVariant(b.variant)
  if (!variant) return null

  let itemId: string | null = null
  let serviceSlug: string | null = null
  let categorySlug = typeof b.categorySlug === 'string' ? b.categorySlug.trim().toLowerCase() : ''

  if (variant === 'payments') {
    if (!categorySlug || !SLUG_RE.test(categorySlug)) return null
    const id = typeof b.itemId === 'string' ? b.itemId.trim() : ''
    if (!id || !UUID_RE.test(id)) return null
    itemId = id
  } else {
    const slug = typeof b.serviceSlug === 'string' ? b.serviceSlug.trim().toLowerCase() : ''
    if (!slug || slug === 'store' || !SLUG_RE.test(slug)) return null
    serviceSlug = slug
    if (!categorySlug) categorySlug = slug
    if (!SLUG_RE.test(categorySlug)) return null
  }

  const payeeName = typeof b.payeeName === 'string' ? b.payeeName.trim().slice(0, 200) : ''
  if (!payeeName) return null

  const amountCents = typeof b.amountCents === 'number' ? b.amountCents : Number(b.amountCents)
  if (!Number.isFinite(amountCents) || amountCents < 100 || amountCents > 1_000_000_000) return null

  const payMethod = parsePayMethod(b.payMethod)
  if (!payMethod) return null

  const reference = typeof b.reference === 'string' ? b.reference.trim().slice(0, 80) : ''
  if (!reference || !/^[\w.-]+$/u.test(reference)) return null

  const rawMeter = typeof b.meterOrAccountRef === 'string' ? b.meterOrAccountRef.trim().slice(0, 80) : ''
  const needsMeterOrAccount =
    variant === 'services' && (serviceSlug === 'water' || serviceSlug === 'electricity')
  let meterOrAccountRef: string | null = null
  if (variant === 'services') {
    if (needsMeterOrAccount) {
      if (rawMeter.length < 4) return null
      if (!/^[\d\w\s./-]+$/u.test(rawMeter)) return null
      meterOrAccountRef = rawMeter
    } else if (rawMeter) {
      if (rawMeter.length < 2 || !/^[\d\w\s./-]+$/u.test(rawMeter)) return null
      meterOrAccountRef = rawMeter
    }
  }

  return {
    variant,
    categorySlug,
    itemId,
    serviceSlug,
    payeeName,
    amountCents,
    payMethod,
    reference,
    meterOrAccountRef,
  }
}

hubDemoPaymentRouter.post('/demo-payment/pending', async (req, res) => {
  const parsed = parseBody(req)
  if (!parsed) {
    bad(
      res,
      400,
      'Invalid body: variant, categorySlug, payeeName, amountCents (>=100), payMethod, reference, and itemId or serviceSlug. For services water/electricity, meterOrAccountRef is required (min 4 characters, letters/digits/spaces/./-).',
    )
    return
  }
  const pool = await getSqlPool({ eager: true })
  if (!pool?.connected) {
    res.status(503).json({ error: 'Database unavailable', code: 'database_off' })
    return
  }

  const userId = req.user!.sub
  const email = req.user!.email?.trim() || null
  const correlationId = randomUUID()
  const payload = {
    correlationId,
    reference: parsed.reference,
    variant: parsed.variant,
    categorySlug: parsed.categorySlug,
    itemId: parsed.itemId,
    serviceSlug: parsed.serviceSlug,
    payeeName: parsed.payeeName,
    amountCents: parsed.amountCents,
    currency: 'NAD',
    payMethod: parsed.payMethod,
    stage: 'pending' as const,
    ...(parsed.meterOrAccountRef ? { meterOrAccountRef: parsed.meterOrAccountRef } : {}),
  }

  const channel = await resolveOutboxChannel(pool, userId, email, 'hub_demo_pending_payment')
  await enqueueNotification(pool, {
    userId,
    email,
    channel,
    templateKey: 'hub_demo_pending_payment',
    payload: JSON.stringify(payload),
  })

  res.json({ ok: true, correlationId, reference: parsed.reference })
})

hubDemoPaymentRouter.post('/demo-payment/complete', async (req, res) => {
  const parsed = parseBody(req)
  const b = req.body as Record<string, unknown>
  const correlationId = typeof b.correlationId === 'string' ? b.correlationId.trim() : ''
  if (!parsed || !correlationId || !UUID_RE.test(correlationId)) {
    bad(res, 400, 'Invalid body: include correlationId from pending response, plus same payment fields.')
    return
  }
  const pool = await getSqlPool({ eager: true })
  if (!pool?.connected) {
    res.status(503).json({ error: 'Database unavailable', code: 'database_off' })
    return
  }

  const userId = req.user!.sub

  if (parsed.payMethod === 'wallet') {
    const debit = await tryDebitWalletHubDemo(
      pool,
      userId,
      parsed.amountCents,
      correlationId,
      parsed.payeeName,
      parsed.reference,
    )
    if (!debit.ok) {
      if (debit.code === 'insufficient_funds') {
        res.status(400).json({ error: debit.error, code: 'insufficient_wallet' })
        return
      }
      if (debit.code === 'schema_missing') {
        res.status(503).json({ error: debit.error, code: 'wallet_demo_unavailable' })
        return
      }
      res.status(500).json({ error: debit.error })
      return
    }
  }

  const email = req.user!.email?.trim() || null
  const payload = {
    correlationId,
    reference: parsed.reference,
    variant: parsed.variant,
    categorySlug: parsed.categorySlug,
    itemId: parsed.itemId,
    serviceSlug: parsed.serviceSlug,
    payeeName: parsed.payeeName,
    amountCents: parsed.amountCents,
    currency: 'NAD',
    payMethod: parsed.payMethod,
    stage: 'completed' as const,
    completedAt: new Date().toISOString(),
    ...(parsed.meterOrAccountRef ? { meterOrAccountRef: parsed.meterOrAccountRef } : {}),
  }

  const channel = await resolveOutboxChannel(pool, userId, email, 'hub_demo_payment_completed')
  await enqueueNotification(pool, {
    userId,
    email,
    channel,
    templateKey: 'hub_demo_payment_completed',
    payload: JSON.stringify(payload),
  })

  res.json({ ok: true, correlationId, reference: parsed.reference })
})
