import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  isUuidString,
  listInventoryOverview,
  listRecentStockMovements,
  setVariantLowStockThreshold,
  setVariantWarehouseQuantityAdmin,
} from '../../repos/inventoryRepo.js'

export const adminInventoryRouter = Router()
adminInventoryRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminInventoryRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    const items = await listInventoryOverview(pool)
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
    const items = await listRecentStockMovements(pool, lim)
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'List failed' })
  }
})

adminInventoryRouter.get('/low-stock', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const r = await pool.request().query<{
    sku: string
    product_name: string
    quantity: number
    low_stock_threshold: number | null
  }>(`
    SELECT v.sku, p.name AS product_name, SUM(iq.quantity) AS quantity, v.low_stock_threshold
    FROM dbo.inventory_quantity iq
    INNER JOIN dbo.product_variants v ON v.id = iq.variant_id
    INNER JOIN dbo.products p ON p.id = v.product_id
    WHERE v.low_stock_threshold IS NOT NULL
    GROUP BY v.sku, p.name, v.low_stock_threshold
    HAVING SUM(iq.quantity) <= v.low_stock_threshold
    ORDER BY SUM(iq.quantity) ASC
  `)
  res.json({ items: r.recordset })
})

adminInventoryRouter.patch('/variants/:variantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const variantId = String(req.params.variantId ?? '')
  if (!isUuidString(variantId)) {
    res.status(400).json({ error: 'Invalid variant id' })
    return
  }

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
    const items = await listInventoryOverview(pool)
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
