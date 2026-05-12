import { Router, type Response } from 'express'
import { env } from '../../config/env.js'
import { getLastSqlConnectError, getSqlPool } from '../../db/pool.js'
import { listProducts, getProductBySlug, type ListProductsOptions } from '../../repos/productsRepo.js'
import { sessionIsAdultForLiquor } from '../../services/liquorAgeService.js'

export const productsRouter = Router()

function parseSort(q: unknown): ListProductsOptions['sort'] {
  if (q === 'price_asc' || q === 'price_desc' || q === 'name') return q
  return 'name'
}

function noDatabaseResponse(res: Response, single: boolean) {
  const wantsSql = Boolean(env.sqlConnectionString?.trim())
  const hint = getLastSqlConnectError()
  const msg = wantsSql
    ? 'Database is configured but not reachable; products are unavailable until SQL connects.'
    : 'No database configured. Set SQL_CONNECTION_STRING (or SQL_SERVER + SQL_DATABASE) in .env, then run npm run db:setup (creates DB + migrations).'
  const detail = wantsSql && env.nodeEnv === 'development' && hint ? hint : undefined
  if (single) {
    return res.status(503).json({ error: msg, ...(detail ? { detail } : {}) })
  }
  return res.status(503).json({
    error: msg,
    ...(detail ? { detail } : {}),
    source: 'none',
    items: [] as [],
  })
}

productsRouter.get('/', async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  const q = typeof req.query.q === 'string' ? req.query.q : undefined
  const categorySlug = typeof req.query.category === 'string' ? req.query.category : undefined
  const brandSlug = typeof req.query.brand === 'string' ? req.query.brand : undefined
  const sort = parseSort(req.query.sort)
  const includeImages =
    String(req.query.includeImages ?? '').trim() === '1' || String(req.query.includeGallery ?? '').trim() === '1'

  const listOpts: ListProductsOptions = { search: q, categorySlug, brandSlug, sort, includeImages }

  if (!pool) {
    return noDatabaseResponse(res, false)
  }
  try {
    let items = await listProducts(pool, listOpts)
    if (env.liquorGatingEnabled) {
      const adult = await sessionIsAdultForLiquor(pool, req.user?.sub)
      if (!adult) {
        items = items.filter((p) => !p.containsAlcohol)
      }
    }
    res.json({ source: 'database', items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[products] listProducts failed:', msg)
    const hint =
      /contains_alcohol/i.test(msg) || /merchant_operating_hours/i.test(msg)
        ? 'Run pending SQL migrations: from the backend folder, `npm run db:migrate` (uses SQL_CONNECTION_STRING). Or execute the matching files under backend/migrations/ in SSMS (e.g. 053 for products.contains_alcohol).'
        : undefined
    res.status(503).json({
      error: 'Could not load products from the database. Check tables, permissions, and connection string.',
      detail: process.env.NODE_ENV === 'development' ? msg : undefined,
      ...(hint ? { hint } : {}),
      source: 'database',
      items: [],
    })
  }
})

productsRouter.get('/:slug', async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool) {
    return noDatabaseResponse(res, true)
  }
  try {
    const p = await getProductBySlug(pool, req.params.slug)
    if (!p) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (env.liquorGatingEnabled && p.containsAlcohol) {
      const adult = await sessionIsAdultForLiquor(pool, req.user?.sub)
      if (!adult) {
        res.status(403).json({ error: 'Age-restricted product', code: 'liquor_restricted' })
        return
      }
    }
    res.json(p)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[products] getProductBySlug failed:', msg)
    const hint =
      /contains_alcohol/i.test(msg) || /merchant_operating_hours/i.test(msg)
        ? 'Run pending SQL migrations: from the backend folder, `npm run db:migrate`, or apply backend/migrations/053_merchant_hours_and_alcohol_flag.sql in SSMS.'
        : undefined
    res.status(503).json({
      error: 'Could not load product from the database.',
      detail: process.env.NODE_ENV === 'development' ? msg : undefined,
      ...(hint ? { hint } : {}),
    })
  }
})
