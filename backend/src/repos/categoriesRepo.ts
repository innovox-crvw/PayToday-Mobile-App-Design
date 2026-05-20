import type { ConnectionPool } from 'mssql'
import { isValidCategoryIconKey, normalizeCategoryIconKey } from '../lib/categoryIconKeys.js'
import { env } from '../config/env.js'
import {
  bindRestrictedCategorySlugParams,
  productMatchesLiquorGateSql,
  restrictedCategorySubtreeCte,
} from '../services/ageRestrictedCategoryService.js'


export type CategoryRow = {
  id: string
  slug: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  /** Allowlisted storefront icon key; null = default icon in UI. */
  iconKey: string | null
  /** Admin: category (or its descendants when parent is flagged) may show NedAccess financing on product pages when price ≥ N$5,000. */
  financeEligible: boolean
  /** Admin: category (or descendants) may use in-app payment plans at checkout when cart subtotal ≥ N$5,000. */
  paymentPlanEligible: boolean
}

function mapRow(row: {
  id: string
  slug: string
  name: string
  parent_id: string | null
  sort_order: number
  is_active: number | boolean
  icon_key?: string | null
  finance_eligible?: number | boolean | null
  payment_plan_eligible?: number | boolean | null
}): CategoryRow {
  const fe = row.finance_eligible
  const financeEligible = fe === true || fe === 1 || Number(fe) === 1
  const pe = row.payment_plan_eligible
  const paymentPlanEligible = pe === true || pe === 1 || Number(pe) === 1
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    iconKey: row.icon_key?.trim() ? normalizeCategoryIconKey(row.icon_key.trim()) : null,
    financeEligible,
    paymentPlanEligible,
  }
}

