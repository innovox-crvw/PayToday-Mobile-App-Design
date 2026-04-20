import type { ConnectionPool } from 'mssql'
import type { InventoryPolicy, ProductDto, ProductImageDto, ProductVariantDto, VariantOptionDto } from '../types/catalogue.js'

function isMissingBrandColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /brand_slug|brand_name|Invalid column name/i.test(msg)
}

function isMissingCatalogueScopeColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /compare_at_price_cents|inventory_policy|product_variant_options|parent_id|variant_id|Invalid column name|Invalid object name/i.test(
    msg,
  )
}

export function normalizeInventoryPolicy(raw: string | null | undefined): InventoryPolicy {
  const s = (raw ?? 'track').trim().toLowerCase()
  if (s === 'continue' || s === 'not_tracked') return s
  return 'track'
}

interface ProductRow {
  productId: string
  slug: string
  name: string
  description: string | null
  categoryId: string | null
  categorySlug: string | null
  categoryName: string | null
  brandSlug: string | null
  brandName: string | null
  productIsActive: number | boolean
  variantId: string
  sku: string
  variantName: string
  price_cents: number
  currency: string
  compare_at_price_cents: number | null
  inventory_policy: string | null
  stock: number | null
  imageUrl: string | null
}

function groupProducts(rows: ProductRow[]): ProductDto[] {
  const map = new Map<string, ProductDto>()
  for (const r of rows) {
    let p = map.get(r.productId)
    if (!p) {
      p = {
        id: r.productId,
        slug: r.slug,
        name: r.name,
        description: r.description ?? '',
        categoryId: r.categoryId ?? '',
        categorySlug: r.categorySlug ?? '',
        categoryName: r.categoryName ?? '',
        brandSlug: r.brandSlug?.trim() ? r.brandSlug.trim() : null,
        brandName: r.brandName?.trim() ? r.brandName.trim() : null,
        imageUrl: r.imageUrl,
        isActive: Boolean(r.productIsActive ?? true),
        variants: [],
      }
      map.set(r.productId, p)
    }
    const v: ProductVariantDto = {
      id: r.variantId,
      sku: r.sku,
      name: r.variantName,
      priceCents: r.price_cents,
      currency: (r.currency ?? 'NAD').trim(),
      stockQuantity: Number(r.stock ?? 0),
      compareAtPriceCents: r.compare_at_price_cents != null ? Number(r.compare_at_price_cents) : null,
      inventoryPolicy: normalizeInventoryPolicy(r.inventory_policy),
      options: [],
    }
    p.variants.push(v)
  }
  return [...map.values()]
}

export type ListProductsOptions = {
  search?: string
  categorySlug?: string
  brandSlug?: string
  sort?: 'name' | 'price_asc' | 'price_desc'
}

