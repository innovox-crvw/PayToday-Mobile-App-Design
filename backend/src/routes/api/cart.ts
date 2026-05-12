import type { ConnectionPool } from 'mssql'
import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth } from '../../middleware/auth.js'
import { CART_COOKIE, clearCartLines, getCartLines, getOrCreateCartId, upsertCartLine } from '../../services/cartService.js'
import {
  clearMemoryCartLines,
  ensureMemoryCartSession,
  getMemoryCartLines,
  upsertMemoryCartLine,
} from '../../services/memoryCart.js'
import { env } from '../../config/env.js'
import { shippingCentsForDelivery, taxCentsForSubtotal } from '../../services/shipping.js'
import { sessionIsAdultForLiquor } from '../../services/liquorAgeService.js'
import { getLiquorCheckoutPreview } from '../../services/merchantHoursService.js'
import { getHomeDeliveryAreaById, shippingCentsForArea } from '../../repos/homeDeliveryRepo.js'

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
    discountCents: 0,
    totalHomeCents: subtotalCents + shippingCentsHome + taxCents,
    totalPickupCents: subtotalCents + taxCents,
    freeShippingThresholdCents: env.shippingFreeSubtotalCents,
    qualifiesFreeShippingHome:
      env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents,
    flatShippingCents: env.shippingFlatCents,
  }
}

async function buildTotalsPreviewAsync(
  pool: ConnectionPool,
  items: { unitPriceCents: number; quantity: number; currency: string }[],
  homeDeliveryAreaId?: string,
) {
  let subtotalCents = 0
  let currency = 'NAD'
  for (const l of items) {
    subtotalCents += l.unitPriceCents * l.quantity
    currency = l.currency
  }
  const taxCents = taxCentsForSubtotal(subtotalCents)
  const trimmed = typeof homeDeliveryAreaId === 'string' ? homeDeliveryAreaId.trim() : ''
  let shippingCentsHome = shippingCentsForDelivery(subtotalCents, 'home')
  let freeShippingThresholdCents = env.shippingFreeSubtotalCents
  let flatShippingCents = env.shippingFlatCents

  if (trimmed) {
    const area = await getHomeDeliveryAreaById(pool, trimmed)
    if (area) {
      let areaShipping = await shippingCentsForArea(pool, subtotalCents, trimmed)
      if (area.free_above_cents <= 0 && env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents) {
        areaShipping = 0
      }
      shippingCentsHome = areaShipping
      flatShippingCents = area.home_flat_cents
      freeShippingThresholdCents =
        area.free_above_cents > 0 ? area.free_above_cents : env.shippingFreeSubtotalCents
    }
  }

  const qualifiesFreeShippingHome =
    freeShippingThresholdCents > 0 && subtotalCents >= freeShippingThresholdCents

  return {
    subtotalCents,
    currency,
    shippingCentsHome,
    shippingCentsPickup: 0,
    taxCents,
    discountCents: 0,
    totalHomeCents: subtotalCents + shippingCentsHome + taxCents,
    totalPickupCents: subtotalCents + taxCents,
    freeShippingThresholdCents,
    qualifiesFreeShippingHome,
    flatShippingCents,
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
  const homeDeliveryAreaId =
    typeof req.query.homeDeliveryAreaId === 'string' ? req.query.homeDeliveryAreaId : undefined
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
  let liquorExtra: { liquorCheckout: Awaited<ReturnType<typeof getLiquorCheckoutPreview>> } | Record<string, never> = {}
  if (wantPreview) {
    try {
      liquorExtra = { liquorCheckout: await getLiquorCheckoutPreview(pool, cartId) }
    } catch {
      liquorExtra = {
        liquorCheckout: { hasAlcohol: false, outsideLiquorSellingWindow: false, requiresDeliveryTime: false },
      }
    }
  }
  const totalsPreview = wantPreview ? await buildTotalsPreviewAsync(pool, items, homeDeliveryAreaId) : undefined
  res.json({
    cartId,
    items,
    ...(wantPreview ? { totalsPreview, ...liquorExtra } : {}),
  })
})

cartRouter.delete('/', async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  const sessionToken = req.cookies[CART_COOKIE] as string | undefined
  if (!pool) {
    const { sessionToken: st, cartId } = ensureMemoryCartSession(sessionToken)
    clearMemoryCartLines(st)
    res.cookie(CART_COOKIE, st, cookieOpts())
    res.json({ cartId, items: getMemoryCartLines(st), source: 'memory' })
    return
  }
  const { cartId, sessionToken: newToken } = await getOrCreateCartId(pool, sessionToken, req.user?.sub)
  res.cookie(CART_COOKIE, newToken, cookieOpts())
  await clearCartLines(pool, cartId)
  const items = await getCartLines(pool, cartId)
  res.json({ cartId, items })
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
  if (env.liquorGatingEnabled && quantity > 0) {
    const alc = await pool
      .request()
      .input('vid', variantId)
      .query<{ c: number }>(`
        SELECT CAST(ISNULL(p.contains_alcohol, 0) AS INT) AS c
        FROM dbo.product_variants v
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE v.id = @vid
      `)
    if (Number(alc.recordset[0]?.c ?? 0) === 1) {
      const ok = await sessionIsAdultForLiquor(pool, req.user?.sub)
      if (!ok) {
        res.status(403).json({ error: 'Sign in and add your date of birth (18+) to add alcohol to your cart.', code: 'liquor_restricted' })
        return
      }
    }
  }
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
