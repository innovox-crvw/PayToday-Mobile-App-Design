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
import { variantIsAgeRestrictedForLiquorGate } from '../../services/ageRestrictedCategoryService.js'
import { getLiquorCheckoutPreview, getStoreCheckoutPreview } from '../../services/merchantHoursService.js'
import { getCartStorePickupStores } from '../../services/cartPickupStoresService.js'
import {
  getHomeDeliveryAreaById,
  homeDeliveryFlatFeeCents,
  homeDeliveryShippingCentsForSubtotal,
  shippingCentsForArea,
  syntheticDemoHomeAreaFromRef,
} from '../../repos/homeDeliveryRepo.js'
import { evaluateCartPaymentPlanEligibility } from '../../lib/categoryPaymentPlanEligibility.js'
import { listCategories } from '../../repos/categoriesRepo.js'


export const cartRouter = Router()
cartRouter.use(optionalAuth)

/** Fields shared before discount + grand totals (tax on pre-discount subtotal — matches checkout). */
type CartPreviewCore = {
  subtotalCents: number
  currency: string
  shippingCentsHome: number
  shippingCentsPickup: number
  shippingCentsExpress: number | null
  taxCents: number
  freeShippingThresholdCents: number
  qualifiesFreeShippingHome: boolean
  flatShippingCents: number
}

function expressShippingOrNull(): number | null {
  return env.shippingExpressCents > 0 ? env.shippingExpressCents : null
}

/** VAT on line subtotal only; discount applied after tax in order total (same as `createOrderFromCart`). */
function finalizePreview(core: CartPreviewCore, discountCents: number) {
  const d = Math.max(0, Math.min(discountCents, core.subtotalCents))
  return {
    ...core,
    discountCents: d,
    totalHomeCents: core.subtotalCents + core.shippingCentsHome + core.taxCents - d,
    totalPickupCents: core.subtotalCents + core.taxCents - d,
  }
}

function buildTotalsPreviewCore(items: { unitPriceCents: number; quantity: number; currency: string }[]): CartPreviewCore {
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
    shippingCentsExpress: expressShippingOrNull(),
    taxCents,
    freeShippingThresholdCents: env.shippingFreeSubtotalCents,
    qualifiesFreeShippingHome:
      env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents,
    flatShippingCents: env.shippingFlatCents,
  }
}

async function buildTotalsPreviewCoreAsync(
  pool: ConnectionPool,
  items: { unitPriceCents: number; quantity: number; currency: string }[],
  homeDeliveryAreaId?: string,
): Promise<CartPreviewCore> {
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
      flatShippingCents = homeDeliveryFlatFeeCents(area)
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
    shippingCentsExpress: expressShippingOrNull(),
    taxCents,
    freeShippingThresholdCents,
    qualifiesFreeShippingHome,
    flatShippingCents,
  }
}

/** Cart preview when SQL pool is off (memory cart) — still honour `homeDeliveryAreaId` for Windhoek demo refs. */
function buildTotalsPreviewMemoryCore(
  items: { unitPriceCents: number; quantity: number; currency: string }[],
  homeDeliveryAreaId?: string,
): CartPreviewCore {
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
    const area = syntheticDemoHomeAreaFromRef(trimmed)
    if (area) {
      let areaShipping = homeDeliveryShippingCentsForSubtotal(area, subtotalCents)
      if (area.free_above_cents <= 0 && env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents) {
        areaShipping = 0
      }
      shippingCentsHome = areaShipping
      flatShippingCents = homeDeliveryFlatFeeCents(area)
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
    shippingCentsExpress: expressShippingOrNull(),
    taxCents,
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
    const previewCore = wantPreview
      ? homeDeliveryAreaId
        ? buildTotalsPreviewMemoryCore(items, homeDeliveryAreaId)
        : buildTotalsPreviewCore(items)
      : undefined
    const totalsPreview = previewCore ? finalizePreview(previewCore, 0) : undefined
    res.json({
      cartId,
      items,
      source: 'memory',
      ...(wantPreview ? { totalsPreview, discountCents: 0 } : {}),
    })
    return
  }
  const { cartId, sessionToken: newToken } = await getOrCreateCartId(pool, sessionToken, req.user?.sub)
  res.cookie(CART_COOKIE, newToken, cookieOpts())
  const items = await getCartLines(pool, cartId)

  let liquorExtra: {
    liquorCheckout: Awaited<ReturnType<typeof getLiquorCheckoutPreview>>
    storeCheckout: Awaited<ReturnType<typeof getStoreCheckoutPreview>>
  } | Record<string, never> = {}
  if (wantPreview) {
    try {
      liquorExtra = {
        liquorCheckout: await getLiquorCheckoutPreview(pool, cartId),
        storeCheckout: await getStoreCheckoutPreview(pool, cartId),
      }
    } catch {
      liquorExtra = {
        liquorCheckout: { hasAlcohol: false, outsideLiquorSellingWindow: false, requiresDeliveryTime: false },
        storeCheckout: { outsideStoreHours: false, requiresScheduledTime: false },
      }
    }
  }
  const previewCore = wantPreview ? await buildTotalsPreviewCoreAsync(pool, items, homeDeliveryAreaId) : undefined
  const totalsPreview = previewCore ? finalizePreview(previewCore, 0) : undefined
  let paymentPlanPreview: ReturnType<typeof evaluateCartPaymentPlanEligibility> | undefined
  if (wantPreview && previewCore) {
    const categories = await listCategories(pool, { includeInactive: true })
    paymentPlanPreview = evaluateCartPaymentPlanEligibility(items, categories, previewCore.subtotalCents)
  }
  let storePickupStores: Awaited<ReturnType<typeof getCartStorePickupStores>> | undefined
  if (wantPreview && items.length > 0) {
    try {
      storePickupStores = await getCartStorePickupStores(pool, cartId)
    } catch {
      storePickupStores = []
    }
  }
  res.json({
    cartId,
    items,
    ...(wantPreview
      ? {
          totalsPreview,
          discountCents: 0,
          paymentPlanPreview,
          storePickupStores,
          ...liquorExtra,
        }
      : {}),
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
    const restricted = await variantIsAgeRestrictedForLiquorGate(pool, variantId)
    if (restricted) {
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