function buildListSql(
  opts: ListProductsOptions | undefined,
  includeBrandColumns: boolean,
  adminCatalogue: boolean,
  includeScopeColumns: boolean,
  useCategorySubtree: boolean,
): string {
  const search = opts?.search
  const categorySlug = opts?.categorySlug?.trim()
  const brandSlug = opts?.brandSlug?.trim()
  const sort = opts?.sort ?? 'name'

  const brandSelect = includeBrandColumns
    ? `p.brand_slug AS brandSlug,
      p.brand_name AS brandName,`
    : `CAST(NULL AS NVARCHAR(80)) AS brandSlug,
      CAST(NULL AS NVARCHAR(160)) AS brandName,`

  const variantCols = includeScopeColumns
    ? `v.compare_at_price_cents,
      v.inventory_policy,`
    : `CAST(NULL AS INT) AS compare_at_price_cents,
      CAST(N'track' AS NVARCHAR(20)) AS inventory_policy,`

  const imageSub = includeScopeColumns
    ? `COALESCE(
      (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id AND pi.variant_id IS NULL ORDER BY pi.sort_order, pi.id),
      (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id)
    )`
    : `(SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id)`

  const cte =
    categorySlug && useCategorySubtree
      ? `;WITH cat_subtree AS (
    SELECT id FROM dbo.categories WHERE slug = @catSlug AND COALESCE(is_active, 1) = 1
    UNION ALL
    SELECT c.id FROM dbo.categories c
    INNER JOIN cat_subtree t ON c.parent_id = t.id
    WHERE COALESCE(c.is_active, 1) = 1
  )
`
      : ''

  let sql = `${cte}
    SELECT
      CAST(p.id AS NVARCHAR(36)) AS productId,
      p.slug,
      p.name,
      p.description,
      CAST(c.id AS NVARCHAR(36)) AS categoryId,
      c.slug AS categorySlug,
      c.name AS categoryName,
      ${brandSelect}
      p.is_active AS productIsActive,
      CAST(v.id AS NVARCHAR(36)) AS variantId,
      v.sku,
      v.name AS variantName,
      v.price_cents,
      v.currency,
      ${variantCols}
      ISNULL((
        SELECT SUM(iq.quantity) FROM dbo.inventory_quantity iq WHERE iq.variant_id = v.id
      ), 0) AS stock,
      (${imageSub}) AS imageUrl
    FROM dbo.products p
    LEFT JOIN dbo.categories c ON c.id = p.category_id
    INNER JOIN dbo.product_variants v ON v.product_id = p.id
    WHERE ${adminCatalogue ? '1 = 1' : 'p.is_active = 1'}
  `
  if (search && search.trim()) {
    sql += ` AND (p.name LIKE @q OR p.slug LIKE @q OR v.sku LIKE @q OR p.description LIKE @q)`
  }
  if (categorySlug) {
    sql += useCategorySubtree
      ? ` AND p.category_id IN (SELECT id FROM cat_subtree)`
      : ` AND c.slug = @catSlug`
  }
  if (brandSlug && includeBrandColumns) {
    sql += ` AND LOWER(LTRIM(RTRIM(p.brand_slug))) = LOWER(LTRIM(RTRIM(@brandSlug)))`
  }
  if (sort === 'price_asc') {
    sql += ` ORDER BY v.price_cents ASC, p.name, v.sku`
  } else if (sort === 'price_desc') {
    sql += ` ORDER BY v.price_cents DESC, p.name, v.sku`
  } else {
    sql += ` ORDER BY p.name, v.sku`
  }
  return sql
}

async function listProductsQuery(
  pool: ConnectionPool,
  opts: ListProductsOptions | undefined,
  includeBrandColumns: boolean,
  adminCatalogue: boolean,
  includeScopeColumns: boolean,
  useCategorySubtree = true,
): Promise<ProductDto[]> {
  const req = pool.request()
  const search = opts?.search
  const categorySlug = opts?.categorySlug?.trim()
  const brandSlug = opts?.brandSlug?.trim()

  const sql = buildListSql(opts, includeBrandColumns, adminCatalogue, includeScopeColumns, useCategorySubtree)
  if (search && search.trim()) {
    req.input('q', `%${search.trim()}%`)
  }
  if (categorySlug) {
    req.input('catSlug', categorySlug)
  }
  if (brandSlug && includeBrandColumns) {
    req.input('brandSlug', brandSlug)
  }
  const r = await req.query<ProductRow>(sql)
  return groupProducts(r.recordset)
}

function listProductAttempts(
  pool: ConnectionPool,
  opts: ListProductsOptions | undefined,
  adminCatalogue: boolean,
): Array<() => Promise<ProductDto[]>> {
  const combos: Array<[boolean, boolean, boolean]> = [
    [true, true, true],
    [false, true, true],
    [true, false, true],
    [false, false, true],
    [true, true, false],
    [false, true, false],
    [true, false, false],
    [false, false, false],
  ]
  return combos.map(
    ([includeBrand, includeScope, subtree]) => () =>
      listProductsQuery(pool, opts, includeBrand, adminCatalogue, includeScope, subtree),
  )
}

