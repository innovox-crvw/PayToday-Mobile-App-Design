/**
 * Lists active products that have zero rows in dbo.product_images (run against SQL Server).
 * Usage: SQL_CONNECTION_STRING="..." npx tsx backend/scripts/report-products-without-images.ts
 *
 * Does not modify data — use for merchandising cleanup (add images or set is_active = 0).
 */
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'

async function main(): Promise<void> {
  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING')
    process.exit(1)
  }
  const pool = await connectMssql(env.sqlConnectionString)
  try {
    const r = await pool.request().query<{
      id: string
      slug: string
      name: string
      img_count: number
    }>(`
      SELECT CAST(p.id AS NVARCHAR(36)) AS id, p.slug, p.name,
             (SELECT COUNT_BIG(1) FROM dbo.product_images pi WHERE pi.product_id = p.id) AS img_count
      FROM dbo.products p
      WHERE COALESCE(p.is_active, 0) = 1
      ORDER BY p.name
    `)
    const bad = r.recordset.filter((row) => Number(row.img_count ?? 0) === 0)
    if (bad.length === 0) {
      console.log('OK: no active products without catalog images.')
      return
    }
    console.log(`Found ${bad.length} active product(s) with zero images:\n`)
    for (const row of bad) {
      console.log(`${row.id}\t${row.slug}\t${row.name}`)
    }
    console.log('\nFix: add at least one image in admin, or deactivate until images exist.')
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
