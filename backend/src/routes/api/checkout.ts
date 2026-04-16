import { Router } from 'express'
import type { ConnectionPool } from 'mssql'
import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth } from '../../middleware/auth.js'
import { CART_COOKIE, getOrCreateCartId, getCartLines } from '../../services/cartService.js'
import { tryDebitWalletStoreCheckout } from '../../services/demoWalletService.js'
import { cancelUnshippedOrderAdmin, createOrderFromCart } from '../../services/orderService.js'
import { confirmOrderPaid } from '../../services/paymentConfirmation.js'
import { enqueueNotification } from '../../services/notifications.js'
import { resolveOutboxChannel } from '../../services/notificationRouting.js'
import {
  isPaymentIntentMode,
  PayTodayPaymentIntentError,
  resolvePaymentRedirect,
} from '../../services/paytodayForms.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import { mergePayTodayRuntime } from '../../services/integrationRuntimeConfig.js'
import { shippingCentsForDelivery, taxCentsForSubtotal } from '../../services/shipping.js'
import { findUserById } from '../../repos/usersRepo.js'
import type { NextFunction, Request, Response } from 'express'

export const checkoutRouter = Router()
checkoutRouter.use(optionalAuth)

function checkoutSignInGate(req: Request, res: Response, next: NextFunction): void {
  if (!env.checkoutRequireSignIn) {
    next()
    return
  }
  requireAuth(req, res, next)
}

const CHECKOUT_DB_HINT =
  'Start Microsoft SQL Server on the host and port in SQL_CONNECTION_STRING, then run npm run db:setup from the project root. Check the API console on startup for “MS SQL connected” vs “not reachable”.'

