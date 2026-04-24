import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { isUuidString } from '../../repos/inventoryRepo.js'
import { createCategory, listCategories, updateCategory } from '../../repos/categoriesRepo.js'

export const adminCategoriesRouter = Router()
adminCategoriesRouter.use(requireAuth, requireRole('admin', 'ops'))

adminCategoriesRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const items = await listCategories(pool, { includeInactive: true })
  res.json({ items })
})

adminCategoriesRouter.post('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const slug = typeof req.body?.slug === 'string' ? req.body.slug : ''
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const parentId = typeof req.body?.parentId === 'string' && req.body.parentId.trim() ? req.body.parentId.trim() : null
  const sortOrder = Number(req.body?.sortOrder ?? 0)
  const rawIcon = (req.body as Record<string, unknown> | undefined)?.iconKey
  const iconKey = rawIcon === null ? null : typeof rawIcon === 'string' ? rawIcon : undefined
  if (!slug.trim() || !name.trim()) {
    res.status(400).json({ error: 'slug and name required' })
    return
  }
  try {
    const id = await createCategory(pool, { slug, name, parentId, sortOrder, iconKey })
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

adminCategoriesRouter.patch('/:categoryId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const categoryId = String(req.params.categoryId ?? '')
  if (!isUuidString(categoryId)) {
    res.status(400).json({ error: 'Invalid category id' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateCategory>[2] = {}
  if (Object.prototype.hasOwnProperty.call(body, 'slug') && typeof body.slug === 'string') {
    patch.slug = body.slug
  }
  if (Object.prototype.hasOwnProperty.call(body, 'name') && typeof body.name === 'string') {
    patch.name = body.name
  }
  if (Object.prototype.hasOwnProperty.call(body, 'parentId')) {
    patch.parentId = typeof body.parentId === 'string' && body.parentId.trim() ? body.parentId.trim() : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sortOrder')) {
    patch.sortOrder = Number(body.sortOrder)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    patch.isActive = Boolean(body.isActive)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'iconKey')) {
    patch.iconKey = body.iconKey === null ? null : typeof body.iconKey === 'string' ? body.iconKey : undefined
  }
  try {
    await updateCategory(pool, categoryId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Category not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})
