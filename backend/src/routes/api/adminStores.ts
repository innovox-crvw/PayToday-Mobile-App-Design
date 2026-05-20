import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { resolveAdminMerchantScopeFromRequest, isPayTodayMerchantIdAllowedForScope } from '../../lib/adminMerchantScope.js'
import {
  getAdminCatalogStoreDetail,
  listAdminCatalogStores,
  updateAdminCatalogStore,
} from '../../repos/adminStoresRepo.js'

export const adminStoresRouter = Router()
adminStoresRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminStoresRouter.get('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  try {
    const items = await listAdminCatalogStores(pool, scope)
    res.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg })
  }
})

adminStoresRouter.get('/:merchantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  if (!isPayTodayMerchantIdAllowedForScope(scope, merchantId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  try {
    const store = await getAdminCatalogStoreDetail(pool, merchantId)
    if (!store) {
      res.status(404).json({ error: 'Store not found or has no catalogue products' })
      return
    }
    res.json({ store })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg })
  }
})

adminStoresRouter.patch('/:merchantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  if (!isPayTodayMerchantIdAllowedForScope(scope, merchantId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateAdminCatalogStore>[2] = {}
  if (typeof body.name === 'string') patch.name = body.name
  if (body.addressLine1 === null || typeof body.addressLine1 === 'string') patch.addressLine1 = body.addressLine1 as string | null
  if (body.addressLine2 === null || typeof body.addressLine2 === 'string') patch.addressLine2 = body.addressLine2 as string | null
  if (body.town === null || typeof body.town === 'string') patch.town = body.town as string | null
  if (body.zipcode === null || typeof body.zipcode === 'string') patch.zipcode = body.zipcode as string | null
  if (body.contactNumber === null || typeof body.contactNumber === 'string') {
    patch.contactNumber = body.contactNumber as string | null
  }
  if (body.businessEmailAddress === null || typeof body.businessEmailAddress === 'string') {
    patch.businessEmailAddress = body.businessEmailAddress as string | null
  }
  if (body.description === null || typeof body.description === 'string') patch.description = body.description as string | null

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No fields to update' })
    return
  }

  try {
    await updateAdminCatalogStore(pool, merchantId, patch)
    const store = await getAdminCatalogStoreDetail(pool, merchantId)
    res.json({ ok: true, store })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(400).json({ error: msg })
  }
})
