import type { ConnectionPool } from 'mssql'

export type StorePromotionDto = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkPath: string | null
  sortOrder: number
}

export async function listActivePromotions(pool: ConnectionPool): Promise<StorePromotionDto[]> {
  const r = await pool.request().query<{
    id: string
    slug: string
    title: string
    subtitle: string | null
    image_url: string | null
    link_path: string | null
    sort_order: number
  }>(`
    SELECT
      CAST(id AS NVARCHAR(36)) AS id,
      slug,
      title,
      subtitle,
      image_url,
      link_path,
      sort_order
    FROM dbo.store_promotions
    WHERE is_active = 1
      AND (starts_at IS NULL OR starts_at <= SYSUTCDATETIME())
      AND (ends_at IS NULL OR ends_at >= SYSUTCDATETIME())
    ORDER BY sort_order, title
  `)
  return r.recordset.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    linkPath: row.link_path,
    sortOrder: row.sort_order,
  }))
}
