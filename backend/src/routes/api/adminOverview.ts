import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const adminOverviewRouter = Router()
adminOverviewRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

/** Counts orders excluding abandoned checkouts for sales charts. */
const EXCLUDED_SALES_STATUSES = `N'cancelled', N'pending_payment'`

adminOverviewRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }

  try {
    const [
      ordersByStatus,
      salesByDay,
      inventoryRow,
      unitsByCategory,
      topProducts,
      returnCasesByStatus,
    ] = await Promise.all([
      pool.request().query<{ status: string; count: number }>(`
        SELECT o.status AS status, COUNT(*) AS [count]
        FROM dbo.orders o
        GROUP BY o.status
        ORDER BY [count] DESC
      `),
      pool.request().query<{ day: Date; orderCount: number; revenueCents: number }>(`
        SELECT CAST(o.created_at AS DATE) AS day,
          COUNT(*) AS orderCount,
          SUM(o.total_cents) AS revenueCents
        FROM dbo.orders o
        WHERE o.created_at >= DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE))
          AND o.status NOT IN (${EXCLUDED_SALES_STATUSES})
        GROUP BY CAST(o.created_at AS DATE)
        ORDER BY day ASC
      `),
      pool.request().query<{
        variantCount: number
        activeProductCount: number
        totalUnitsOnHand: number | null
        totalReservedUnits: number | null
        lowStockVariantCount: number
      }>(`
        SELECT
          (SELECT COUNT(*) FROM dbo.product_variants) AS variantCount,
          (SELECT COUNT(*) FROM dbo.products WHERE is_active = 1) AS activeProductCount,
          (SELECT SUM(CAST(iq.quantity AS BIGINT)) FROM dbo.inventory_quantity iq) AS totalUnitsOnHand,
          (SELECT SUM(CAST(ir.quantity AS BIGINT))
           FROM dbo.inventory_reservations ir
           INNER JOIN dbo.orders o ON o.id = ir.order_id
           WHERE o.status = N'pending_payment') AS totalReservedUnits,
          (SELECT COUNT(*)
           FROM dbo.product_variants v
           LEFT JOIN (
             SELECT variant_id, SUM(quantity) AS sumQty
             FROM dbo.inventory_quantity
             GROUP BY variant_id
           ) q ON q.variant_id = v.id
           WHERE v.low_stock_threshold IS NOT NULL
             AND ISNULL(q.sumQty, 0) <= v.low_stock_threshold) AS lowStockVariantCount
      `),
      pool.request().query<{ categoryName: string; units: number }>(`
        SELECT TOP 12
          ISNULL(c.name, N'Uncategorised') AS categoryName,
          CAST(SUM(ISNULL(qty.sumQty, 0)) AS INT) AS units
        FROM dbo.products p
        LEFT JOIN dbo.categories c ON c.id = p.category_id
        INNER JOIN dbo.product_variants v ON v.product_id = p.id
        LEFT JOIN (
          SELECT variant_id, SUM(quantity) AS sumQty
          FROM dbo.inventory_quantity
          GROUP BY variant_id
        ) qty ON qty.variant_id = v.id
        GROUP BY ISNULL(c.name, N'Uncategorised')
        ORDER BY units DESC
      `),
      pool.request().query<{ productName: string; revenueCents: number }>(`
        SELECT TOP 8
          p.name AS productName,
          CAST(SUM(CAST(ol.quantity AS BIGINT) * CAST(ol.unit_price_cents AS BIGINT)) AS BIGINT) AS revenueCents
        FROM dbo.order_lines ol
        INNER JOIN dbo.orders o ON o.id = ol.order_id
        INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE o.created_at >= DATEADD(DAY, -30, SYSUTCDATETIME())
          AND o.status NOT IN (${EXCLUDED_SALES_STATUSES})
        GROUP BY p.id, p.name
        ORDER BY revenueCents DESC
      `),
      (async () => {
        try {
          return await pool.request().query<{ status: string; count: number }>(`
            SELECT status AS status, COUNT(*) AS [count]
            FROM dbo.return_cases
            GROUP BY status
            ORDER BY [count] DESC
          `)
        } catch {
          return { recordset: [] as { status: string; count: number }[] }
        }
      })(),
    ])

    const inv = inventoryRow.recordset[0]
    res.json({
      ordersByStatus: ordersByStatus.recordset.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      salesByDay: salesByDay.recordset.map((r) => ({
        day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
        orderCount: Number(r.orderCount),
        revenueCents: Number(r.revenueCents) || 0,
      })),
      inventory: {
        variantCount: Number(inv?.variantCount ?? 0),
        activeProductCount: Number(inv?.activeProductCount ?? 0),
        totalUnitsOnHand: Number(inv?.totalUnitsOnHand ?? 0),
        totalReservedUnits: Number(inv?.totalReservedUnits ?? 0),
        lowStockVariantCount: Number(inv?.lowStockVariantCount ?? 0),
      },
      unitsByCategory: unitsByCategory.recordset.map((r) => ({
        categoryName: r.categoryName,
        units: Number(r.units) || 0,
      })),
      topProductsByRevenue: topProducts.recordset.map((r) => ({
        productName: r.productName,
        revenueCents: Number(r.revenueCents) || 0,
      })),
      returnCasesByStatus: returnCasesByStatus.recordset.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Overview query failed' })
  }
})
