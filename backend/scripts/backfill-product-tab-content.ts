/**
 * Backfill product detail tab fields (description + delivery / returns / warranty / box).
 *
 * Usage (from backend folder, .env with SQL_CONNECTION_STRING):
 *   npm run db:backfill-product-tabs
 *   npm run db:backfill-product-tabs -- --dry-run
 *   npm run db:backfill-product-tabs -- --slug=my-product-slug
 *   npm run db:backfill-product-tabs -- --limit=50
 *   npm run db:backfill-product-tabs -- --force
 *
 * Requires migration 081_product_detail_tab_content.sql.
 */
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import { inferPackageDimensions } from '../src/lib/productPackageProfiles.js'
import { generateProductTabContent, isStubProductDescription } from '../src/lib/productTabContentTemplates.js'
import { hasProductTabColumns } from '../src/repos/productsRepo.js'

function argValue(prefix: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`))
  return hit ? hit.slice(prefix.length + 1).trim() : null
}

function isEmpty(val: string | null | undefined): boolean {
  return !val?.trim()
}

function isStubTabField(val: string | null | undefined): boolean {
  const d = (val ?? '').trim()
  if (!d) return true
  if (d.startsWith('What you receive:')) return true
  if (d.length < 120) return true
  if (!d.includes('Contents of this shipment') && !d.includes('Outer retail')) return true
  return false
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')
  const slugFilter = argValue('--slug')
  const limitRaw = argValue('--limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null

  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env at the repo root, then retry.')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    if (!(await hasProductTabColumns(pool))) {
      console.error('Missing product tab columns. Run: npm run db:migrate')
      process.exit(1)
    }

    const req = pool.request()
    let sql = `
      SELECT
        CAST(p.id AS NVARCHAR(36)) AS id,
        p.slug,
        p.name,
        p.description,
        p.delivery_information,
        p.return_policy,
        p.warranty_info,
        p.whats_in_the_box,
        c.slug AS category_slug,
        c.name AS category_name,
        p.brand_name
      FROM dbo.products p
      LEFT JOIN dbo.categories c ON c.id = p.category_id
    `
    if (slugFilter) {
      req.input('slug', slugFilter)
      sql += ` WHERE p.slug = @slug`
    }
    sql += ` ORDER BY p.name`

    const products = await req.query<{
      id: string
      slug: string
      name: string
      description: string | null
      delivery_information: string | null
      return_policy: string | null
      warranty_info: string | null
      whats_in_the_box: string | null
      category_slug: string | null
      category_name: string | null
      brand_name: string | null
    }>(sql)

    let rows = products.recordset
    if (limit != null && Number.isFinite(limit) && limit > 0) {
      rows = rows.slice(0, limit)
    }

    console.log(`Products to process: ${rows.length}${dry ? ' (dry-run)' : ''}`)

    let updated = 0
    for (const row of rows) {
      const variants = await pool
        .request()
        .input('pid', row.id)
        .query<{ sku: string; name: string; package_length_mm: number | null; package_width_mm: number | null; package_height_mm: number | null; gross_weight_g: number | null }>(`
        SELECT sku, name, package_length_mm, package_width_mm, package_height_mm, gross_weight_g
        FROM dbo.product_variants WHERE product_id = @pid ORDER BY sku
      `)

      const v0 = variants.recordset[0]
      const inferred = inferPackageDimensions(row.name, row.category_slug ?? '')
      const hasDims =
        v0?.package_length_mm != null &&
        v0?.package_width_mm != null &&
        v0?.package_height_mm != null &&
        v0?.gross_weight_g != null
      const packageDims = hasDims
        ? {
            packageLengthMm: Number(v0.package_length_mm),
            packageWidthMm: Number(v0.package_width_mm),
            packageHeightMm: Number(v0.package_height_mm),
            grossWeightG: Number(v0.gross_weight_g),
          }
        : inferred

      const generated = generateProductTabContent({
        name: row.name,
        description: row.description,
        categorySlug: row.category_slug ?? '',
        categoryName: row.category_name ?? '',
        brandName: row.brand_name,
        sku: variants.recordset[0]?.sku,
        variantLines: variants.recordset,
        packageDims,
      })

      const patch = {
        description:
          force || isStubProductDescription(row.description, row.name)
            ? generated.description
            : undefined,
        deliveryInformation:
          force || isEmpty(row.delivery_information) || isStubTabField(row.delivery_information)
            ? generated.deliveryInformation
            : undefined,
        returnPolicy:
          force || isEmpty(row.return_policy) || isStubTabField(row.return_policy)
            ? generated.returnPolicy
            : undefined,
        warrantyInfo:
          force || isEmpty(row.warranty_info) || isStubTabField(row.warranty_info)
            ? generated.warrantyInfo
            : undefined,
        whatsInTheBox:
          force || isEmpty(row.whats_in_the_box) || isStubTabField(row.whats_in_the_box)
            ? generated.whatsInTheBox
            : undefined,
      }

      const hasPatch = Object.values(patch).some((v) => v !== undefined)
      if (!hasPatch) continue

      if (dry) {
        console.log(`[dry-run] ${row.slug}`)
        updated++
        continue
      }

      const sets: string[] = []
      const u = pool.request().input('id', row.id)
      if (patch.description !== undefined) {
        u.input('description', patch.description)
        sets.push('description = @description')
      }
      if (patch.deliveryInformation !== undefined) {
        u.input('di', patch.deliveryInformation)
        sets.push('delivery_information = @di')
      }
      if (patch.returnPolicy !== undefined) {
        u.input('rp', patch.returnPolicy)
        sets.push('return_policy = @rp')
      }
      if (patch.warrantyInfo !== undefined) {
        u.input('wi', patch.warrantyInfo)
        sets.push('warranty_info = @wi')
      }
      if (patch.whatsInTheBox !== undefined) {
        u.input('box', patch.whatsInTheBox)
        sets.push('whats_in_the_box = @box')
      }
      await u.query(`UPDATE dbo.products SET ${sets.join(', ')} WHERE id = @id`)
      updated++
    }

    console.log(dry ? `Would update ${updated} product(s).` : `Updated ${updated} product(s).`)
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
