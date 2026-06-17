import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'

type SqlRequest = ReturnType<ConnectionPool['request']>

/** CTE fragment (no leading `;WITH`) — empty when there are no restricted category slugs. */
export function restrictedCategorySubtreeCte(slugs: string[]): string {
  if (!slugs.length) return ''
  const ph = slugs.map((_, i) => `@ars${i}`).join(', ')
  return `age_restrict_roots AS (
      SELECT id FROM dbo.categories WHERE COALESCE(is_active, 1) = 1 AND LOWER(LTRIM(RTRIM(slug))) IN (${ph})
    ),
    age_restrict_subtree AS (
      SELECT id FROM age_restrict_roots
      UNION ALL
      SELECT c.id FROM dbo.categories c
      INNER JOIN age_restrict_subtree t ON c.parent_id = t.id
      WHERE COALESCE(c.is_active, 1) = 1
    )`
}

export function bindRestrictedCategorySlugParams(req: SqlRequest, slugs: string[]): void {
  slugs.forEach((s, i) => {
    req.input(`ars${i}`, s)
  })
}

/** SQL predicate on alias `p` (products) for liquor-gated catalogue lines. */
export function productMatchesLiquorGateSql(slugs: string[]): string {
  const alc = 'ISNULL(p.contains_alcohol, 0) = 1'
  if (!slugs.length) return alc
  return `(${alc} OR (p.category_id IS NOT NULL AND p.category_id IN (SELECT id FROM age_restrict_subtree)))`
}

export async function variantIsAgeRestrictedForLiquorGate(pool: ConnectionPool, variantId: string): Promise<boolean> {
  if (!env.liquorGatingEnabled) return false
  const slugs = env.ageRestrictedCategorySlugs
  const cte = restrictedCategorySubtreeCte(slugs)
  const req = pool.request().input('vid', variantId)
  bindRestrictedCategorySlugParams(req, slugs)
  const withClause = cte ? `;WITH ${cte} ` : ''
  const pred = productMatchesLiquorGateSql(slugs)
  try {
    const r = await req.query<{ c: number }>(`
      ${withClause}
      SELECT CAST(CASE WHEN ${pred} THEN 1 ELSE 0 END AS INT) AS c
      FROM dbo.product_variants v
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE v.id = @vid
    `)
    return Number(r.recordset[0]?.c ?? 0) === 1
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/contains_alcohol/i.test(msg)) {
      const r2 = await pool.request().input('vid', variantId).query<{ c: number }>(`
        SELECT CAST(CASE WHEN ISNULL(p.contains_alcohol, 0) = 1 THEN 1 ELSE 0 END AS INT) AS c
        FROM dbo.product_variants v
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE v.id = @vid
      `)
      return Number(r2.recordset[0]?.c ?? 0) === 1
    }
    throw e
  }
}

/** Product ids that are blocked for non-adults under liquor gating (alcohol flag or restricted category tree). */
export async function productIdsMatchingLiquorGate(pool: ConnectionPool, productIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (!productIds.length || !env.liquorGatingEnabled) return out
  const slugs = env.ageRestrictedCategorySlugs
  const cte = restrictedCategorySubtreeCte(slugs)
  const chunk = 500
  for (let i = 0; i < productIds.length; i += chunk) {
    const slice = productIds.slice(i, i + chunk)
    const ph = slice.map((_, j) => `@pid${j}`).join(', ')
    const req = pool.request()
    slice.forEach((id, j) => req.input(`pid${j}`, id))
    bindRestrictedCategorySlugParams(req, slugs)
    const withClause = cte ? `;WITH ${cte} ` : ''
    const pred = productMatchesLiquorGateSql(slugs)
    try {
      const r = await req.query<{ id: string }>(`
        ${withClause}
        SELECT CAST(p.id AS NVARCHAR(36)) AS id
        FROM dbo.products p
        WHERE CAST(p.id AS NVARCHAR(36)) IN (${ph})
          AND (${pred})
      `)
      for (const row of r.recordset) {
        const id = row.id?.trim()
        if (id) out.add(id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/contains_alcohol/i.test(msg)) {
        const req2 = pool.request()
        slice.forEach((id, j) => req2.input(`pid${j}`, id))
        const r2 = await req2.query<{ id: string }>(`
          SELECT CAST(p.id AS NVARCHAR(36)) AS id
          FROM dbo.products p
          WHERE CAST(p.id AS NVARCHAR(36)) IN (${ph})
            AND ISNULL(p.contains_alcohol, 0) = 1
        `)
        for (const row of r2.recordset) {
          const id = row.id?.trim()
          if (id) out.add(id)
        }
      } else {
        throw e
      }
    }
  }
  return out
}

/** True if the cart has any line whose product is alcohol or in a restricted category subtree. */
export async function cartContainsLiquorGatedItems(pool: ConnectionPool, cartId: string): Promise<boolean> {
  if (!env.liquorGatingEnabled) return false
  const slugs = env.ageRestrictedCategorySlugs
  const cte = restrictedCategorySubtreeCte(slugs)
  const req = pool.request().input('cid', cartId)
  bindRestrictedCategorySlugParams(req, slugs)
  const withClause = cte ? `;WITH ${cte} ` : ''
  const pred = productMatchesLiquorGateSql(slugs)
  try {
    const r = await req.query<{ c: number }>(`
      ${withClause}
      SELECT COUNT_BIG(1) AS c
      FROM dbo.cart_lines cl
      INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE cl.cart_id = @cid AND (${pred})
    `)
    return Number(r.recordset[0]?.c ?? 0) > 0
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/contains_alcohol/i.test(msg)) {
      const r2 = await pool.request().input('cid', cartId).query<{ c: number }>(`
        SELECT COUNT_BIG(1) AS c
        FROM dbo.cart_lines cl
        INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE cl.cart_id = @cid AND ISNULL(p.contains_alcohol, 0) = 1
      `)
      return Number(r2.recordset[0]?.c ?? 0) > 0
    }
    throw e
  }
}