async function runFirstSuccessful(attempts: Array<() => Promise<ProductDto[]>>): Promise<ProductDto[]> {
  let last: unknown
  for (const run of attempts) {
    try {
      return await run()
    } catch (e) {
      last = e
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

export async function listProducts(pool: ConnectionPool, opts?: ListProductsOptions): Promise<ProductDto[]> {
  return runFirstSuccessful(listProductAttempts(pool, opts, false))
}

export async function listProductsAdmin(pool: ConnectionPool, opts?: ListProductsOptions): Promise<ProductDto[]> {
  return runFirstSuccessful(listProductAttempts(pool, opts, true))
}

async function getProductBySlugQuery(
  pool: ConnectionPool,
  slug: string,
  includeBrandColumns: boolean,
  includeScopeColumns: boolean,
): Promise<ProductDto | null> {
  const req = pool.request()
  req.input('slug', slug)
  const brandSelect = includeBrandColumns
    ? `p.brand_slug AS brandSlug,
      p.brand_name AS brandName,`
    : `CAST(NULL AS NVARCHAR(80)) AS brandSlug,
      CAST(NULL AS NVARCHAR(160)) AS brandName,`
  const variantCols = includeScopeColumns
    ? `v.compare_at_price_cents,
      v.inventory_policy,`
    : `CAST(NULL AS INT) AS compare_at_price_cents,
      CAST(N'track' AS NVARCHAR(20)) AS inventory_policy,`

  const imageSub = includeScopeColumns
    ? `COALESCE(
      (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id AND pi.variant_id IS NULL ORDER BY pi.sort_order, pi.id),
      (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id)
    )`
    : `(SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id)`

  const sql = `
    SELECT
      CAST(p.id AS NVARCHAR(36)) AS productId,
      p.slug,
      p.name,
      p.description,
      CAST(c.id AS NVARCHAR(36)) AS categoryId,
      c.slug AS categorySlug,
      c.name AS categoryName,
      ${brandSelect}
      p.is_active AS productIsActive,
      CAST(v.id AS NVARCHAR(36)) AS variantId,
      v.sku,
      v.name AS variantName,
      v.price_cents,
      v.currency,
      ${variantCols}
      ISNULL((
        SELECT SUM(iq.quantity) FROM dbo.inventory_quantity iq WHERE iq.variant_id = v.id
      ), 0) AS stock,
      (${imageSub}) AS imageUrl
    FROM dbo.products p
    LEFT JOIN dbo.categories c ON c.id = p.category_id
    INNER JOIN dbo.product_variants v ON v.product_id = p.id
    WHERE p.slug = @slug AND p.is_active = 1
    ORDER BY v.sku
  `
  const r = await req.query<ProductRow>(sql)
  if (r.recordset.length === 0) return null
  return groupProducts(r.recordset)[0] ?? null
}

async function loadProductImages(pool: ConnectionPool, productId: string): Promise<ProductImageDto[]> {
  try {
    const r = await pool.request().input('pid', productId).query<{
      url: string
      sort_order: number
      variant_id: string | null
    }>(`
      SELECT url, sort_order, CAST(variant_id AS NVARCHAR(36)) AS variant_id
      FROM dbo.product_images WHERE product_id = @pid
      ORDER BY sort_order, id
    `)
    return r.recordset.map((row) => ({
      url: row.url,
      sortOrder: row.sort_order,
      variantId: row.variant_id,
    }))
  } catch (e) {
    if (/Invalid object name|product_images/i.test(String(e))) throw e
    throw e
  }
}

async function loadVariantOptions(pool: ConnectionPool, variantIds: string[]): Promise<Map<string, VariantOptionDto[]>> {
  const map = new Map<string, VariantOptionDto[]>()
  if (variantIds.length === 0) return map
  const req = pool.request()
  const placeholders = variantIds.map((_, i) => `@v${i}`).join(', ')
  for (let i = 0; i < variantIds.length; i++) {
    req.input(`v${i}`, variantIds[i])
  }
  const r = await req.query<{ variant_id: string; option_name: string; option_value: string; sort_order: number }>(`
    SELECT CAST(variant_id AS NVARCHAR(36)) AS variant_id, option_name, option_value, sort_order
    FROM dbo.product_variant_options
    WHERE variant_id IN (${placeholders})
    ORDER BY variant_id, sort_order, option_name
  `)
  for (const row of r.recordset) {
    const list = map.get(row.variant_id) ?? []
    list.push({ name: row.option_name, value: row.option_value })
    map.set(row.variant_id, list)
  }
  return map
}

async function enrichProductDetail(pool: ConnectionPool, product: ProductDto, includeScope: boolean): Promise<void> {
  if (!includeScope) {
    product.images = []
    return
  }
  try {
    product.images = await loadProductImages(pool, product.id)
  } catch {
    product.images = []
  }
  try {
    const ids = product.variants.map((v) => v.id)
    const optMap = await loadVariantOptions(pool, ids)
    for (const v of product.variants) {
      v.options = optMap.get(v.id) ?? []
    }
  } catch {
    for (const v of product.variants) {
      v.options = []
    }
  }
}

export async function getProductBySlug(pool: ConnectionPool, slug: string): Promise<ProductDto | null> {
  try {
    const p = await getProductBySlugQuery(pool, slug, true, true)
    if (!p) return null
    await enrichProductDetail(pool, p, true)
    return p
  } catch (e) {
    if (!isMissingBrandColumnError(e)) {
      if (isMissingCatalogueScopeColumnError(e)) {
        const p = await getProductBySlugQuery(pool, slug, true, false)
        if (!p) return null
        await enrichProductDetail(pool, p, false)
        return p
      }
      throw e
    }
    try {
      const p = await getProductBySlugQuery(pool, slug, false, true)
      if (!p) return null
      await enrichProductDetail(pool, p, true)
      return p
    } catch (e2) {
      if (isMissingCatalogueScopeColumnError(e2)) {
        const p = await getProductBySlugQuery(pool, slug, false, false)
        if (!p) return null
        await enrichProductDetail(pool, p, false)
        return p
      }
      throw e2
    }
  }
}

export async function replaceVariantOptions(
  pool: ConnectionPool,
  variantId: string,
  options: { name: string; value: string }[],
): Promise<void> {
  await pool.request().input('vid', variantId).query(`DELETE FROM dbo.product_variant_options WHERE variant_id = @vid`)
  let ord = 0
  for (const o of options) {
    const nm = o.name.trim()
    const val = o.value.trim()
    if (!nm || !val) continue
    await pool
      .request()
      .input('vid', variantId)
      .input('nm', nm.slice(0, 60))
      .input('val', val.slice(0, 120))
      .input('so', ord++)
      .query(`
        INSERT INTO dbo.product_variant_options (variant_id, option_name, option_value, sort_order)
        VALUES (@vid, @nm, @val, @so)
      `)
  }
}

export async function createProductSimple(
  pool: ConnectionPool,
  input: {
    slug: string
    name: string
    description: string
    categoryId: string | null
    brandSlug?: string | null
    brandName?: string | null
    sku: string
    variantName: string
    priceCents: number
    currency: string
    initialStock: number
    imageUrl?: string | null
    compareAtPriceCents?: number | null
    inventoryPolicy?: InventoryPolicy
    variantOptions?: { name: string; value: string }[]
  },
): Promise<{ productId: string; variantId: string }> {
  const invPol = input.inventoryPolicy ?? 'track'
  const cmp = input.compareAtPriceCents
  const r1 = pool.request()
  r1.input('slug', input.slug)
  r1.input('name', input.name)
  r1.input('description', input.description)
  r1.input('categoryId', input.categoryId)
  const bs = input.brandSlug?.trim() || null
  const bn = input.brandName?.trim() || null
  r1.input('brandSlug', bs)
  r1.input('brandName', bn)
  let productId: string
  try {
    const pRes = await r1.query<{ id: string }>(`
      INSERT INTO dbo.products (category_id, slug, name, description, brand_slug, brand_name, is_active)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@categoryId, @slug, @name, @description, @brandSlug, @brandName, 1)
    `)
    productId = pRes.recordset[0].id
  } catch (e) {
    if (!isMissingBrandColumnError(e)) throw e
    const r0 = pool.request()
    r0.input('slug', input.slug)
    r0.input('name', input.name)
    r0.input('description', input.description)
    r0.input('categoryId', input.categoryId)
    const pRes = await r0.query<{ id: string }>(`
      INSERT INTO dbo.products (category_id, slug, name, description, is_active)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@categoryId, @slug, @name, @description, 1)
    `)
    productId = pRes.recordset[0].id
  }

  const r2 = pool.request()
  r2.input('productId', productId)
  r2.input('sku', input.sku)
  r2.input('variantName', input.variantName)
  r2.input('priceCents', input.priceCents)
  r2.input('currency', input.currency)
  r2.input('cmp', cmp ?? null)
  r2.input('invPol', invPol)
  let variantId: string
  try {
    const vRes = await r2.query<{ id: string }>(`
      INSERT INTO dbo.product_variants (product_id, sku, name, price_cents, currency, compare_at_price_cents, inventory_policy)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@productId, @sku, @variantName, @priceCents, @currency, @cmp, @invPol)
    `)
    variantId = vRes.recordset[0].id
  } catch (e) {
    if (!isMissingCatalogueScopeColumnError(e)) throw e
    const vRes = await pool.request().input('productId', productId).input('sku', input.sku).input('variantName', input.variantName).input('priceCents', input.priceCents).input('currency', input.currency).query<{ id: string }>(`
      INSERT INTO dbo.product_variants (product_id, sku, name, price_cents, currency)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@productId, @sku, @variantName, @priceCents, @currency)
    `)
    variantId = vRes.recordset[0].id
  }

  const rWh = pool.request()
  const wh = await rWh.query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`)
  const warehouseId = wh.recordset[0]?.id
  if (!warehouseId) {
    throw new Error('No warehouse configured')
  }

  const r3 = pool.request()
  r3.input('variantId', variantId)
  r3.input('warehouseId', warehouseId)
  r3.input('qty', input.initialStock)
  await r3.query(`
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES (@variantId, @warehouseId, @qty)
  `)

  const img = input.imageUrl?.trim()
  if (img) {
    const r4 = pool.request()
    r4.input('productId', productId)
    r4.input('url', img.slice(0, 2000))
    await r4.query(`
      INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES (@productId, @url, 0)
    `)
  }

  const opts = input.variantOptions?.filter((o) => o.name.trim() && o.value.trim()) ?? []
  if (opts.length > 0) {
    try {
      await replaceVariantOptions(pool, variantId, opts)
    } catch {
      /* table may not exist */
    }
  }

  return { productId, variantId }
}

export async function insertProductImage(
  pool: ConnectionPool,
  productId: string,
  url: string,
  sortOrder: number,
  variantId?: string | null,
): Promise<void> {
  const u = url.trim().slice(0, 2000)
  if (!u) {
    throw new Error('url required')
  }
  const so = Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0
  const vid = variantId?.trim() || null
  try {
    await pool.request().input('pid', productId).input('url', u).input('so', so).input('vid', vid).query(`
      INSERT INTO dbo.product_images (product_id, url, sort_order, variant_id) VALUES (@pid, @url, @so, @vid)
    `)
  } catch {
    await pool.request().input('pid', productId).input('url', u).input('so', so).query(`
      INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES (@pid, @url, @so)
    `)
  }
}

export async function updateProductAdmin(
  pool: ConnectionPool,
  productId: string,
  patch: {
    name?: string
    slug?: string
    description?: string | null
    isActive?: boolean
    categoryId?: string | null
  },
): Promise<void> {
  const has = (k: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, k)
  if (!has('name') && !has('slug') && !has('description') && !has('isActive') && !has('categoryId')) {
    throw new Error('No fields to update')
  }

  const tx = pool.transaction()
  await tx.begin()
  try {
    const chk = await tx.request().input('id', productId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.products WHERE id = @id`)
    if (Number(chk.recordset[0]?.c ?? 0) === 0) {
      throw new Error('Product not found')
    }

    if (patch.name !== undefined) {
      const v = patch.name.trim()
      if (!v) {
        throw new Error('name cannot be empty')
      }
      await tx.request().input('id', productId).input('name', v).query(`UPDATE dbo.products SET name = @name WHERE id = @id`)
    }
    if (patch.slug !== undefined) {
      const v = patch.slug.trim()
      if (!v) {
        throw new Error('slug cannot be empty')
      }
      await tx.request().input('id', productId).input('slug', v).query(`UPDATE dbo.products SET slug = @slug WHERE id = @id`)
    }
    if (patch.description !== undefined) {
      await tx
        .request()
        .input('id', productId)
        .input('description', patch.description)
        .query(`UPDATE dbo.products SET description = @description WHERE id = @id`)
    }
    if (patch.isActive !== undefined) {
      await tx
        .request()
        .input('id', productId)
        .input('active', patch.isActive ? 1 : 0)
        .query(`UPDATE dbo.products SET is_active = @active WHERE id = @id`)
    }
    if (patch.categoryId !== undefined) {
      await tx
        .request()
        .input('id', productId)
        .input('categoryId', patch.categoryId)
        .query(`UPDATE dbo.products SET category_id = @categoryId WHERE id = @id`)
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    throw e
  }
}

export async function updateVariantAdmin(
  pool: ConnectionPool,
  productId: string,
  variantId: string,
  patch: {
    sku?: string
    variantName?: string
    priceCents?: number
    currency?: string
    compareAtPriceCents?: number | null
    inventoryPolicy?: InventoryPolicy
    options?: { name: string; value: string }[]
  },
): Promise<void> {
  if (Object.keys(patch).length === 0) {
    throw new Error('No fields to update')
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const own = await tx
      .request()
      .input('vid', variantId)
      .input('pid', productId)
      .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_variants WHERE id = @vid AND product_id = @pid`)
    if (Number(own.recordset[0]?.c ?? 0) === 0) {
      throw new Error('Variant not found for product')
    }
    if (patch.sku !== undefined) {
      const v = patch.sku.trim()
      if (!v) {
        throw new Error('sku cannot be empty')
      }
      await tx.request().input('vid', variantId).input('sku', v).query(`UPDATE dbo.product_variants SET sku = @sku WHERE id = @vid`)
    }
    if (patch.variantName !== undefined) {
      const v = patch.variantName.trim()
      if (!v) {
        throw new Error('variantName cannot be empty')
      }
      await tx.request().input('vid', variantId).input('nm', v).query(`UPDATE dbo.product_variants SET name = @nm WHERE id = @vid`)
    }
    if (patch.priceCents !== undefined) {
      if (!Number.isFinite(patch.priceCents) || patch.priceCents < 0 || !Number.isInteger(patch.priceCents)) {
        throw new Error('priceCents must be a non-negative integer')
      }
      await tx
        .request()
        .input('vid', variantId)
        .input('pc', patch.priceCents)
        .query(`UPDATE dbo.product_variants SET price_cents = @pc WHERE id = @vid`)
    }
    if (patch.currency !== undefined) {
      const c = patch.currency.trim().slice(0, 3).toUpperCase()
      if (c.length !== 3) {
        throw new Error('currency must be a 3-letter code')
      }
      await tx.request().input('vid', variantId).input('cur', c).query(`UPDATE dbo.product_variants SET currency = @cur WHERE id = @vid`)
    }
    if (patch.compareAtPriceCents !== undefined) {
      const c = patch.compareAtPriceCents
      if (c != null && (!Number.isFinite(c) || c < 0 || !Number.isInteger(c))) {
        throw new Error('compareAtPriceCents must be null or a non-negative integer')
      }
      try {
        await tx
          .request()
          .input('vid', variantId)
          .input('cac', c)
          .query(`UPDATE dbo.product_variants SET compare_at_price_cents = @cac WHERE id = @vid`)
      } catch {
        throw new Error('compare_at_price_cents column missing — run database migrations')
      }
    }
    if (patch.inventoryPolicy !== undefined) {
      const pol = normalizeInventoryPolicy(patch.inventoryPolicy)
      try {
        await tx.request().input('vid', variantId).input('pol', pol).query(`UPDATE dbo.product_variants SET inventory_policy = @pol WHERE id = @vid`)
      } catch {
        throw new Error('inventory_policy column missing — run database migrations')
      }
    }
    if (patch.options !== undefined) {
      await tx.request().input('vid', variantId).query(`DELETE FROM dbo.product_variant_options WHERE variant_id = @vid`)
      let ord = 0
      for (const o of patch.options) {
        const nm = o.name.trim()
        const val = o.value.trim()
        if (!nm || !val) continue
        await tx
          .request()
          .input('vid', variantId)
          .input('nm', nm.slice(0, 60))
          .input('val', val.slice(0, 120))
          .input('so', ord++)
          .query(`
            INSERT INTO dbo.product_variant_options (variant_id, option_name, option_value, sort_order)
            VALUES (@vid, @nm, @val, @so)
          `)
      }
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    throw e
  }
}

export async function getVariantInventoryPolicy(pool: ConnectionPool, variantId: string): Promise<InventoryPolicy> {
  try {
    const r = await pool.request().input('vid', variantId).query<{ inventory_policy: string | null }>(`
      SELECT inventory_policy FROM dbo.product_variants WHERE id = @vid
    `)
    return normalizeInventoryPolicy(r.recordset[0]?.inventory_policy)
  } catch {
    return 'track'
  }
}
