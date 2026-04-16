import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { createProductSimple, listProducts } from '../../repos/productsRepo.js'

export const adminProductsRouter = Router()
adminProductsRouter.use(requireAuth, requireRole('admin', 'ops'))

adminProductsRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const items = await listProducts(pool)
  res.json({ items })
})

adminProductsRouter.post('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const slug = typeof req.body?.slug === 'string' ? req.body.slug : ''
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const description = typeof req.body?.description === 'string' ? req.body.description : ''
  const sku = typeof req.body?.sku === 'string' ? req.body.sku : ''
  const variantName = typeof req.body?.variantName === 'string' ? req.body.variantName : 'Default'
  const priceCents = Number(req.body?.priceCents ?? NaN)
  const currency = typeof req.body?.currency === 'string' ? req.body.currency : 'NAD'
  const initialStock = Number(req.body?.initialStock ?? 0)
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : null
  const brandSlug = typeof req.body?.brandSlug === 'string' ? req.body.brandSlug.trim() : null
  const brandName = typeof req.body?.brandName === 'string' ? req.body.brandName.trim() : null
  if (!slug || !name || !sku || !Number.isFinite(priceCents)) {
    res.status(400).json({ error: 'slug, name, sku, priceCents required' })
    return
  }
  try {
    const ids = await createProductSimple(pool, {
      slug,
      name,
      description,
      categoryId,
      brandSlug: brandSlug || null,
      brandName: brandName || null,
      sku,
      variantName,
      priceCents,
      currency,
      initialStock: Number.isFinite(initialStock) ? initialStock : 0,
    })
    res.status(201).json(ids)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})
