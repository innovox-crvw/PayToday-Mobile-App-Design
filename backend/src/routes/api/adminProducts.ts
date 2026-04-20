import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { isUuidString } from '../../repos/inventoryRepo.js'
import {
  createProductSimple,
  insertProductImage,
  listProductsAdmin,
  normalizeInventoryPolicy,
  updateProductAdmin,
  updateVariantAdmin,
} from '../../repos/productsRepo.js'

export const adminProductsRouter = Router()
adminProductsRouter.use(requireAuth, requireRole('admin', 'ops'))

adminProductsRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const items = await listProductsAdmin(pool)
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
  const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : null
  const compareRaw = req.body?.compareAtPriceCents
  const compareAtPriceCents =
    compareRaw === null || compareRaw === undefined || compareRaw === ''
      ? null
      : Number(compareRaw)
  const inventoryPolicy =
    typeof req.body?.inventoryPolicy === 'string' ? normalizeInventoryPolicy(req.body.inventoryPolicy) : undefined
  let variantOptions: { name: string; value: string }[] | undefined
  if (Array.isArray(req.body?.variantOptions)) {
    variantOptions = (req.body.variantOptions as unknown[])
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const o = row as Record<string, unknown>
        const n = typeof o.name === 'string' ? o.name : ''
        const v = typeof o.value === 'string' ? o.value : ''
        return n.trim() && v.trim() ? { name: n.trim(), value: v.trim() } : null
      })
      .filter((x): x is { name: string; value: string } => Boolean(x))
  }
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
      imageUrl: imageUrl || null,
      compareAtPriceCents:
        compareAtPriceCents != null && Number.isFinite(compareAtPriceCents) && Number.isInteger(compareAtPriceCents)
          ? compareAtPriceCents
          : null,
      inventoryPolicy,
      variantOptions,
    })
    res.status(201).json(ids)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

adminProductsRouter.patch('/:productId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const productId = String(req.params.productId ?? '')
  if (!isUuidString(productId)) {
    res.status(400).json({ error: 'Invalid product id' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateProductAdmin>[2] = {}
  if (Object.prototype.hasOwnProperty.call(body, 'name') && typeof body.name === 'string') {
    patch.name = body.name
  }
  if (Object.prototype.hasOwnProperty.call(body, 'slug') && typeof body.slug === 'string') {
    patch.slug = body.slug
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    patch.description = typeof body.description === 'string' ? body.description : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    patch.isActive = Boolean(body.isActive)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
    patch.categoryId = typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : null
  }
  try {
    await updateProductAdmin(pool, productId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Product not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminProductsRouter.patch('/:productId/variants/:variantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const productId = String(req.params.productId ?? '')
  const variantId = String(req.params.variantId ?? '')
  if (!isUuidString(productId) || !isUuidString(variantId)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateVariantAdmin>[3] = {}
  if (Object.prototype.hasOwnProperty.call(body, 'sku') && typeof body.sku === 'string') {
    patch.sku = body.sku
  }
  if (Object.prototype.hasOwnProperty.call(body, 'variantName') && typeof body.variantName === 'string') {
    patch.variantName = body.variantName
  }
  if (Object.prototype.hasOwnProperty.call(body, 'priceCents')) {
    patch.priceCents = Number(body.priceCents)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'currency') && typeof body.currency === 'string') {
    patch.currency = body.currency
  }
  if (Object.prototype.hasOwnProperty.call(body, 'compareAtPriceCents')) {
    const c = body.compareAtPriceCents
    patch.compareAtPriceCents =
      c === null ? null : typeof c === 'number' ? c : typeof c === 'string' && c.trim() ? Number(c) : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'inventoryPolicy') && typeof body.inventoryPolicy === 'string') {
    patch.inventoryPolicy = normalizeInventoryPolicy(body.inventoryPolicy)
  }
  if (Array.isArray(body?.variantOptions)) {
    patch.options = (body.variantOptions as unknown[])
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const o = row as Record<string, unknown>
        const n = typeof o.name === 'string' ? o.name : ''
        const v = typeof o.value === 'string' ? o.value : ''
        return n.trim() && v.trim() ? { name: n.trim(), value: v.trim() } : null
      })
      .filter((x): x is { name: string; value: string } => Boolean(x))
  }
  try {
    await updateVariantAdmin(pool, productId, variantId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Variant not found for product') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminProductsRouter.post('/:productId/images', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const productId = String(req.params.productId ?? '')
  if (!isUuidString(productId)) {
    res.status(400).json({ error: 'Invalid product id' })
    return
  }
  const url = typeof req.body?.url === 'string' ? req.body.url : ''
  const sortOrder = Number(req.body?.sortOrder ?? 0)
  const variantId =
    typeof req.body?.variantId === 'string' && req.body.variantId.trim() && isUuidString(req.body.variantId.trim())
      ? req.body.variantId.trim()
      : null
  try {
    const chk = await pool.request().input('id', productId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.products WHERE id = @id`)
    if (Number(chk.recordset[0]?.c ?? 0) === 0) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    if (variantId) {
      const vchk = await pool
        .request()
        .input('pid', productId)
        .input('vid', variantId)
        .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_variants WHERE id = @vid AND product_id = @pid`)
      if (Number(vchk.recordset[0]?.c ?? 0) === 0) {
        res.status(400).json({ error: 'variantId does not belong to this product' })
        return
      }
    }
    await insertProductImage(pool, productId, url, sortOrder, variantId)
    res.status(201).json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Insert failed' })
  }
})