export async function listCategories(pool: ConnectionPool, opts?: { includeInactive?: boolean }): Promise<CategoryRow[]> {
  const includeInactive = opts?.includeInactive ?? false
  const where = includeInactive ? '' : 'WHERE COALESCE(is_active, 1) = 1'

  try {
    const r = await pool.request().query<{
      id: string
      slug: string
      name: string
      parent_id: string | null
      sort_order: number
      is_active: number | boolean
      icon_key: string | null
      finance_eligible: number | boolean
      payment_plan_eligible: number | boolean
    }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name,
             CAST(parent_id AS NVARCHAR(36)) AS parent_id,
             sort_order, is_active,
             LTRIM(RTRIM(icon_key)) AS icon_key,
             CONVERT(BIT, ISNULL(finance_eligible, 0)) AS finance_eligible,
             CONVERT(BIT, ISNULL(payment_plan_eligible, 0)) AS payment_plan_eligible
      FROM dbo.categories
      ${where}
      ORDER BY sort_order, name
    `)
    return r.recordset.map((row) => mapRow(row))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/payment_plan_eligible/i.test(msg)) {
      try {
        const r = await pool.request().query<{
          id: string
          slug: string
          name: string
          parent_id: string | null
          sort_order: number
          is_active: number | boolean
          icon_key: string | null
          finance_eligible: number | boolean
        }>(`
          SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name,
                 CAST(parent_id AS NVARCHAR(36)) AS parent_id,
                 sort_order, is_active,
                 LTRIM(RTRIM(icon_key)) AS icon_key,
                 CONVERT(BIT, ISNULL(finance_eligible, 0)) AS finance_eligible
          FROM dbo.categories
          ${where}
          ORDER BY sort_order, name
        `)
        return r.recordset.map((row) => mapRow({ ...row, payment_plan_eligible: 0 }))
      } catch {
        /* fall through */
      }
    }
    if (/finance_eligible/i.test(msg)) {
      try {
        const r = await pool.request().query<{
          id: string
          slug: string
          name: string
          parent_id: string | null
          sort_order: number
          is_active: number | boolean
          icon_key: string | null
        }>(`
          SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name,
                 CAST(parent_id AS NVARCHAR(36)) AS parent_id,
                 sort_order, is_active,
                 LTRIM(RTRIM(icon_key)) AS icon_key
          FROM dbo.categories
          ${where}
          ORDER BY sort_order, name
        `)
        return r.recordset.map((row) => mapRow({ ...row, finance_eligible: 0, payment_plan_eligible: 0 }))
      } catch {
        /* fall through */
      }
    }
    if (!/icon_key|Invalid column name/i.test(msg)) {
      /* not missing icon_key — try catalogue-scope shape without icon_key */
    } else {
      try {
        const r = await pool.request().query<{
          id: string
          slug: string
          name: string
          parent_id: string | null
          sort_order: number
          is_active: number | boolean
        }>(`
          SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name,
                 CAST(parent_id AS NVARCHAR(36)) AS parent_id,
                 sort_order, is_active
          FROM dbo.categories
          ${where}
          ORDER BY sort_order, name
        `)
        return r.recordset.map((row) => mapRow({ ...row, icon_key: null, finance_eligible: 0, payment_plan_eligible: 0 }))
      } catch {
        /* fall through */
      }
    }
  }

  try {
    const r = await pool.request().query<{
      id: string
      slug: string
      name: string
      parent_id: string | null
      sort_order: number
      is_active: number | boolean
    }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name,
             CAST(parent_id AS NVARCHAR(36)) AS parent_id,
             sort_order, is_active
      FROM dbo.categories
      ${where}
      ORDER BY sort_order, name
    `)
    return r.recordset.map((row) => mapRow({ ...row, icon_key: null, finance_eligible: 0, payment_plan_eligible: 0 }))
  } catch {
    const r = await pool.request().query<{ id: string; slug: string; name: string }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name
      FROM dbo.categories
      ORDER BY name
    `)
    return r.recordset.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      parentId: null,
      sortOrder: 0,
      isActive: true,
      iconKey: null,
      financeEligible: false,
      paymentPlanEligible: false,
    }))
  }
}

/**
 * Storefront nav: active categories that have at least one active product with a variant,
 * optionally excluding alcohol when the viewer is not adult and liquor gating applies.
 * Includes ancestor categories so parents remain visible when only children have products.
 */
export async function listCategoriesWithVisibleProducts(
  pool: ConnectionPool,
  opts: { excludeAlcoholProducts: boolean },
): Promise<CategoryRow[]> {
  const all = await listCategories(pool, { includeInactive: false })
  if (all.length === 0) return []

  const tryDistinct = async (excludeForMinor: boolean): Promise<Set<string>> => {
    if (!excludeForMinor) {
      const r = await pool.request().query<{ category_id: string | null }>(`
        SELECT DISTINCT CAST(p.category_id AS NVARCHAR(36)) AS category_id
        FROM dbo.products p
        INNER JOIN dbo.product_variants v ON v.product_id = p.id
        WHERE p.is_active = 1
          AND p.category_id IS NOT NULL
      `)
      const ids = new Set<string>()
      for (const row of r.recordset) {
        const id = row.category_id?.trim()
        if (id) ids.add(id)
      }
      return ids
    }

    const slugs = env.ageRestrictedCategorySlugs
    const cte = restrictedCategorySubtreeCte(slugs)
    const req = pool.request()
    bindRestrictedCategorySlugParams(req, slugs)
    const withClause = cte ? `;WITH ${cte} ` : ''
    const gate = productMatchesLiquorGateSql(slugs)
    try {
      const r = await req.query<{ category_id: string | null }>(`
        ${withClause}
        SELECT DISTINCT CAST(p.category_id AS NVARCHAR(36)) AS category_id
        FROM dbo.products p
        INNER JOIN dbo.product_variants v ON v.product_id = p.id
        WHERE p.is_active = 1
          AND p.category_id IS NOT NULL
          AND NOT (${gate})
      `)
      const ids = new Set<string>()
      for (const row of r.recordset) {
        const id = row.category_id?.trim()
        if (id) ids.add(id)
      }
      return ids
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/contains_alcohol/i.test(msg)) {
        const r2 = await pool.request().query<{ category_id: string | null }>(`
          SELECT DISTINCT CAST(p.category_id AS NVARCHAR(36)) AS category_id
          FROM dbo.products p
          INNER JOIN dbo.product_variants v ON v.product_id = p.id
          WHERE p.is_active = 1
            AND p.category_id IS NOT NULL
            AND ISNULL(p.contains_alcohol, 0) = 0
        `)
        const ids = new Set<string>()
        for (const row of r2.recordset) {
          const id = row.category_id?.trim()
          if (id) ids.add(id)
        }
        return ids
      }
      throw e
    }
  }

  let leafIds: Set<string>
  try {
    leafIds = await tryDistinct(opts.excludeAlcoholProducts)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (opts.excludeAlcoholProducts && /contains_alcohol/i.test(msg)) {
      leafIds = await tryDistinct(false)
    } else {
      throw e
    }
  }

  if (leafIds.size === 0) return []

  const byId = new Map(all.map((c) => [c.id, c]))
  const visible = new Set<string>()
  for (const leaf of leafIds) {
    let cur: string | null = leaf
    let guard = 0
    while (cur && guard++ < 64) {
      visible.add(cur)
      const row = byId.get(cur)
      if (!row?.parentId?.trim()) break
      cur = row.parentId.trim()
    }
  }

  return all.filter((c) => visible.has(c.id))
}

async function assertNoCycle(pool: ConnectionPool, categoryId: string, newParentId: string | null): Promise<void> {
  if (!newParentId) return
  if (newParentId === categoryId) {
    throw new Error('Category cannot be its own parent')
  }
  let cur: string | null = newParentId
  let depth = 0
  while (cur && depth < 64) {
    if (cur === categoryId) {
      throw new Error('Invalid parent: would create a cycle')
    }
    const idCur: string = cur as string
    const nextParent: { recordset: { parent_id: string | null }[] } = await pool
      .request()
      .input('id', idCur)
      .query<{ parent_id: string | null }>(
        `SELECT CAST(parent_id AS NVARCHAR(36)) AS parent_id FROM dbo.categories WHERE id = @id`,
      )
    cur = nextParent.recordset[0]?.parent_id ?? null
    depth++
  }
}

export async function createCategory(
  pool: ConnectionPool,
  input: { slug: string; name: string; parentId?: string | null; sortOrder?: number; iconKey?: string | null },
): Promise<string> {
  const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-')
  const name = input.name.trim()
  if (!slug || !name) {
    throw new Error('slug and name required')
  }
  const parentId = input.parentId?.trim() || null
  const sortOrder = Number.isFinite(input.sortOrder ?? 0) ? Math.floor(Number(input.sortOrder)) : 0
  const iconKey = input.iconKey != null && String(input.iconKey).trim() ? normalizeCategoryIconKey(String(input.iconKey)) : null
  if (input.iconKey != null && String(input.iconKey).trim() && !iconKey) {
    throw new Error('iconKey must be one of the allowlisted storefront icons (or omit)')
  }
  if (parentId) {
    const ex = await pool.request().input('id', parentId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.categories WHERE id = @id`)
    if (Number(ex.recordset[0]?.c ?? 0) === 0) {
      throw new Error('Parent category not found')
    }
  }
  try {
    const ins = await pool
      .request()
      .input('slug', slug.slice(0, 120))
      .input('name', name.slice(0, 200))
      .input('pid', parentId)
      .input('so', sortOrder)
      .input('ik', iconKey)
      .query<{ id: string }>(`
        INSERT INTO dbo.categories (slug, name, parent_id, sort_order, is_active, icon_key, finance_eligible)
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@slug, @name, @pid, @so, 1, @ik, 0)
      `)
    return ins.recordset[0]!.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Invalid column name|icon_key|finance_eligible/i.test(msg)) {
      try {
        const ins = await pool
          .request()
          .input('slug', slug.slice(0, 120))
          .input('name', name.slice(0, 200))
          .input('pid', parentId)
          .input('so', sortOrder)
          .query<{ id: string }>(`
            INSERT INTO dbo.categories (slug, name, parent_id, sort_order, is_active)
            OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
            VALUES (@slug, @name, @pid, @so, 1)
          `)
        return ins.recordset[0]!.id
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2)
        if (/Invalid column name|parent_id|is_active|sort_order/i.test(msg2)) {
          const ins = await pool
            .request()
            .input('slug', slug.slice(0, 120))
            .input('name', name.slice(0, 200))
            .query<{ id: string }>(`
              INSERT INTO dbo.categories (slug, name)
              OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
              VALUES (@slug, @name)
            `)
          return ins.recordset[0]!.id
        }
        throw e2
      }
    }
    if (/Invalid column name|parent_id|is_active|sort_order/i.test(msg)) {
      const ins = await pool
        .request()
        .input('slug', slug.slice(0, 120))
        .input('name', name.slice(0, 200))
        .query<{ id: string }>(`
          INSERT INTO dbo.categories (slug, name)
          OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
          VALUES (@slug, @name)
        `)
      return ins.recordset[0]!.id
    }
    throw e
  }
}

