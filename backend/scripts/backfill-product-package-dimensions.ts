/**
 * Set realistic package L×W×H (mm) and gross weight (g) on variants from product name + category.
 *
 *   npm run db:backfill-package-dims
 *   npm run db:backfill-package-dims -- --dry-run
 *   npm run db:backfill-package-dims -- --force
 */
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import { inferPackageDimensions } from '../src/lib/productPackageProfiles.js'

function argValue(prefix: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`))
  return hit ? hit.slice(prefix.length + 1).trim() : null
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const slugFilter = argValue('--slug')

  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env at the repo root, then retry.')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    const req = pool.request()
    let sql = `
      SELECT
        CAST(v.id AS NVARCHAR(36)) AS variant_id,
        v.sku,
        p.slug,
        p.name,
        c.slug AS category_slug
      FROM dbo.product_variants v
      INNER JOIN dbo.products p ON p.id = v.product_id
      LEFT JOIN dbo.categories c ON c.id = p.category_id
    `
    if (slugFilter) {
      req.input('slug', slugFilter)
      sql += ` WHERE p.slug = @slug`
    }
    sql += ` ORDER BY p.name, v.sku`

    const rows = await req.query<{
      variant_id: string
      sku: string
      slug: string
      name: string
      category_slug: string | null
    }>(sql)

    let updated = 0
    for (const row of rows.recordset) {
      const dims = inferPackageDimensions(row.name, row.category_slug ?? '')
      if (dry) {
        console.log(
          `[dry-run] ${row.slug} / ${row.sku}: ${dims.packageLengthMm}×${dims.packageWidthMm}×${dims.packageHeightMm} mm, ${dims.grossWeightG} g`,
        )
        updated++
        continue
      }

      const u = pool
        .request()
        .input('vid', row.variant_id)
        .input('l', dims.packageLengthMm)
        .input('w', dims.packageWidthMm)
        .input('h', dims.packageHeightMm)
        .input('g', dims.grossWeightG)

      const where = force
        ? `WHERE id = @vid`
        : `WHERE id = @vid AND (
            package_length_mm IS NULL OR package_width_mm IS NULL OR package_height_mm IS NULL OR gross_weight_g IS NULL
            OR (package_length_mm = 200 AND package_width_mm = 150 AND package_height_mm = 100)
          )`

      try {
        await u.query(`
          UPDATE dbo.product_variants
          SET
            package_length_mm = @l,
            package_width_mm = @w,
            package_height_mm = @h,
            gross_weight_g = @g
          ${where}
        `)
        updated++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/package_length_mm|Invalid column name/i.test(msg)) {
          console.error('Package columns missing. Run: npm run db:migrate')
          process.exit(1)
        }
        throw e
      }
    }

    console.log(dry ? `Would update ${updated} variant(s).` : `Updated package dimensions on ${updated} variant(s).`)
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