/**
 * True when the category subtree has at least one active product and every active product
 * is liquor-gated for non-adults (contains_alcohol or in configured restricted category trees).
 */
export async function isCategorySubtreeFullyLiquorGatedFromNonAdults(
  pool: ConnectionPool,
  categorySlug: string,
): Promise<boolean> {
  const slug = categorySlug.trim()
  if (!slug) return false
  const slugs = env.ageRestrictedCategorySlugs
  const cte = restrictedCategorySubtreeCte(slugs)
  const req = pool.request().input('slug', slug)
  bindRestrictedCategorySlugParams(req, slugs)
  const pred = productMatchesLiquorGateSql(slugs)
  const withPrefix = cte ? `;WITH ${cte}, ` : ';WITH '
  try {
    const r = await req.query<{ v: number }>(`
      ${withPrefix}cat_subtree AS (
        SELECT id FROM dbo.categories WHERE slug = @slug AND COALESCE(is_active, 1) = 1
        UNION ALL
        SELECT c.id FROM dbo.categories c
        INNER JOIN cat_subtree t ON c.parent_id = t.id
        WHERE COALESCE(c.is_active, 1) = 1
      ),
      agg AS (
        SELECT
          COUNT_BIG(CASE WHEN NOT (${pred}) THEN 1 ELSE 0 END) AS visible_to_minor,
          COUNT_BIG(1) AS total
        FROM dbo.products p
        WHERE p.is_active = 1 AND p.category_id IN (SELECT id FROM cat_subtree)
      )
      SELECT CAST(CASE WHEN total > 0 AND visible_to_minor = 0 THEN 1 ELSE 0 END AS INT) AS v FROM agg
    `)
    return Number(r.recordset[0]?.v ?? 0) === 1
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/contains_alcohol/i.test(msg)) {
      const r2 = await pool.request().input('slug', slug).query<{ v: number }>(`
        ;WITH cat_subtree AS (
          SELECT id FROM dbo.categories WHERE slug = @slug AND COALESCE(is_active, 1) = 1
          UNION ALL
          SELECT c.id FROM dbo.categories c
          INNER JOIN cat_subtree t ON c.parent_id = t.id
          WHERE COALESCE(c.is_active, 1) = 1
        ),
        agg AS (
          SELECT
            COUNT_BIG(CASE WHEN ISNULL(p.contains_alcohol, 0) = 0 THEN 1 ELSE 0 END) AS non_alc,
            COUNT_BIG(1) AS total
          FROM dbo.products p
          WHERE p.is_active = 1 AND p.category_id IN (SELECT id FROM cat_subtree)
        )
        SELECT CAST(CASE WHEN total > 0 AND non_alc = 0 THEN 1 ELSE 0 END AS INT) AS v FROM agg
      `)
      return Number(r2.recordset[0]?.v ?? 0) === 1
    }
    throw e
  }
}

export async function productIsLiquorGatedForNonAdultViewer(pool: ConnectionPool, productId: string): Promise<boolean> {
  if (!env.liquorGatingEnabled) return false
  const slugs = env.ageRestrictedCategorySlugs
  const cte = restrictedCategorySubtreeCte(slugs)
  const req = pool.request().input('pid', productId)
  bindRestrictedCategorySlugParams(req, slugs)
  const withClause = cte ? `;WITH ${cte} ` : ''
  const pred = productMatchesLiquorGateSql(slugs)
  try {
    const r = await req.query<{ c: number }>(`
      ${withClause}
      SELECT CAST(CASE WHEN ${pred} THEN 1 ELSE 0 END AS INT) AS c
      FROM dbo.products p
      WHERE CAST(p.id AS NVARCHAR(36)) = @pid
    `)
    return Number(r.recordset[0]?.c ?? 0) === 1
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/contains_alcohol/i.test(msg)) {
      const r2 = await pool.request().input('pid', productId).query<{ c: number }>(`
        SELECT CAST(CASE WHEN ISNULL(p.contains_alcohol, 0) = 1 THEN 1 ELSE 0 END AS INT) AS c
        FROM dbo.products p
        WHERE CAST(p.id AS NVARCHAR(36)) = @pid
      `)
      return Number(r2.recordset[0]?.c ?? 0) === 1
    }
    throw e
  }
}
