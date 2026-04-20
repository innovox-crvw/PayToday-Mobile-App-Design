import type { ConnectionPool } from 'mssql'

export type PopularStoreRow = {
  brandSlug: string
  brandName: string | null
  unitsSold: number
  orderCount: number
}

export type PopularStoresByOrdersResult = {
  days: number
  rangeFromIso: string
  rangeToIso: string
  items: PopularStoreRow[]
}

/**
 * Ranks product `brand_slug` / store fronts by total order line quantity in a rolling window.
 * Only counts non-cancelled orders in paid / fulfillment statuses.
 */
export async function listPopularStoresByOrders(
  pool: ConnectionPool,
  opts: { days: number; limit: number },
): Promise<PopularStoresByOrdersResult> {
  const days = Math.min(365, Math.max(1, Math.floor(opts.days)))
  const limit = Math.min(50, Math.max(1, Math.floor(opts.limit)))

  const r = await pool
    .request()
    .input('days', days)
    .input('limit', limit)
    .query<{ brand_slug: string; brand_name: string | null; units_sold: string | number; order_count: number }>(`
    DECLARE @to DATETIME2 = SYSUTCDATETIME();
    DECLARE @from DATETIME2 = DATEADD(DAY, -@days, @to);

    SELECT TOP (@limit)
      LOWER(LTRIM(RTRIM(p.brand_slug))) AS brand_slug,
      MAX(LTRIM(RTRIM(p.brand_name))) AS brand_name,
      SUM(CAST(ol.quantity AS BIGINT)) AS units_sold,
      COUNT(DISTINCT o.id) AS order_count
    FROM dbo.order_lines ol
    INNER JOIN dbo.orders o ON o.id = ol.order_id
    INNER JOIN dbo.product_variants pv ON pv.id = ol.variant_id
    INNER JOIN dbo.products p ON p.id = pv.product_id
    WHERE o.created_at >= @from AND o.created_at <= @to
      AND o.cancelled_at IS NULL
      AND LOWER(o.status) IN (N'paid', N'processing', N'shipped', N'delivered')
      AND p.brand_slug IS NOT NULL AND LTRIM(RTRIM(p.brand_slug)) <> N''
    GROUP BY LOWER(LTRIM(RTRIM(p.brand_slug)))
    ORDER BY units_sold DESC, order_count DESC, brand_slug ASC
  `)

  const rangeTo = new Date()
  const rangeFrom = new Date(rangeTo.getTime() - days * 24 * 60 * 60 * 1000)

  const items: PopularStoreRow[] = r.recordset.map((row) => {
    const u = typeof row.units_sold === 'string' ? Number(row.units_sold) : row.units_sold
    return {
      brandSlug: row.brand_slug,
      brandName: row.brand_name?.trim() || null,
      unitsSold: Number.isFinite(u) ? Number(u) : 0,
      orderCount: row.order_count,
    }
  })

  return {
    days,
    rangeFromIso: rangeFrom.toISOString(),
    rangeToIso: rangeTo.toISOString(),
    items,
  }
}
