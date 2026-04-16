import { Router } from 'express'
import { env } from '../../config/env.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import { mergePayTodayRuntime } from '../../services/integrationRuntimeConfig.js'
import { sqlErrorMentionsInvalidColumn, sqlErrorMentionsMissingObject } from '../../db/sqlDriverError.js'
import { getSqlPool } from '../../db/pool.js'
import { listCategories } from '../../repos/categoriesRepo.js'
import { staticHubPaymentCategoryItems } from '../../data/staticHubPaymentCategoryItems.js'
import { listHubPaymentCategoryItems } from '../../repos/hubPaymentCategoryItemsRepo.js'
import { listHubNavigationTiles } from '../../repos/hubNavigationTilesRepo.js'
import { listActivePromotions, type StorePromotionDto } from '../../repos/promotionsRepo.js'

export const storefrontPublicRouter = Router()

const HERO_IMG = {
  welcome:
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80',
  pickup:
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80',
  secure:
    'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1400&q=80',
} as const

const STATIC_PROMOTIONS: StorePromotionDto[] = [
  {
    id: 'static-welcome',
    slug: 'welcome',
    title: 'Deals near you',
    subtitle: 'Pay with PayToday in one tap.',
    imageUrl: HERO_IMG.welcome,
    linkPath: '/shop',
    sortOrder: 0,
  },
  {
    id: 'static-pickup',
    slug: 'pickup',
    title: 'Store pickup',
    subtitle: 'Order online, collect at a pickup point.',
    imageUrl: HERO_IMG.pickup,
    linkPath: '/shop',
    sortOrder: 1,
  },
  {
    id: 'static-secure',
    slug: 'secure',
    title: 'Secure payments',
    subtitle: 'Your wallet, your way.',
    imageUrl: HERO_IMG.secure,
    linkPath: '/wallet',
    sortOrder: 2,
  },
]

storefrontPublicRouter.get('/storefront-config', async (_req, res) => {
  const pool = await getSqlPool({ eager: true })
  const pt = mergePayTodayRuntime(await getIntegrationSettingsMap(pool))
  res.json({
    shippingFlatCents: env.shippingFlatCents,
    shippingFreeSubtotalCents: env.shippingFreeSubtotalCents,
    vatRateBps: env.vatRateBps,
    scanApiConfigured: Boolean(pt.scanApiBaseUrl),
    checkoutRequireSignIn: env.checkoutRequireSignIn,
  })
})

storefrontPublicRouter.get('/categories', async (_req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool) {
    res.json({ source: 'off', items: [] })
    return
  }
  try {
    const items = await listCategories(pool)
    res.json({ source: 'database', items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[categories] list failed:', msg)
    res.json({ source: 'error', items: [], detail: process.env.NODE_ENV === 'development' ? msg : undefined })
  }
})

storefrontPublicRouter.get('/hub/navigation-tiles', async (req, res) => {
  const raw = typeof req.query.kind === 'string' ? req.query.kind.trim().toLowerCase() : ''
  if (raw !== 'payments' && raw !== 'services') {
    res.status(400).json({ error: 'Query parameter kind is required: payments or services.' })
    return
  }
  const pool = await getSqlPool({ eager: true })
  if (!pool) {
    res.json({ source: 'off', items: [] })
    return
  }
  try {
    const items = await listHubNavigationTiles(pool, raw)
    res.json({ source: 'database', items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      sqlErrorMentionsMissingObject(e, 'hub_navigation_tiles') ||
      sqlErrorMentionsInvalidColumn(e, 'payment_methods_caption')
    ) {
      console.info(
        '[hub/navigation-tiles] Hub tiles unavailable (table missing or migration 003 not applied) — using static tiles. Scripts: paytoday-add-hub-navigation-tiles.sql, then npm run db:migrate',
      )
      res.json({ source: 'off', items: [] })
      return
    }
    console.error('[hub/navigation-tiles] list failed:', msg)
    res.json({ source: 'error', items: [], detail: process.env.NODE_ENV === 'development' ? msg : undefined })
  }
})

storefrontPublicRouter.get('/hub/payment-category-items', async (req, res) => {
  const category =
    typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : ''
  if (!category || !/^[a-z][a-z0-9-]{0,79}$/u.test(category)) {
    res.status(400).json({ error: 'Query parameter category is required (slug, e.g. businesses, airtime).' })
    return
  }
  const pool = await getSqlPool({ eager: true })
  if (!pool) {
    res.json({ source: 'static', items: staticHubPaymentCategoryItems(category) })
    return
  }
  try {
    const items = await listHubPaymentCategoryItems(pool, category)
    res.json({ source: 'database', items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const fallback = staticHubPaymentCategoryItems(category)
    if (
      fallback.length > 0 &&
      (sqlErrorMentionsMissingObject(e, 'hub_payment_category_items') ||
        sqlErrorMentionsInvalidColumn(e, 'payment_method'))
    ) {
      console.info(
        '[hub/payment-category-items] Hub list unavailable (table missing or migration 003 not applied) — using static demo rows.',
      )
      res.json({ source: 'static', items: fallback })
      return
    }
    console.error('[hub/payment-category-items] list failed:', msg)
    if (fallback.length > 0) {
      res.json({
        source: 'static',
        items: fallback,
        detail: process.env.NODE_ENV === 'development' ? msg : undefined,
      })
      return
    }
    res.json({ source: 'error', items: [], detail: process.env.NODE_ENV === 'development' ? msg : undefined })
  }
})

storefrontPublicRouter.get('/promotions', async (_req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool) {
    res.json({ source: 'static', items: STATIC_PROMOTIONS })
    return
  }
  try {
    const items = await listActivePromotions(pool)
    res.json({ source: 'database', items: items.length ? items : STATIC_PROMOTIONS })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[promotions] list failed:', msg)
    res.json({ source: 'fallback', items: STATIC_PROMOTIONS })
  }
})
