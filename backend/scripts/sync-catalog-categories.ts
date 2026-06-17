/**
 * Align dbo.categories with the catalog-100 product category slugs (tree, names, icons).
 * Re-links products by product slug → category_slug map from the seed catalogue.
 *
 *   npm run db:sync-categories
 *   npm run db:sync-categories -- --dry-run
 */
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import { CATALOG_CATEGORIES, CATALOG_CATEGORY_SLUGS } from '../src/lib/catalogCategories.js'
import { createCategory, listCategories, updateCategory } from '../src/repos/categoriesRepo.js'
import { buildCatalog100Products } from './lib/catalog100Products.js'

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')

  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env at the repo root, then retry.')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    const slugToId = new Map<string, string>()

    for (const def of CATALOG_CATEGORIES) {
      const parentId = def.parentSlug ? slugToId.get(def.parentSlug) ?? null : null
      if (def.parentSlug && !parentId) {
        throw new Error(`Parent category "${def.parentSlug}" must be synced before "${def.slug}"`)
      }

      const existing = (await listCategories(pool, { includeInactive: true })).find((c) => c.slug === def.slug)
      if (existing) {
        slugToId.set(def.slug, existing.id)
        if (dry) {
          console.log(`[dry-run] update ${def.slug} → ${def.name}`)
          continue
        }
        await updateCategory(pool, existing.id, {
          name: def.name,
          parentId,
          sortOrder: def.sortOrder,
          isActive: true,
          iconKey: def.iconKey,
        })
        console.log(`Updated category: ${def.slug}`)
      } else {
        if (dry) {
          console.log(`[dry-run] create ${def.slug} → ${def.name}`)
          slugToId.set(def.slug, `dry-${def.slug}`)
          continue
        }
        const id = await createCategory(pool, {
          slug: def.slug,
          name: def.name,
          parentId,
          sortOrder: def.sortOrder,
          iconKey: def.iconKey,
        })
        slugToId.set(def.slug, id)
        console.log(`Created category: ${def.slug}`)
      }
    }

    const productCategoryBySlug = new Map(buildCatalog100Products().map((p) => [p.slug, p.categorySlug]))
    const products = await pool.request().query<{ id: string; slug: string; category_id: string | null }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, slug, CAST(category_id AS NVARCHAR(36)) AS category_id
      FROM dbo.products
    `)

    let productsRelinked = 0
    for (const p of products.recordset) {
      const catSlug = productCategoryBySlug.get(p.slug)
      if (!catSlug) continue
      const catId = slugToId.get(catSlug)
      if (!catId || catId.startsWith('dry-')) continue
      if (p.category_id === catId) continue
      if (dry) {
        console.log(`[dry-run] product ${p.slug} → category ${catSlug}`)
        productsRelinked++
        continue
      }
      await pool.request().input('pid', p.id).input('cid', catId).query(`
        UPDATE dbo.products SET category_id = @cid WHERE id = @pid
      `)
      productsRelinked++
    }

    const allCats = await listCategories(pool, { includeInactive: true })
    let deactivated = 0
    for (const c of allCats) {
      if (CATALOG_CATEGORY_SLUGS.has(c.slug)) continue
      const inUse = await pool.request().input('cid', c.id).query<{ c: number }>(`
        SELECT COUNT_BIG(1) AS c FROM dbo.products WHERE category_id = @cid
      `)
      if (Number(inUse.recordset[0]?.c ?? 0) > 0) continue
      if (dry) {
        console.log(`[dry-run] deactivate unused category: ${c.slug}`)
        deactivated++
        continue
      }
      await updateCategory(pool, c.id, { isActive: false })
      deactivated++
      console.log(`Deactivated unused category: ${c.slug}`)
    }

    console.log(
      dry
        ? `Dry run: ${CATALOG_CATEGORIES.length} categories, ${productsRelinked} product link(s), ${deactivated} deactivation(s).`
        : `Done: ${CATALOG_CATEGORIES.length} categories synced, ${productsRelinked} product(s) re-linked, ${deactivated} unused category(ies) hidden.`,
    )
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