function trimPaymentField(value: unknown, maxLen: number): string | null {
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

async function payerFieldsForPaymentIntent(
  pool: ConnectionPool,
  req: Request,
  ctx: { userId: string | null; accountFullName: string | null },
): Promise<{ userFirstName: string | null; userLastName: string | null; userPhone: string | null }> {
  let first = trimPaymentField(req.body?.guestFirstName, 120)
  let last = trimPaymentField(req.body?.guestLastName, 120)
  const phone = trimPaymentField(req.body?.guestPhone, 40)
  if (ctx.userId) {
    const full =
      ctx.accountFullName ?? (await findUserById(pool, ctx.userId))?.full_name ?? null
    const sp = splitFullName(full)
    first = sp.first ?? first
    last = sp.last ?? last
  }
  return { userFirstName: first, userLastName: last, userPhone: phone }
}

checkoutRouter.post('/', checkoutSignInGate, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool) {
    res.status(503).json({
      error: 'Database unavailable — checkout requires MS SQL',
      hint: CHECKOUT_DB_HINT,
    })
    return
  }

  const pt = mergePayTodayRuntime(await getIntegrationSettingsMap(pool))

  const paymentMethod = req.body?.paymentMethod === 'demo_wallet' ? 'demo_wallet' : 'paytoday'
  if (paymentMethod === 'demo_wallet' && !req.user) {
    res.status(401).json({ error: 'Sign in to pay with the demo wallet, or choose PayToday checkout.' })
    return
  }

  const idemHeader = typeof req.get('idempotency-key') === 'string' ? req.get('idempotency-key')!.trim() : ''
  const idemBody = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : ''
  const checkoutIdempotencyKey = idemHeader || idemBody || null

  if (checkoutIdempotencyKey) {
    const existing = await pool
      .request()
      .input('k', checkoutIdempotencyKey)
      .query<{
        id: string
        status: string
        total_cents: number
        currency: string
        paytoday_reference: string | null
        guest_email: string | null
        account_email: string | null
        user_id: string | null
        account_full_name: string | null
      }>(`
        SELECT CAST(o.id AS NVARCHAR(36)) AS id, o.status, o.total_cents, o.currency, o.paytoday_reference,
               o.guest_email, u.email AS account_email,
               CAST(o.user_id AS NVARCHAR(36)) AS user_id,
               u.full_name AS account_full_name
        FROM dbo.orders o
        LEFT JOIN dbo.users u ON u.id = o.user_id
        WHERE o.checkout_idempotency_key = @k
      `)
    const row = existing.recordset[0]
    if (row) {
      const st = row.status?.toLowerCase() ?? ''
      if (st === 'paid' || st === 'shipped' || st === 'delivered') {
        const reference = row.paytoday_reference ?? `PTSTORE-${row.id}`
        res.json({
          orderId: row.id,
          redirectUrl: null,
          reference,
          totalCents: row.total_cents,
          currency: row.currency,
          alreadyPaid: true,
          idempotent: true,
        })
        return
      }
      const reference = row.paytoday_reference ?? `PTSTORE-${row.id}`
      const userEmail = row.guest_email?.trim() || row.account_email?.trim() || null
      if (isPaymentIntentMode(pt) && !userEmail) {
        res.status(400).json({
          error:
            'PayToday payment intent requires a payer email; this order has no guest_email and no linked account email.',
        })
        return
      }
      try {
        const payer = await payerFieldsForPaymentIntent(pool, req, {
          userId: row.user_id,
          accountFullName: row.account_full_name,
        })
        const { redirectUrl, paymentIntentToken } = await resolvePaymentRedirect(
          {
            orderId: row.id,
            reference,
            totalCents: row.total_cents,
            currency: row.currency,
            userEmail,
            invoiceNumber: reference,
            userFirstName: payer.userFirstName,
            userLastName: payer.userLastName,
            userPhone: payer.userPhone,
          },
          pt,
        )
        if (paymentIntentToken) {
          try {
            await pool
              .request()
              .input('tok', paymentIntentToken)
              .input('oid', row.id)
              .query(`UPDATE dbo.orders SET paytoday_payment_intent_token = @tok WHERE id = @oid`)
          } catch (e) {
            console.warn('[checkout] could not store paytoday_payment_intent_token (run db:migrate?)', e)
          }
        }
        res.json({
          orderId: row.id,
          redirectUrl,
          reference,
          totalCents: row.total_cents,
          currency: row.currency,
          idempotent: true,
        })
      } catch (e) {
        if (e instanceof PayTodayPaymentIntentError) {
          res.status(e.statusCode).json({ error: e.message })
          return
        }
        throw e
      }
      return
    }
  }

  const deliveryMethod = req.body?.deliveryMethod === 'deposit_box' ? 'deposit_box' : 'home'
  const depositLocationId = typeof req.body?.depositLocationId === 'string' ? req.body.depositLocationId : null
  const shippingAddressId = typeof req.body?.shippingAddressId === 'string' ? req.body.shippingAddressId : null
  const guestEmail = typeof req.body?.guestEmail === 'string' ? req.body.guestEmail : null

  if (deliveryMethod === 'deposit_box' && !depositLocationId) {
    res.status(400).json({ error: 'depositLocationId required for deposit_box' })
    return
  }
  if (deliveryMethod === 'home' && !req.user) {
    res.status(401).json({
      error: 'Sign in is required for home delivery. Choose pickup, or sign in and add a delivery address.',
    })
    return
  }
  if (deliveryMethod === 'home' && req.user) {
    if (!shippingAddressId?.trim()) {
      res.status(400).json({ error: 'shippingAddressId required for home delivery' })
      return
    }
    const owns = await pool
      .request()
      .input('uid', req.user.sub)
      .input('aid', shippingAddressId.trim())
      .query<{ c: number }>(
        `SELECT COUNT(1) AS c FROM dbo.addresses WHERE id = @aid AND user_id = @uid`,
      )
    if (!owns.recordset[0]?.c) {
      res.status(400).json({ error: 'That shipping address is not on your account' })
      return
    }
  }

  const sessionToken = req.cookies[CART_COOKIE] as string | undefined
  const { cartId } = await getOrCreateCartId(pool, sessionToken, req.user?.sub)

  const lines = await getCartLines(pool, cartId)
  let subtotalCents = 0
  let currency = 'NAD'
  for (const l of lines) {
    subtotalCents += l.unitPriceCents * l.quantity
    currency = l.currency
  }

  const shippingCents = shippingCentsForDelivery(subtotalCents, deliveryMethod)
  const taxCents = taxCentsForSubtotal(subtotalCents)

  let orderId: string
  let totalCents: number
  let reference: string
  /*
   * Checkout uses a single SQL transaction inside createOrderFromCart (order + reserved stock + clear cart).
   * If anything fails, the transaction rolls back and the cart is unchanged.
   */
  try {
    const o = await createOrderFromCart(pool, cartId, {
      userId: req.user?.sub,
      guestEmail,
      deliveryMethod,
      shippingAddressId,
      depositLocationId,
      subtotalCents,
      shippingCents,
      taxCents,
      checkoutIdempotencyKey,
    })
    orderId = o.orderId
    totalCents = o.totalCents
    currency = o.currency

    const paymentIdemKey = crypto.randomUUID()
    await pool
      .request()
      .input('orderId', orderId)
      .input('status', 'pending')
      .input('key', paymentIdemKey)
      .query(`
      INSERT INTO dbo.payments (order_id, status, idempotency_key) VALUES (@orderId, @status, @key)
    `)

    reference = `PTSTORE-${orderId}`
    await pool
      .request()
      .input('ref', reference)
      .input('oid', orderId)
      .query(`UPDATE dbo.orders SET paytoday_reference = @ref WHERE id = @oid`)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Checkout failed' })
    return
  }

  if (paymentMethod === 'demo_wallet') {
    const uid = req.user!.sub
    const debit = await tryDebitWalletStoreCheckout(pool, uid, orderId, totalCents, reference)
    if (!debit.ok) {
      try {
        await cancelUnshippedOrderAdmin(pool, orderId)
      } catch (err) {
        console.error('[checkout] cancel order after demo wallet failure', err)
      }
      if (debit.code === 'insufficient_funds') {
        res.status(400).json({ error: debit.error, code: 'insufficient_wallet', orderId })
        return
      }
      if (debit.code === 'schema_missing') {
        res.status(503).json({ error: debit.error, code: 'wallet_demo_unavailable', orderId })
        return
      }
      res.status(500).json({ error: debit.error, orderId })
      return
    }

    try {
      await confirmOrderPaid(pool, orderId)
    } catch (err) {
      console.error('[checkout] confirmOrderPaid after demo wallet debit', err)
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Payment capture failed after wallet debit',
        orderId,
        code: 'wallet_capture_failed',
      })
      return
    }

    res.json({
      orderId,
      redirectUrl: null,
      reference,
      totalCents,
      currency,
      subtotalCents,
      shippingCents,
      taxCents,
      paidWithDemoWallet: true,
      walletBalanceAfterCents: debit.balanceAfter,
    })
    return
  }

  const userEmail = guestEmail?.trim() || req.user?.email?.trim() || null
  if (isPaymentIntentMode(pt) && !userEmail) {
    res.status(400).json({
      error: 'PayToday payment intent requires payer email: send guestEmail for guest checkout or sign in.',
    })
    return
  }

  let redirectUrl: string
  try {
    const payer = await payerFieldsForPaymentIntent(pool, req, {
      userId: req.user?.sub ?? null,
      accountFullName: null,
    })
    const resolution = await resolvePaymentRedirect(
      {
        orderId,
        reference,
        totalCents,
        currency,
        userEmail,
        invoiceNumber: reference,
        userFirstName: payer.userFirstName,
        userLastName: payer.userLastName,
        userPhone: payer.userPhone,
      },
      pt,
    )
    redirectUrl = resolution.redirectUrl
    if (resolution.paymentIntentToken) {
      try {
        await pool
          .request()
          .input('tok', resolution.paymentIntentToken)
          .input('oid', orderId)
          .query(`UPDATE dbo.orders SET paytoday_payment_intent_token = @tok WHERE id = @oid`)
      } catch (e) {
        console.warn('[checkout] could not store paytoday_payment_intent_token (run db:migrate?)', e)
      }
    }
  } catch (e) {
    if (e instanceof PayTodayPaymentIntentError) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    throw e
  }

  const channel = await resolveOutboxChannel(pool, req.user?.sub ?? null, guestEmail, 'checkout_pending_payment')
  await enqueueNotification(pool, {
    userId: req.user?.sub ?? null,
    email: guestEmail ?? req.user?.email ?? null,
    channel,
    templateKey: 'checkout_pending_payment',
    payload: JSON.stringify({ orderId, totalCents, currency }),
  })

  res.json({ orderId, redirectUrl, reference, totalCents, currency, subtotalCents, shippingCents, taxCents })
})
