import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const adminInventoryRouter = Router()
adminInventoryRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

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
    SELECT v.sku, p.name AS product_name, iq.quantity, v.low_stock_threshold
    FROM dbo.inventory_quantity iq
    INNER JOIN dbo.product_variants v ON v.id = iq.variant_id
    INNER JOIN dbo.products p ON p.id = v.product_id
    WHERE v.low_stock_threshold IS NOT NULL AND iq.quantity <= v.low_stock_threshold
    ORDER BY iq.quantity ASC
  `)
  res.json({ items: r.recordset })
})
