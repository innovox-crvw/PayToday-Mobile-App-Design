import { Router } from 'express'
import type { ConnectionPool } from 'mssql'
import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth } from '../../middleware/auth.js'
import { CART_COOKIE, getCartLines, getOrCreateCartId } from '../../services/cartService.js'
import {
  validateDepositLocationExists,
  validateShippingAddressComplete,
} from '../../services/checkoutValidation.js'
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
import { previewDiscountCode, redeemDiscountCode } from '../../services/discountService.js'
import { getHomeDeliveryAreaById, shippingCentsForArea } from '../../repos/homeDeliveryRepo.js'
import { findUserById } from '../../repos/usersRepo.js'
import { setPaymentProcessing, updatePaymentReference } from '../../repos/paymentsRepo.js'
import { parseEmailString, parseOptionalGuestPersonName, parseOptionalPhoneDigits } from '../../lib/inputValidators.js'
import { assertCheckoutAllowedByMerchantHours } from '../../services/merchantHoursService.js'
import { assertAdultForAlcoholCart } from '../../services/liquorAgeService.js'
import { parseCheckoutDeliveryMethod, isPickupDeliveryMethod, isHomeDeliveryMethod } from '../../lib/checkoutDelivery.js'
import type { NextFunction, Request, Response } from 'express'

class CheckoutValidationError extends Error {
  readonly field: string
  constructor(message: string, field: string) {
    super(message)
    this.name = 'CheckoutValidationError'
    this.field = field
  }
}

export const checkoutRouter = Router()
checkoutRouter.use(optionalAuth)

const CHECKOUT_DB_HINT =
  'Start Microsoft SQL Server on the host and port in SQL_CONNECTION_STRING, then run npm run db:setup from the project root. Check the API console on startup for “MS SQL connected” vs “not reachable”.'

