import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  isPayTodayMerchantIdAllowedForScope,
  resolveAdminMerchantScopeFromRequest,
} from '../../lib/adminMerchantScope.js'
import {
  isUuidString,
  listInventoryOverview,
  listLowStockSkus,
  listRecentStockMovements,
  setVariantLowStockThreshold,
  setVariantWarehouseQuantityAdmin,
} from '../../repos/inventoryRepo.js'
import { lookupVariantPayTodayMerchantId } from '../../repos/productsRepo.js'
import type { Response } from 'express'
import type { ConnectionPool } from 'mssql'

async function requireAdminVariantMutationAccess(
  pool: ConnectionPool,
  variantId: string,
  scope: number[] | undefined,
  res: Response,
): Promise<boolean> {
  if (!scope?.length) return true
  const lu = await lookupVariantPayTodayMerchantId(pool, variantId)
  if (!lu.ok) return true
  if (!lu.exists) {
    res.status(404).json({ error: 'Variant not found' })
    return false
  }
  if (!isPayTodayMerchantIdAllowedForScope(scope, lu.payTodayMerchantId)) {
    res.status(403).json({ error: 'Not allowed to manage inventory for this product' })
    return false
  }
  return true
}

export const adminInventoryRouter = Router()
adminInventoryRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminInventoryRouter.get('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
    const items = await listInventoryOverview(pool, scope?.length ? { payTodayMerchantIds: scope } : undefined)
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'List failed' })
  }
})

adminInventoryRouter.get('/movements', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const lim = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40
  try {
    const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
    const items = await listRecentStockMovements(
      pool,
      lim,
      scope?.length ? { payTodayMerchantIds: scope } : undefined,
    )
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'List failed' })
  }
})

adminInventoryRouter.get('/low-stock', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
    const items = await listLowStockSkus(pool, scope?.length ? { payTodayMerchantIds: scope } : undefined)
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'List failed' })
  }
})

adminInventoryRouter.patch('/variants/:variantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const variantId = String(req.params.variantId ?? '')
  if (!isUuidString(variantId)) {
    res.status(400).json({ error: 'Invalid variant id' })
    return
  }
  if (!(await requireAdminVariantMutationAccess(pool, variantId, scope, res))) return

  const hasQty = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'quantityTarget')
  const hasTh = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'lowStockThreshold')

  if (!hasQty && !hasTh) {
    res.status(400).json({ error: 'Provide quantityTarget and/or lowStockThreshold' })
    return
  }

  try {
    if (hasTh) {
      const raw = (req.body as { lowStockThreshold?: unknown }).lowStockThreshold
      if (raw === null) {
        await setVariantLowStockThreshold(pool, variantId, null)
      } else {
        const th = Number(raw)
        if (raw === undefined || !Number.isFinite(th) || !Number.isInteger(th) || th < 0) {
          res.status(400).json({ error: 'lowStockThreshold must be null or a non-negative integer' })
          return
        }
        await setVariantLowStockThreshold(pool, variantId, th)
      }
    }
    if (hasQty) {
      const q = Number((req.body as { quantityTarget?: unknown }).quantityTarget)
      await setVariantWarehouseQuantityAdmin(pool, variantId, q)
    }
    const items = await listInventoryOverview(pool, scope?.length ? { payTodayMerchantIds: scope } : undefined)
    const row = items.find((i) => i.variantId.toLowerCase() === variantId.toLowerCase())
    res.json({ ok: true, variant: row ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Variant not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})
