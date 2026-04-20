import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth } from '../../middleware/auth.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import { mergePayTodayRuntime } from '../../services/integrationRuntimeConfig.js'
import {
  isPaymentIntentMode,
  PayTodayPaymentIntentError,
  resolvePaymentRedirect,
} from '../../services/paytodayForms.js'
import { findUserById } from '../../repos/usersRepo.js'
import { getPaymentRowForOrder, setPaymentProcessing, updatePaymentReference } from '../../repos/paymentsRepo.js'

export const paymentsIntentRouter = Router()
paymentsIntentRouter.use(optionalAuth)

function trimField(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  return t.slice(0, maxLen)
}

function splitFullName(fullName: string | null | undefined): { first: string | null; last: string | null } {
  const t = fullName?.trim()
  if (!t) return { first: null, last: null }
  const i = t.indexOf(' ')
  if (i <= 0) return { first: t.slice(0, 120), last: null }
  const first = t.slice(0, i).slice(0, 120)
  const last = t.slice(i + 1).trim().slice(0, 120)
  return { first, last: last || null }
}

function assertCanAccessOrder(
  req: { user?: { sub: string; email?: string } },
  order: {
    user_id: string | null
    guest_email: string | null
    status: string
  },
  guestEmailBody: string | null,
): { ok: true } | { ok: false; error: string; status: number } {
  const st = order.status?.toLowerCase() ?? ''
  if (st !== 'pending_payment') {
    return { ok: false, status: 400, error: 'Order is not awaiting payment' }
  }
  if (order.user_id) {
    if (!req.user || req.user.sub !== order.user_id) {
      return { ok: false, status: 403, error: 'Forbidden' }
    }
    return { ok: true }
  }
  const ge = guestEmailBody?.trim().toLowerCase() ?? ''
  const og = order.guest_email?.trim().toLowerCase() ?? ''
  if (!ge || ge !== og) {
    return { ok: false, status: 403, error: 'Guest email does not match this order' }
  }
  return { ok: true }
}

/**
 * POST /api/payments/create-intent
 * Creates or refreshes a PayToday redirect for an existing pending order (after checkout).
 */
paymentsIntentRouter.post('/create-intent', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }

  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : ''
  if (!orderId) {
    res.status(400).json({ error: 'orderId required' })
    return
  }

  const guestEmail = typeof req.body?.guestEmail === 'string' ? req.body.guestEmail.trim() : null

  const o = await pool
    .request()
    .input('oid', orderId)
    .query<{
      id: string
      status: string
      total_cents: number
      currency: string
      paytoday_reference: string | null
      guest_email: string | null
      user_id: string | null
      account_full_name: string | null
    }>(`
      SELECT CAST(o.id AS NVARCHAR(36)) AS id, o.status, o.total_cents, o.currency, o.paytoday_reference,
        o.guest_email, CAST(o.user_id AS NVARCHAR(36)) AS user_id, u.full_name AS account_full_name
      FROM dbo.orders o
      LEFT JOIN dbo.users u ON u.id = o.user_id
      WHERE o.id = @oid
    `)
  const order = o.recordset[0]
  if (!order) {
    res.status(404).json({ error: 'Order not found' })
    return
  }

  const gate = assertCanAccessOrder(req, order, guestEmail)
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error })
    return
  }

  const pt = mergePayTodayRuntime(await getIntegrationSettingsMap(pool))
  const reference = order.paytoday_reference ?? `PTSTORE-${order.id}`

  const userEmail = order.guest_email?.trim() || req.user?.email?.trim() || null
  if (isPaymentIntentMode(pt) && !userEmail) {
    res.status(400).json({
      error: 'PayToday payment intent requires payer email (guestEmail or signed-in user).',
    })
    return
  }

  let first = trimField(req.body?.guestFirstName, 120)
  let last = trimField(req.body?.guestLastName, 120)
  const phone = trimField(req.body?.guestPhone, 40)
  if (order.user_id) {
    const full = order.account_full_name ?? (await findUserById(pool, order.user_id))?.full_name ?? null
    const sp = splitFullName(full)
    first = sp.first ?? first
    last = sp.last ?? last
  }

  try {
    const resolution = await resolvePaymentRedirect(
      {
        orderId: order.id,
        reference,
        totalCents: order.total_cents,
        currency: order.currency,
        userEmail,
        invoiceNumber: reference,
        userFirstName: first,
        userLastName: last,
        userPhone: phone,
      },
      pt,
    )

    try {
      await updatePaymentReference(pool, order.id, reference)
      await setPaymentProcessing(pool, order.id)
    } catch (e) {
      console.warn('[payments/create-intent] payment row update (run db:migrate 015?)', e)
    }

    if (resolution.paymentIntentToken) {
      try {
        await pool
          .request()
          .input('tok', resolution.paymentIntentToken)
          .input('oid', order.id)
          .query(`UPDATE dbo.orders SET paytoday_payment_intent_token = @tok WHERE id = @oid`)
      } catch (e) {
        console.warn('[payments/create-intent] paytoday_payment_intent_token', e)
      }
    }

    res.json({
      payment_url: resolution.redirectUrl,
      paymentUrl: resolution.redirectUrl,
      payment_reference: reference,
      orderId: order.id,
      totalCents: order.total_cents,
      currency: order.currency,
    })
  } catch (e) {
    if (e instanceof PayTodayPaymentIntentError) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    throw e
  }
})

/**
 * GET /api/payments/status?orderId=
 * Poll-friendly order + payment row snapshot (webhook is authoritative for paid).
 */
paymentsIntentRouter.get('/status', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }

  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId.trim() : ''
  const guestEmail = typeof req.query.email === 'string' ? req.query.email.trim() : ''

  if (!orderId) {
    res.status(400).json({ error: 'orderId required' })
    return
  }

  const o = await pool
    .request()
    .input('oid', orderId)
    .query<{
      id: string
      status: string
      total_cents: number
      currency: string
      guest_email: string | null
      user_id: string | null
    }>(`
      SELECT CAST(o.id AS NVARCHAR(36)) AS id, o.status, o.total_cents, o.currency, o.guest_email,
        CAST(o.user_id AS NVARCHAR(36)) AS user_id
      FROM dbo.orders o WHERE o.id = @oid
    `)
  const order = o.recordset[0]
  if (!order) {
    res.status(404).json({ error: 'Not found' })
    return
  }

  if (order.user_id) {
    if (!req.user || req.user.sub !== order.user_id) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
  } else {
    const og = order.guest_email?.trim().toLowerCase() ?? ''
    if (!guestEmail || guestEmail.toLowerCase() !== og) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
  }

  let pay: Awaited<ReturnType<typeof getPaymentRowForOrder>> = null
  try {
    pay = await getPaymentRowForOrder(pool, orderId)
  } catch {
    /* migration */
  }

  const paymentStatus = pay?.status ?? null
  const webhookConfirmed = Boolean(pay?.webhook_processed_at)
  const orderPaid = ['paid', 'shipped', 'delivered'].includes(order.status?.toLowerCase() ?? '')

  res.json({
    orderId: order.id,
    orderStatus: order.status,
    totalCents: order.total_cents,
    currency: order.currency,
    paymentStatus,
    paymentReference: pay?.payment_reference ?? null,
    browserReturnStatus: pay?.browser_return_status ?? null,
    webhookConfirmed,
    /** True when order is paid (typically after webhook). */
    paid: orderPaid,
  })
})
