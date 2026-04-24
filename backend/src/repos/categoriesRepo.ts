import type { ConnectionPool } from 'mssql'
import { isValidCategoryIconKey, normalizeCategoryIconKey } from '../lib/categoryIconKeys.js'


export type CategoryRow = {
  id: string
  slug: string
  name: string
  parentId: string | null
  sortOrder: number
  isActive: boolean
  /** Allowlisted storefront icon key; null = default icon in UI. */
  iconKey: string | null
}

function mapRow(row: {
  id: string
  slug: string
  name: string
  parent_id: string | null
  sort_order: number
  is_active: number | boolean
  icon_key?: string | null
}): CategoryRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    iconKey: row.icon_key?.trim() ? normalizeCategoryIconKey(row.icon_key.trim()) : null,
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
    }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, slug, name,
             CAST(parent_id AS NVARCHAR(36)) AS parent_id,
             sort_order, is_active,
             LTRIM(RTRIM(icon_key)) AS icon_key
      FROM dbo.categories
      ${where}
      ORDER BY sort_order, name
    `)
    return r.recordset.map((row) => mapRow(row))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
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
        return r.recordset.map((row) => mapRow({ ...row, icon_key: null }))
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
    return r.recordset.map((row) => mapRow({ ...row, icon_key: null }))
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
    }))
  }
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
        INSERT INTO dbo.categories (slug, name, parent_id, sort_order, is_active, icon_key)
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@slug, @name, @pid, @so, 1, @ik)
      `)
    return ins.recordset[0]!.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Invalid column name|icon_key/i.test(msg)) {
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
  },
): Promise<void> {
  const has = (k: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, k)
  if (!has('slug') && !has('name') && !has('parentId') && !has('sortOrder') && !has('isActive') && !has('iconKey')) {
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
