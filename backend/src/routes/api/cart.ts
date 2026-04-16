import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth } from '../../middleware/auth.js'
import { CART_COOKIE, getCartLines, getOrCreateCartId, upsertCartLine } from '../../services/cartService.js'
import {
  ensureMemoryCartSession,
  getMemoryCartLines,
  upsertMemoryCartLine,
} from '../../services/memoryCart.js'
import { env } from '../../config/env.js'
import { shippingCentsForDelivery, taxCentsForSubtotal } from '../../services/shipping.js'

export const cartRouter = Router()
cartRouter.use(optionalAuth)

function buildTotalsPreview(items: { unitPriceCents: number; quantity: number; currency: string }[]) {
  let subtotalCents = 0
  let currency = 'NAD'
  for (const l of items) {
    subtotalCents += l.unitPriceCents * l.quantity
    currency = l.currency
  }
  const shippingCentsHome = shippingCentsForDelivery(subtotalCents, 'home')
  const taxCents = taxCentsForSubtotal(subtotalCents)
  return {
    subtotalCents,
    currency,
    shippingCentsHome,
    shippingCentsPickup: 0,
    taxCents,
    totalHomeCents: subtotalCents + shippingCentsHome + taxCents,
    totalPickupCents: subtotalCents + taxCents,
    freeShippingThresholdCents: env.shippingFreeSubtotalCents,
    qualifiesFreeShippingHome:
      env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents,
    flatShippingCents: env.shippingFlatCents,
  }
}

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: env.nodeEnv === 'production',
    maxAge: 60 * 24 * 60 * 60 * 1000,
  }
}

cartRouter.get('/', async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  const sessionToken = req.cookies[CART_COOKIE] as string | undefined
  const wantPreview = req.query.preview === '1' || req.query.preview === 'true'
  if (!pool) {
    const { sessionToken: st, cartId } = ensureMemoryCartSession(sessionToken)
    res.cookie(CART_COOKIE, st, cookieOpts())
    const items = getMemoryCartLines(st)
    res.json({
      cartId,
      items,
      source: 'memory',
      ...(wantPreview ? { totalsPreview: buildTotalsPreview(items) } : {}),
    })
    return
  }
  const { cartId, sessionToken: newToken } = await getOrCreateCartId(pool, sessionToken, req.user?.sub)
  res.cookie(CART_COOKIE, newToken, cookieOpts())
  const items = await getCartLines(pool, cartId)
  res.json({
    cartId,
    items,
    ...(wantPreview ? { totalsPreview: buildTotalsPreview(items) } : {}),
  })
})

cartRouter.post('/items', async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  const variantId = typeof req.body?.variantId === 'string' ? req.body.variantId : ''
  const quantity = Number(req.body?.quantity ?? 0)
  if (!variantId || !Number.isFinite(quantity)) {
    res.status(400).json({ error: 'variantId and quantity required' })
    return
  }
  const sessionToken = req.cookies[CART_COOKIE] as string | undefined
  if (!pool) {
    const { sessionToken: st, cartId } = ensureMemoryCartSession(sessionToken)
    if (!upsertMemoryCartLine(st, variantId, quantity)) {
      res.status(400).json({ error: 'Unknown variant (memory cart only includes demo catalogue)' })
      return
    }
    res.cookie(CART_COOKIE, st, cookieOpts())
    res.json({ cartId, items: getMemoryCartLines(st), source: 'memory' })
    return
  }
  const { cartId, sessionToken: newToken } = await getOrCreateCartId(pool, sessionToken, req.user?.sub)
  res.cookie(CART_COOKIE, newToken, cookieOpts())
  try {
    await upsertCartLine(pool, cartId, variantId, quantity)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cart update failed'
    res.status(400).json({ error: msg })
    return
  }
  const items = await getCartLines(pool, cartId)
  res.json({ cartId, items })
})

cartRouter.delete('/items/:variantId', async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  const sessionToken = req.cookies[CART_COOKIE] as string | undefined
  if (!pool) {
    const { sessionToken: st, cartId } = ensureMemoryCartSession(sessionToken)
    upsertMemoryCartLine(st, req.params.variantId, 0)
    res.cookie(CART_COOKIE, st, cookieOpts())
    res.json({ cartId, items: getMemoryCartLines(st), source: 'memory' })
    return
  }
  const { cartId, sessionToken: newToken } = await getOrCreateCartId(pool, sessionToken, req.user?.sub)
  res.cookie(CART_COOKIE, newToken, cookieOpts())
  await upsertCartLine(pool, cartId, req.params.variantId, 0)
  const items = await getCartLines(pool, cartId)
  res.json({ cartId, items })
})
