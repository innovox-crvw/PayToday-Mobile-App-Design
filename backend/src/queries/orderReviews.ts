import type { SqlExecutor, SqlNamedParams } from './base.js'
import { runQuery } from './base.js'

export type OrderReviewRow = {
  id: string
  order_id: string
  user_id: string | null
  rating: number
  comment: string | null
  created_at: Date
}

function bindMerchantScope(params: Record<string, string | number>, ids: number[], prefix: string): string {
  const clean = ids.filter((n) => Number.isInteger(n) && n >= 0)
  clean.forEach((id, i) => {
    params[`${prefix}${i}`] = id
  })
  return clean.map((_, i) => `@${prefix}${i}`).join(', ')
}

export async function getOrderReviewByOrderId(executor: SqlExecutor, orderId: string): Promise<OrderReviewRow | null> {
  const rows = await runQuery<OrderReviewRow>(
    executor,
    `
      SELECT CAST(id AS NVARCHAR(36)) AS id,
        CAST(order_id AS NVARCHAR(36)) AS order_id,
        CAST(user_id AS NVARCHAR(36)) AS user_id,
        rating,
        comment,
        created_at
      FROM dbo.order_reviews
      WHERE order_id = @oid
    `,
    { oid: orderId } satisfies SqlNamedParams,
  )
  return rows[0] ?? null
}

export async function insertOrderReview(
  executor: SqlExecutor,
  input: { orderId: string; userId: string | null; rating: number; comment: string | null },
): Promise<void> {
  await runQuery<void>(
    executor,
    `
      INSERT INTO dbo.order_reviews (order_id, user_id, rating, comment)
      VALUES (@oid, @uid, @rating, @comment)
    `,
    {
      oid: input.orderId,
      uid: input.userId,
      rating: input.rating,
      comment: input.comment,
    } satisfies SqlNamedParams,
  )
}

export type AdminOrderReviewListRow = {
  reviewId: string
  orderId: string
  rating: number
  comment: string | null
  created_at: Date
  total_cents: number
  currency: string
  order_status: string
  customer_email: string | null
}

export async function listAdminOrderReviewsScoped(
  executor: SqlExecutor,
  input: { payTodayMerchantIds?: number[] },
): Promise<AdminOrderReviewListRow[]> {
  const base = `
    SELECT CAST(r.id AS NVARCHAR(36)) AS reviewId,
      CAST(r.order_id AS NVARCHAR(36)) AS orderId,
      r.rating,
      r.comment,
      r.created_at,
      o.total_cents,
      o.currency,
      o.status AS order_status,
      COALESCE(NULLIF(LTRIM(RTRIM(o.guest_email)), ''), NULLIF(LTRIM(RTRIM(u.email)), '')) AS customer_email
    FROM dbo.order_reviews r
    INNER JOIN dbo.orders o ON o.id = r.order_id
    LEFT JOIN dbo.users u ON u.id = o.user_id
  `
  const ids = input.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  const params: Record<string, string | number> = {}
  const merchantSql = ids.length
    ? ` AND EXISTS (
          SELECT 1
          FROM dbo.order_lines ol
          INNER JOIN dbo.product_variants v ON v.id = ol.variant_id
          INNER JOIN dbo.products p ON p.id = v.product_id
          WHERE ol.order_id = o.id
            AND p.pay_today_merchant_id IN (${bindMerchantScope(params, ids, 'mid')})
        )`
    : ''

  if (merchantSql) {
    return await runQuery<AdminOrderReviewListRow>(
      executor,
      `${base} WHERE 1 = 1${merchantSql} ORDER BY r.created_at DESC`,
      params satisfies SqlNamedParams,
    )
  }
  return await runQuery<AdminOrderReviewListRow>(executor, `${base} ORDER BY r.created_at DESC`)
}