export async function updateCategory(
  pool: ConnectionPool,
  categoryId: string,
  patch: {
    slug?: string
    name?: string
    parentId?: string | null
    sortOrder?: number
    isActive?: boolean
    iconKey?: string | null
    financeEligible?: boolean
    paymentPlanEligible?: boolean
  },
): Promise<void> {
  const has = (k: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, k)
  if (
    !has('slug') &&
    !has('name') &&
    !has('parentId') &&
    !has('sortOrder') &&
    !has('isActive') &&
    !has('iconKey') &&
    !has('financeEligible') &&
    !has('paymentPlanEligible')
  ) {
    throw new Error('No fields to update')
  }
  if (patch.iconKey !== undefined && patch.iconKey != null && String(patch.iconKey).trim()) {
    if (!isValidCategoryIconKey(String(patch.iconKey))) {
      throw new Error('iconKey must be one of the allowlisted storefront icons (or null to clear)')
    }
  }
  if (patch.parentId !== undefined) {
    const p = patch.parentId
    if (p != null && String(p).trim()) {
      await assertNoCycle(pool, categoryId, String(p).trim())
    }
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const chk = await tx.request().input('id', categoryId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.categories WHERE id = @id`)
    if (Number(chk.recordset[0]?.c ?? 0) === 0) {
      throw new Error('Category not found')
    }
    if (patch.slug !== undefined) {
      const s = patch.slug.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 120)
      if (!s) throw new Error('slug cannot be empty')
      await tx.request().input('id', categoryId).input('slug', s).query(`UPDATE dbo.categories SET slug = @slug WHERE id = @id`)
    }
    if (patch.name !== undefined) {
      const n = patch.name.trim().slice(0, 200)
      if (!n) throw new Error('name cannot be empty')
      await tx.request().input('id', categoryId).input('name', n).query(`UPDATE dbo.categories SET name = @name WHERE id = @id`)
    }
    if (patch.parentId !== undefined) {
      const pid = patch.parentId == null || patch.parentId === '' ? null : patch.parentId.trim()
      await tx.request().input('id', categoryId).input('pid', pid).query(`UPDATE dbo.categories SET parent_id = @pid WHERE id = @id`)
    }
    if (patch.sortOrder !== undefined) {
      const so = Number.isFinite(patch.sortOrder) ? Math.floor(patch.sortOrder) : 0
      await tx.request().input('id', categoryId).input('so', so).query(`UPDATE dbo.categories SET sort_order = @so WHERE id = @id`)
    }
    if (patch.isActive !== undefined) {
      await tx
        .request()
        .input('id', categoryId)
        .input('a', patch.isActive ? 1 : 0)
        .query(`UPDATE dbo.categories SET is_active = @a WHERE id = @id`)
    }
    if (patch.iconKey !== undefined) {
      const ik =
        patch.iconKey == null || !String(patch.iconKey).trim()
          ? null
          : normalizeCategoryIconKey(String(patch.iconKey))
      try {
        await tx.request().input('id', categoryId).input('ik', ik).query(`UPDATE dbo.categories SET icon_key = @ik WHERE id = @id`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/icon_key|Invalid column name/i.test(msg)) throw e
        throw new Error('Run database migration 018_categories_icon_key.sql to enable category icons.')
      }
    }
    if (patch.financeEligible !== undefined) {
      try {
        await tx
          .request()
          .input('id', categoryId)
          .input('fe', patch.financeEligible ? 1 : 0)
          .query(`UPDATE dbo.categories SET finance_eligible = @fe WHERE id = @id`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/finance_eligible|Invalid column name/i.test(msg)) throw e
        throw new Error('Run database migration 066_categories_finance_eligible.sql to enable financing flags on categories.')
      }
    }
    if (patch.paymentPlanEligible !== undefined) {
      try {
        await tx
          .request()
          .input('id', categoryId)
          .input('pe', patch.paymentPlanEligible ? 1 : 0)
          .query(`UPDATE dbo.categories SET payment_plan_eligible = @pe WHERE id = @id`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/payment_plan_eligible|Invalid column name/i.test(msg)) throw e
        throw new Error('Run database migration 082_categories_payment_plan_eligible.sql to enable payment plan flags on categories.')
      }
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    const msg = e instanceof Error ? e.message : String(e)
    if (/Invalid column name|parent_id|is_active|sort_order/i.test(msg) && !/icon_key/i.test(msg)) {
      throw new Error('Run database migration 012_catalogue_scope.sql to enable full category editing.')
    }
    throw e
  }
}
