import type { ConnectionPool } from 'mssql'

export type CategoryRow = { id: string; slug: string; name: string }

export async function listCategories(pool: ConnectionPool): Promise<CategoryRow[]> {
  const r = await pool.request().query<CategoryRow>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name
    FROM dbo.categories
    ORDER BY name
  `)
  return r.recordset
}
