import { Router, type Request } from 'express'
import type { Request as SqlRequest } from 'mssql'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { resolveAdminMerchantScopeFromRequest } from '../../lib/adminMerchantScope.js'

export const adminOverviewRouter = Router()
adminOverviewRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

/** Counts orders excluding abandoned checkouts for sales charts. */
const EXCLUDED_SALES_STATUSES = `N'cancelled', N'pending_payment'`

function bindProductMerchantFilter(req: SqlRequest, scope: number[] | undefined, prefix: string): string {
  if (!scope?.length) return ''
  scope.forEach((id, i) => req.input(`${prefix}${i}`, id))
  return ` AND p.pay_today_merchant_id IN (${scope.map((_, i) => `@${prefix}${i}`).join(', ')})`
}

adminOverviewRouter.get('/', async (req: Request, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }

  try {
    const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
    const scoped = Boolean(scope?.length)

    const ordersReq = pool.request()
    const ordersSql = scoped
      ? `
        SELECT o.status AS status, COUNT(DISTINCT o.id) AS [count]
        FROM dbo.orders o
        WHERE EXISTS (
          SELECT 1
          FROM dbo.order_lines ol
          INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
          INNER JOIN dbo.products p ON p.id = v.product_id
          WHERE ol.order_id = o.id
            ${bindProductMerchantFilter(ordersReq, scope, 'os')}
        )
        GROUP BY o.status
        ORDER BY [count] DESC
      `
      : `
        SELECT o.status AS status, COUNT(*) AS [count]
        FROM dbo.orders o
        GROUP BY o.status
        ORDER BY [count] DESC
      `

    const salesReq = pool.request()
    const salesSql = scoped
      ? `
        SELECT CAST(o.created_at AS DATE) AS day,
          COUNT(DISTINCT o.id) AS orderCount,
          SUM(CAST(ol.quantity AS BIGINT) * CAST(ol.unit_price_cents AS BIGINT)) AS revenueCents
        FROM dbo.orders o
        INNER JOIN dbo.order_lines ol ON ol.order_id = o.id
        INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE o.created_at >= DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE))
          AND o.status NOT IN (${EXCLUDED_SALES_STATUSES})
          ${bindProductMerchantFilter(salesReq, scope, 'ss')}
        GROUP BY CAST(o.created_at AS DATE)
        ORDER BY day ASC
      `
      : `
        SELECT CAST(o.created_at AS DATE) AS day,
          COUNT(*) AS orderCount,
          SUM(o.total_cents) AS revenueCents
        FROM dbo.orders o
        WHERE o.created_at >= DATEADD(DAY, -13, CAST(SYSUTCDATETIME() AS DATE))
          AND o.status NOT IN (${EXCLUDED_SALES_STATUSES})
        GROUP BY CAST(o.created_at AS DATE)
        ORDER BY day ASC
      `

    const invReq = pool.request()
    const invFilter = bindProductMerchantFilter(invReq, scope, 'iv')
    const invSql = scoped
      ? `
        SELECT
          (SELECT COUNT(*)
           FROM dbo.product_variants v
           INNER JOIN dbo.products p ON p.id = v.product_id
           WHERE 1 = 1${invFilter}) AS variantCount,
          (SELECT COUNT(*)
           FROM dbo.products p
           WHERE is_active = 1${invFilter}) AS activeProductCount,
          (SELECT SUM(CAST(iq.quantity AS BIGINT))
           FROM dbo.inventory_quantity iq
           INNER JOIN dbo.product_variants v ON v.id = iq.variant_id
           INNER JOIN dbo.products p ON p.id = v.product_id
           WHERE 1 = 1${invFilter}) AS totalUnitsOnHand,
          (SELECT SUM(CAST(ir.quantity AS BIGINT))
           FROM dbo.inventory_reservations ir
           INNER JOIN dbo.orders o ON o.id = ir.order_id
           INNER JOIN dbo.product_variants v ON v.id = ir.variant_id
           INNER JOIN dbo.products p ON p.id = v.product_id
           WHERE o.status = N'pending_payment'${invFilter}) AS totalReservedUnits,
          (SELECT COUNT(*)
           FROM dbo.product_variants v
           INNER JOIN dbo.products p ON p.id = v.product_id
           LEFT JOIN (
             SELECT variant_id, SUM(quantity) AS sumQty
             FROM dbo.inventory_quantity
             GROUP BY variant_id
           ) q ON q.variant_id = v.id
           WHERE v.low_stock_threshold IS NOT NULL
             AND ISNULL(q.sumQty, 0) <= v.low_stock_threshold${invFilter}) AS lowStockVariantCount
      `
      : `
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
      `

    const catReq = pool.request()
    const catFilter = bindProductMerchantFilter(catReq, scope, 'uc')
    const catSql = `
        SELECT TOP 12
          ISNULL(c.name, N'Uncategorised') AS categoryName,
          CAST(SUM(CAST(ISNULL(iq.quantity, 0) AS BIGINT)) AS INT) AS units
        FROM dbo.products p
        LEFT JOIN dbo.categories c ON c.id = p.category_id
        INNER JOIN dbo.product_variants v ON v.product_id = p.id
        LEFT JOIN dbo.inventory_quantity iq ON iq.variant_id = v.id
        WHERE 1 = 1${scoped ? catFilter : ''}
        GROUP BY ISNULL(c.name, N'Uncategorised')
        ORDER BY units DESC
      `

    const topReq = pool.request()
    const topFilter = bindProductMerchantFilter(topReq, scope, 'tp')
    const topSql = `
        SELECT TOP 8
          p.name AS productName,
          CAST(SUM(CAST(ol.quantity AS BIGINT) * CAST(ol.unit_price_cents AS BIGINT)) AS BIGINT) AS revenueCents
        FROM dbo.order_lines ol
        INNER JOIN dbo.orders o ON o.id = ol.order_id
        INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE o.created_at >= DATEADD(DAY, -30, SYSUTCDATETIME())
          AND o.status NOT IN (${EXCLUDED_SALES_STATUSES})
          ${scoped ? topFilter : ''}
        GROUP BY p.id, p.name
        ORDER BY revenueCents DESC
      `

    const [
      ordersByStatus,
      salesByDay,
      inventoryRow,
      unitsByCategory,
      topProducts,
      returnCasesByStatus,
    ] = await Promise.all([
      ordersReq.query<{ status: string; count: number }>(ordersSql),
      salesReq.query<{ day: Date; orderCount: number; revenueCents: number }>(salesSql),
      invReq.query<{
        variantCount: number
        activeProductCount: number
        totalUnitsOnHand: number | null
        totalReservedUnits: number | null
        lowStockVariantCount: number
      }>(invSql),
      catReq.query<{ categoryName: string; units: number }>(catSql),
      topReq.query<{ productName: string; revenueCents: number }>(topSql),
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
