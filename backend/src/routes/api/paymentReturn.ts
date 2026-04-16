import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { env } from '../../config/env.js'
import { confirmOrderPaid } from '../../services/paymentConfirmation.js'

export const paymentReturnRouter = Router()

function extractOrderId(reference: string | undefined): string | null {
  if (!reference || typeof reference !== 'string') return null
  if (reference.startsWith('PTSTORE-')) {
    return reference.slice('PTSTORE-'.length)
  }
  return null
}

/**
 * Browser redirect after PayToday hosted payment. confirmOrderPaid is idempotent for duplicate hits.
 * Query: reference or orderId, status/success for outcome.
 * When PayToday appends only payment_intent_token, resolve order via dbo.orders.paytoday_payment_intent_token (migration 007).
 */
paymentReturnRouter.get('/return', async (req, res) => {
  const reference =
    typeof req.query.reference === 'string'
      ? req.query.reference
      : typeof req.query.ref === 'string'
        ? req.query.ref
        : undefined
  let orderIdParam =
    typeof req.query.orderId === 'string' && req.query.orderId.length > 0
      ? req.query.orderId
      : extractOrderId(reference)

  const intentTokenRaw = req.query.payment_intent_token
  const intentToken =
    typeof intentTokenRaw === 'string' && intentTokenRaw.trim().length > 0 ? intentTokenRaw.trim() : null

  const pool = await getSqlPool()
  if (!orderIdParam && intentToken && pool) {
    try {
      const r = await pool
        .request()
        .input('t', intentToken)
        .query<{ id: string }>(
          `SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.orders WHERE paytoday_payment_intent_token = @t`,
        )
      const id = r.recordset[0]?.id
      if (id) orderIdParam = id
    } catch (e) {
      console.warn('[payment-return] payment_intent_token lookup failed (column missing until db:migrate?)', e)
    }
  }

  const fail = req.query.status === 'failed' || req.query.status === 'cancelled' || req.query.cancelled === 'true'

  const ok =
    !fail &&
    (req.query.status === 'success' ||
      req.query.status === 'paid' ||
      req.query.success === 'true' ||
      req.query.result === 'success' ||
      (typeof reference === 'string' &&
        reference.length > 0 &&
        req.query.status === undefined &&
        req.query.success === undefined))

  const base = env.publicStoreUrl
  const successPath = '/checkout/success'
  const failurePath = '/checkout/failure'

  if (!orderIdParam) {
    res.redirect(302, `${base}${failurePath}?reason=missing_order`)
    return
  }

  if (!pool) {
    res.redirect(302, `${base}${successPath}?orderId=${encodeURIComponent(orderIdParam)}&demo=1`)
    return
  }

  if (ok) {
    try {
      await confirmOrderPaid(pool, orderIdParam)
    } catch (e) {
      console.error('[payment-return] confirm failed', e)
      res.redirect(302, `${base}${failurePath}?orderId=${encodeURIComponent(orderIdParam)}&reason=capture_failed`)
      return
    }
    try {
      const dedupeKey = `return:${reference ?? orderIdParam}:ok`
      await pool
        .request()
        .input('dk', dedupeKey)
        .input('oid', orderIdParam)
        .query(`INSERT INTO dbo.payment_return_events (dedupe_key, order_id) VALUES (@dk, @oid)`)
    } catch {
      /* ignore duplicate audit */
    }
    res.redirect(302, `${base}${successPath}?orderId=${encodeURIComponent(orderIdParam)}`)
    return
  }

  if (fail) {
    res.redirect(302, `${base}${failurePath}?orderId=${encodeURIComponent(orderIdParam)}`)
    return
  }

  res.redirect(302, `${base}${failurePath}?orderId=${encodeURIComponent(orderIdParam)}&reason=unknown`)
})