function checkoutSignInGate(req: Request, res: Response, next: NextFunction): void {
  if (!env.checkoutRequireSignIn) {
    next()
    return
  }
  requireAuth(req, res, next)
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

function parseCheckoutScheduling(body: unknown): {
  deliveryScheduledFor: Date | null
  homeDeliveryWindowStart: Date | null
  homeDeliveryWindowEnd: Date | null
  homeDeliveryWindowLabel: string | null
} {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const clean = (d: Date) => (Number.isNaN(d.getTime()) ? null : d)
  const ds =
    typeof b.deliveryScheduledFor === 'string' && b.deliveryScheduledFor.trim()
      ? clean(new Date(b.deliveryScheduledFor.trim()))
      : null
  const hw = b.homeDeliveryWindow && typeof b.homeDeliveryWindow === 'object' ? (b.homeDeliveryWindow as Record<string, unknown>) : null
  const s =
    hw && typeof hw.start === 'string' && hw.start.trim() ? clean(new Date(String(hw.start).trim())) : null
  const e = hw && typeof hw.end === 'string' && hw.end.trim() ? clean(new Date(String(hw.end).trim())) : null
  const lab = hw && typeof hw.label === 'string' && hw.label.trim() ? String(hw.label).trim().slice(0, 200) : null
  return {
    deliveryScheduledFor: ds,
    homeDeliveryWindowStart: s,
    homeDeliveryWindowEnd: e,
    homeDeliveryWindowLabel: lab,
  }
}

async function payerFieldsForPaymentIntent(
  pool: ConnectionPool,
  req: Request,
  ctx: { userId: string | null; accountFullName: string | null },
): Promise<{ userFirstName: string | null; userLastName: string | null; userPhone: string | null }> {
  const gf = parseOptionalGuestPersonName(req.body?.guestFirstName, 'guestFirstName')
  if (!gf.ok) throw new CheckoutValidationError(gf.message, gf.field)
  const gl = parseOptionalGuestPersonName(req.body?.guestLastName, 'guestLastName')
  if (!gl.ok) throw new CheckoutValidationError(gl.message, gl.field)
  const gp = parseOptionalPhoneDigits(req.body?.guestPhone, 'guestPhone')
  if (!gp.ok) throw new CheckoutValidationError(gp.message, gp.field)
  let first = gf.value
  let last = gl.value
  const phone = gp.value
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
        try {
          await updatePaymentReference(pool, row.id, reference)
          await setPaymentProcessing(pool, row.id)
        } catch (e) {
          console.warn('[checkout] payment lifecycle update (run db:migrate 015?)', e)
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
        if (e instanceof CheckoutValidationError) {
          res.status(400).json({ error: e.message, field: e.field, code: 'validation_error' })
          return
        }
        if (e instanceof PayTodayPaymentIntentError) {
          res.status(e.statusCode).json({ error: e.message })
          return
        }
        throw e
      }
      return
    }
  }

  const deliveryMethod = parseCheckoutDeliveryMethod(req.body?.deliveryMethod, env.yangoEnabled)
  const depositLocationId = typeof req.body?.depositLocationId === 'string' ? req.body.depositLocationId : null
  const shippingAddressId = typeof req.body?.shippingAddressId === 'string' ? req.body.shippingAddressId : null
  let guestEmail: string | null =
    typeof req.body?.guestEmail === 'string' && req.body.guestEmail.trim() ? req.body.guestEmail.trim() : null
  if (guestEmail) {
    const ge = parseEmailString(guestEmail, 'guestEmail')
    if (!ge.ok) {
      res.status(400).json({ error: ge.message, field: ge.field, code: 'validation_error' })
      return
    }
    guestEmail = ge.value
  }

  /** `orders.user_id` FK — only set when `dbo.users` still has this id (JWT can be stale after DB reset). */
  let checkoutSqlUserId: string | null = null
  const rawSub = req.user?.sub?.trim()
  if (rawSub) {
    const urow = await findUserById(pool, rawSub)
    if (urow) checkoutSqlUserId = rawSub
  }
  if (req.user && !checkoutSqlUserId) {
    res.status(401).json({
      error:
        'Your sign-in session does not match a user in this database (common after a data refresh). Sign out, sign in again, or clear site cookies for this app.',
    })
    return
  }

  if (isPickupDeliveryMethod(deliveryMethod) && !depositLocationId) {
    res.status(400).json({ error: 'depositLocationId required for store pickup or deposit box delivery' })
    return
  }
  if (isHomeDeliveryMethod(deliveryMethod) && !req.user) {
    res.status(401).json({
      error: 'Sign in is required for home delivery. Choose pickup, or sign in and add a delivery address.',
    })
    return
  }
  if (isHomeDeliveryMethod(deliveryMethod) && req.user) {
    if (!shippingAddressId?.trim()) {
      res.status(400).json({ error: 'shippingAddressId required for home delivery' })
      return
    }
    const owns = await pool
      .request()
      .input('uid', checkoutSqlUserId!)
      .input('aid', shippingAddressId.trim())
      .query<{ c: number }>(
        `SELECT COUNT(1) AS c FROM dbo.addresses WHERE id = @aid AND user_id = @uid`,
      )
    if (!owns.recordset[0]?.c) {
      res.status(400).json({ error: 'That shipping address is not on your account' })
      return
    }
    try {
      await validateShippingAddressComplete(pool, checkoutSqlUserId!, shippingAddressId.trim())
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid delivery address' })
      return
    }
  }

  if (isPickupDeliveryMethod(deliveryMethod) && depositLocationId) {
    try {
      await validateDepositLocationExists(pool, depositLocationId.trim())
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid pickup location' })
      return
    }
  }

  const sessionToken = req.cookies[CART_COOKIE] as string | undefined
  const { cartId } = await getOrCreateCartId(pool, sessionToken, checkoutSqlUserId ?? undefined)

  const lines = await getCartLines(pool, cartId)
  if (lines.length === 0) {
    res.status(400).json({ error: 'Cart is empty' })
    return
  }

  const scheduling = parseCheckoutScheduling(req.body)
  const bodyObj = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const prefsRaw = bodyObj.deliveryPreferences
  if (typeof prefsRaw === 'string' && prefsRaw.trim()) {
    const prefs = prefsRaw.trim().slice(0, 280)
    const base = scheduling.homeDeliveryWindowLabel?.trim() ?? ''
    scheduling.homeDeliveryWindowLabel = [base, `Customer availability: ${prefs}`].filter(Boolean).join(' — ').slice(0, 200)
  }

  try {
    await assertCheckoutAllowedByMerchantHours(pool, cartId, { deliveryMethod, scheduling })
    if (env.liquorGatingEnabled) {
      await assertAdultForAlcoholCart(pool, cartId, checkoutSqlUserId ?? undefined)
    }
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Checkout not allowed' })
    return
  }

  if (!checkoutSqlUserId && paymentMethod === 'paytoday' && isPaymentIntentMode(pt)) {
    const ge = parseEmailString(req.body?.guestEmail, 'guestEmail')
    if (!ge.ok) {
      res.status(400).json({ error: ge.message, field: ge.field, code: 'validation_error' })
      return
    }
    guestEmail = ge.value
  }

  let subtotalCents = 0
  let currency = 'NAD'
  for (const l of lines) {
    subtotalCents += l.unitPriceCents * l.quantity
    currency = l.currency
  }

  let shippingCents = shippingCentsForDelivery(subtotalCents, deliveryMethod)
  if (isHomeDeliveryMethod(deliveryMethod)) {
    const rawAreaId = typeof bodyObj.homeDeliveryAreaId === 'string' ? bodyObj.homeDeliveryAreaId.trim() : ''
    if (rawAreaId) {
      const area = await getHomeDeliveryAreaById(pool, rawAreaId)
      if (area) {
        let areaShipping = await shippingCentsForArea(pool, subtotalCents, rawAreaId)
        if (area.free_above_cents <= 0 && env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents) {
          areaShipping = 0
        }
        shippingCents = areaShipping
      }
    }
  }
  const taxCents = taxCentsForSubtotal(subtotalCents)

  /* Discount code (optional) */
  let discountCents = 0
  let discountCodeId: string | null = null
  const rawDiscountCode = typeof req.body?.discountCode === 'string' ? req.body.discountCode.trim() : ''
  if (rawDiscountCode) {
    const disc = await previewDiscountCode(pool, rawDiscountCode, subtotalCents)
    if ('error' in disc) {
      res.status(400).json({ error: disc.error, field: 'discountCode', code: 'discount_invalid' })
      return
    }
    discountCents = disc.discountCents
    discountCodeId = disc.discountCodeId
  }

  let orderId: string
  let totalCents: number
  let reference: string
  /*
   * Checkout uses a single SQL transaction inside createOrderFromCart (order + reserved stock + clear cart).
   * If anything fails, the transaction rolls back and the cart is unchanged.
   */
  try {
    const o = await createOrderFromCart(pool, cartId, {
      userId: checkoutSqlUserId ?? undefined,
      guestEmail,
      deliveryMethod,
      shippingAddressId,
      depositLocationId,
      subtotalCents,
      shippingCents,
      taxCents,
      discountCents,
      discountCodeId,
      checkoutIdempotencyKey,
      scheduling,
    })
    orderId = o.orderId
    totalCents = o.totalCents
    currency = o.currency
    if (discountCodeId) {
      try { await redeemDiscountCode(pool, discountCodeId) } catch { /* best-effort */ }
    }

    reference = `PTSTORE-${orderId}`
    const paymentIdemKey = crypto.randomUUID()
    await pool
      .request()
      .input('orderId', orderId)
      .input('status', 'pending')
      .input('key', paymentIdemKey)
      .input('ref', reference)
      .query(`
      INSERT INTO dbo.payments (order_id, status, idempotency_key, payment_reference) VALUES (@orderId, @status, @key, @ref)
    `)

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
    const uid = checkoutSqlUserId!
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
      discountCents: 0,
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
      userId: checkoutSqlUserId,
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
    try {
      await updatePaymentReference(pool, orderId, reference)
      await setPaymentProcessing(pool, orderId)
    } catch (e) {
      console.warn('[checkout] payment lifecycle update (run db:migrate 015?)', e)
    }
  } catch (e) {
    if (e instanceof CheckoutValidationError) {
      res.status(400).json({ error: e.message, field: e.field, code: 'validation_error' })
      return
    }
    if (e instanceof PayTodayPaymentIntentError) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    throw e
  }

  const channel = await resolveOutboxChannel(pool, checkoutSqlUserId, guestEmail, 'checkout_pending_payment')
  await enqueueNotification(pool, {
    userId: checkoutSqlUserId,
    email: guestEmail ?? req.user?.email ?? null,
    channel,
    templateKey: 'checkout_pending_payment',
    payload: JSON.stringify({ orderId, totalCents, currency }),
  })

  res.json({
    orderId,
    redirectUrl,
    payment_url: redirectUrl,
    reference,
    totalCents,
    currency,
    subtotalCents,
    shippingCents,
    taxCents,
    discountCents: 0,
  })
})
