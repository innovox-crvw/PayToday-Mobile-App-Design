import type { ConnectionPool, Transaction } from 'mssql'

/** Pool or open transaction — both expose `.request()` for the same SQL batch scope. */
export type SqlExecutor = ConnectionPool | Transaction
import type { InventoryPolicy, ProductDto, ProductImageDto, ProductVariantDto, VariantOptionDto } from '../types/catalogue.js'

function isMissingBrandColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /brand_slug|brand_name|Invalid column name/i.test(msg)
}

function isMissingCatalogueScopeColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /compare_at_price_cents|inventory_policy|package_length_mm|package_width_mm|package_height_mm|gross_weight_g|product_variant_options|parent_id|variant_id|Invalid column name|Invalid object name/i.test(
    msg,
  )
}

export function isMissingPayTodayMerchantIdColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /pay_today_merchant_id|Invalid column name/i.test(msg)
}

function isMissingContainsAlcoholColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /contains_alcohol/i.test(msg)
}

function isMissingProductTabColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /delivery_information|return_policy|warranty_info|whats_in_the_box|Invalid column name/i.test(msg)
}

let cachedProductTabColumns: boolean | undefined

export async function hasProductTabColumns(pool: ConnectionPool): Promise<boolean> {
  if (cachedProductTabColumns !== undefined) return cachedProductTabColumns
  try {
    const r = await pool.request().query<{ len: number | null }>(`
      SELECT COL_LENGTH(N'dbo.products', N'delivery_information') AS len
    `)
    cachedProductTabColumns = r.recordset[0]?.len != null
  } catch {
    cachedProductTabColumns = false
  }
  return cachedProductTabColumns
}

function productTabSelectSql(includeTabColumns: boolean): string {
  return includeTabColumns
    ? `p.delivery_information,
      p.return_policy,
      p.warranty_info,
      p.whats_in_the_box,`
    : `CAST(NULL AS NVARCHAR(MAX)) AS delivery_information,
      CAST(NULL AS NVARCHAR(MAX)) AS return_policy,
      CAST(NULL AS NVARCHAR(MAX)) AS warranty_info,
      CAST(NULL AS NVARCHAR(MAX)) AS whats_in_the_box,`
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
  delivery_information?: string | null
  return_policy?: string | null
  warranty_info?: string | null
  whats_in_the_box?: string | null
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
  package_length_mm: number | null
  package_width_mm: number | null
  package_height_mm: number | null
  gross_weight_g: number | null
  productContainsAlcohol?: number | boolean
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
        deliveryInformation: r.delivery_information ?? '',
        returnPolicy: r.return_policy ?? '',
        warrantyInfo: r.warranty_info ?? '',
        whatsInTheBox: r.whats_in_the_box ?? '',
        categoryId: r.categoryId ?? '',
        categorySlug: r.categorySlug ?? '',
        categoryName: r.categoryName ?? '',
        brandSlug: r.brandSlug?.trim() ? r.brandSlug.trim() : null,
        brandName: r.brandName?.trim() ? r.brandName.trim() : null,
        imageUrl: r.imageUrl,
        isActive: Boolean(r.productIsActive ?? true),
        containsAlcohol: Boolean(Number(r.productContainsAlcohol ?? 0)),
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
      packageLengthMm: r.package_length_mm != null ? Number(r.package_length_mm) : null,
      packageWidthMm: r.package_width_mm != null ? Number(r.package_width_mm) : null,
      packageHeightMm: r.package_height_mm != null ? Number(r.package_height_mm) : null,
      grossWeightG: r.gross_weight_g != null ? Number(r.gross_weight_g) : null,
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
  /** When true, attach full `images[]` per product (batch query) for storefront grids. */
  includeImages?: boolean
  /**
   * When non-empty, restrict to these PayToday merchant ids (`dbo.products.pay_today_merchant_id`).
   * Admin catalogue only; storefront `listProducts` ignores this.
   */
  payTodayMerchantIds?: number[]
  /** Storefront: restrict to these product ids (caller preserves order via sort + client reorder if needed). */
  productIds?: string[]
}

function buildListSql(
  opts: ListProductsOptions | undefined,
  includeBrandColumns: boolean,
  adminCatalogue: boolean,
  includeScopeColumns: boolean,
  useCategorySubtree: boolean,
  includeAlcoholColumn: boolean,
  productIdWhereSql: string,
  includeTabColumns: boolean,
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
      v.inventory_policy,
      v.package_length_mm,
      v.package_width_mm,
      v.package_height_mm,
      v.gross_weight_g,`
    : `CAST(NULL AS INT) AS compare_at_price_cents,
      CAST(N'track' AS NVARCHAR(20)) AS inventory_policy,
      CAST(NULL AS INT) AS package_length_mm,
      CAST(NULL AS INT) AS package_width_mm,
      CAST(NULL AS INT) AS package_height_mm,
      CAST(NULL AS INT) AS gross_weight_g,`

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
      ${productTabSelectSql(includeTabColumns)}
      CAST(c.id AS NVARCHAR(36)) AS categoryId,
      c.slug AS categorySlug,
      c.name AS categoryName,
      ${brandSelect}
      p.is_active AS productIsActive,
      ${
        includeAlcoholColumn
          ? 'ISNULL(p.contains_alcohol, 0) AS productContainsAlcohol'
          : 'CAST(0 AS BIT) AS productContainsAlcohol'
      },
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
  const merchantIds = opts?.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  if (merchantIds.length > 0) {
    const ph = merchantIds.map((_, i) => `@mid${i}`).join(', ')
    sql += ` AND p.pay_today_merchant_id IN (${ph})`
  }
  if (productIdWhereSql) {
    sql += productIdWhereSql
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
  includeAlcoholColumn = true,
  includeTabColumns = true,
): Promise<ProductDto[]> {
  const req = pool.request()
  const search = opts?.search
  const categorySlug = opts?.categorySlug?.trim()
  const brandSlug = opts?.brandSlug?.trim()

  const productIds =
    opts?.productIds
      ?.map((id) => String(id ?? '').trim())
      .filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id),
      ) ?? []
  let productIdWhereSql = ''
  if (productIds.length > 0) {
    const ph = productIds.map((_, i) => `@spid${i}`).join(', ')
    productIdWhereSql = ` AND CAST(p.id AS NVARCHAR(36)) IN (${ph})`
    for (let i = 0; i < productIds.length; i++) {
      req.input(`spid${i}`, productIds[i]!)
    }
  }

  const sql = buildListSql(
    opts,
    includeBrandColumns,
    adminCatalogue,
    includeScopeColumns,
    useCategorySubtree,
    includeAlcoholColumn,
    productIdWhereSql,
    includeTabColumns,
  )
  if (search && search.trim()) {
    req.input('q', `%${search.trim()}%`)
  }
  if (categorySlug) {
    req.input('catSlug', categorySlug)
  }
  if (brandSlug && includeBrandColumns) {
    req.input('brandSlug', brandSlug)
  }
  const merchantIds = opts?.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  for (let i = 0; i < merchantIds.length; i++) {
    req.input(`mid${i}`, merchantIds[i]!)
  }
  const r = await req.query<ProductRow>(sql)
  return groupProducts(r.recordset)
}

function listProductAttempts(
  pool: ConnectionPool,
  opts: ListProductsOptions | undefined,
  adminCatalogue: boolean,
  includeTabColumns: boolean,
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
  const withAlcohol = combos.map(
    ([includeBrand, includeScope, subtree]) => () =>
      listProductsQuery(pool, opts, includeBrand, adminCatalogue, includeScope, subtree, true, includeTabColumns),
  )
  const withoutAlcohol = combos.map(
    ([includeBrand, includeScope, subtree]) => () =>
      listProductsQuery(pool, opts, includeBrand, adminCatalogue, includeScope, subtree, false, includeTabColumns),
  )
  const attempts = [...withAlcohol, ...withoutAlcohol]
  if (includeTabColumns) {
    attempts.push(...listProductAttempts(pool, opts, adminCatalogue, false))
  }
  return attempts
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
  const tabCols = await hasProductTabColumns(pool)
  const list = await runFirstSuccessful(listProductAttempts(pool, opts, false, tabCols))
  const idOrder =
    opts?.productIds
      ?.map((id) => String(id ?? '').trim().toLowerCase())
      .filter((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id),
      ) ?? []
  if (idOrder.length > 0) {
    const order = new Map(idOrder.map((id, i) => [id, i]))
    list.sort((a, b) => (order.get(a.id.toLowerCase()) ?? 999) - (order.get(b.id.toLowerCase()) ?? 999))
  }
  if (opts?.includeImages && list.length > 0) {
    await attachProductImagesToList(pool, list)
  }
  return list
}

export async function listProductsAdmin(pool: ConnectionPool, opts?: ListProductsOptions): Promise<ProductDto[]> {
  const merchantIds = opts?.payTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  const scopedOpts = merchantIds.length > 0 ? opts : { ...opts, payTodayMerchantIds: undefined }
  const tabCols = await hasProductTabColumns(pool)
  let list: ProductDto[]
  try {
    list = await runFirstSuccessful(listProductAttempts(pool, scopedOpts, true, tabCols))
  } catch (e) {
    if (merchantIds.length > 0 && isMissingPayTodayMerchantIdColumnError(e)) {
      list = await runFirstSuccessful(listProductAttempts(pool, { ...opts, payTodayMerchantIds: undefined }, true, tabCols))
    } else {
      throw e
    }
  }
  for (const p of list) {
    try {
      p.images = await loadProductImages(pool, p.id)
    } catch {
      p.images = []
    }
  }
  return list
}

export type ProductMerchantLookup =
  | { ok: true; exists: boolean; payTodayMerchantId: number | null }
  | { ok: false; reason: 'no_merchant_column' }

/** For admin access checks; `ok: false` means merchant column is absent (legacy DB — skip scope enforcement). */
export async function lookupProductPayTodayMerchantId(
  pool: ConnectionPool,
  productId: string,
): Promise<ProductMerchantLookup> {
  try {
    const r = await pool
      .request()
      .input('id', productId)
      .query<{ mid: number | null }>(`SELECT pay_today_merchant_id AS mid FROM dbo.products WHERE id = @id`)
    const row = r.recordset[0]
    if (!row) return { ok: true, exists: false, payTodayMerchantId: null }
    const mid = row.mid
    return { ok: true, exists: true, payTodayMerchantId: mid != null ? Number(mid) : null }
  } catch (e) {
    if (isMissingPayTodayMerchantIdColumnError(e)) return { ok: false, reason: 'no_merchant_column' }
    throw e
  }
}

/** Admin access: resolve `pay_today_merchant_id` for a variant via its product. */
export async function lookupVariantPayTodayMerchantId(
  pool: ConnectionPool,
  variantId: string,
): Promise<ProductMerchantLookup> {
  try {
    const r = await pool
      .request()
      .input('vid', variantId)
      .query<{ mid: number | null }>(
        `SELECT p.pay_today_merchant_id AS mid
         FROM dbo.product_variants v
         INNER JOIN dbo.products p ON p.id = v.product_id
         WHERE v.id = @vid`,
      )
    const row = r.recordset[0]
    if (!row) return { ok: true, exists: false, payTodayMerchantId: null }
    return { ok: true, exists: true, payTodayMerchantId: row.mid != null ? Number(row.mid) : null }
  } catch (e) {
    if (isMissingPayTodayMerchantIdColumnError(e)) return { ok: false, reason: 'no_merchant_column' }
    throw e
  }
}

async function getProductBySlugQuery(
  pool: ConnectionPool,
  slug: string,
  includeBrandColumns: boolean,
  includeScopeColumns: boolean,
  includeAlcoholColumn: boolean,
  includeTabColumns: boolean,
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
      v.inventory_policy,
      v.package_length_mm,
      v.package_width_mm,
      v.package_height_mm,
      v.gross_weight_g,`
    : `CAST(NULL AS INT) AS compare_at_price_cents,
      CAST(N'track' AS NVARCHAR(20)) AS inventory_policy,
      CAST(NULL AS INT) AS package_length_mm,
      CAST(NULL AS INT) AS package_width_mm,
      CAST(NULL AS INT) AS package_height_mm,
      CAST(NULL AS INT) AS gross_weight_g,`

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
      ${productTabSelectSql(includeTabColumns)}
      CAST(c.id AS NVARCHAR(36)) AS categoryId,
      c.slug AS categorySlug,
      c.name AS categoryName,
      ${brandSelect}
      p.is_active AS productIsActive,
      ${
        includeAlcoholColumn
          ? 'ISNULL(p.contains_alcohol, 0) AS productContainsAlcohol'
          : 'CAST(0 AS BIT) AS productContainsAlcohol'
      },
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
      id: string
      url: string
      sort_order: number
      variant_id: string | null
    }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, url, sort_order, CAST(variant_id AS NVARCHAR(36)) AS variant_id
      FROM dbo.product_images WHERE product_id = @pid
      ORDER BY sort_order, id
    `)
    return r.recordset.map((row) => ({
      id: row.id,
      url: row.url,
      sortOrder: row.sort_order,
      variantId: row.variant_id,
    }))
  } catch (e) {
    if (/Invalid object name|product_images/i.test(String(e))) throw e
    throw e
  }
}

const IMAGE_BATCH = 80

async function loadProductImagesForProductIds(
  pool: ConnectionPool,
  productIds: string[],
): Promise<Map<string, ProductImageDto[]>> {
  const map = new Map<string, ProductImageDto[]>()
  const ids = [...new Set(productIds.map((x) => x.trim()).filter(Boolean))]
  for (const id of ids) map.set(id, [])
  if (ids.length === 0) return map
  for (let off = 0; off < ids.length; off += IMAGE_BATCH) {
    const chunk = ids.slice(off, off + IMAGE_BATCH)
    if (chunk.length === 0) break
    const req = pool.request()
    /* Avoid @p0/@p1 names — some drivers or batches treat them as colliding with other statements. */
    const ph = chunk.map((_, i) => `@imgPid${off}_${i}`).join(', ')
    chunk.forEach((id, i) => {
      req.input(`imgPid${off}_${i}`, id)
    })
    try {
      const r = await req.query<{
        product_id: string
        id: string
        url: string
        sort_order: number
        variant_id: string | null
      }>(`
        SELECT CAST(product_id AS NVARCHAR(36)) AS product_id,
               CAST(id AS NVARCHAR(36)) AS id, url, sort_order,
               CAST(variant_id AS NVARCHAR(36)) AS variant_id
        FROM dbo.product_images
        WHERE product_id IN (${ph})
        ORDER BY product_id, sort_order, id
      `)
      for (const row of r.recordset) {
        const pid = row.product_id
        const list = map.get(pid) ?? []
        list.push({
          id: row.id,
          url: row.url,
          sortOrder: row.sort_order,
          variantId: row.variant_id,
        })
        map.set(pid, list)
      }
    } catch (e) {
      if (/Invalid object name|product_images/i.test(String(e))) return map
      throw e
    }
  }
  return map
}

export async function attachProductImagesToList(pool: ConnectionPool, items: ProductDto[]): Promise<void> {
  const ids = items.map((p) => p.id)
  const imgMap = await loadProductImagesForProductIds(pool, ids)
  for (const p of items) {
    const imgs = imgMap.get(p.id) ?? []
    p.images = imgs
    if (imgs.length > 0 && !p.imageUrl) {
      p.imageUrl = imgs[0]!.url
    }
  }
}

export async function countProductImagesForProduct(pool: ConnectionPool, productId: string): Promise<number> {
  try {
    const r = await pool
      .request()
      .input('pid', productId)
      .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_images WHERE product_id = @pid`)
    return Number(r.recordset[0]?.c ?? 0)
  } catch {
    return 0
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

async function getProductBySlugWithFlags(
  pool: ConnectionPool,
  slug: string,
  includeAlcoholColumn: boolean,
): Promise<ProductDto | null> {
  let includeTabColumns = await hasProductTabColumns(pool)
  const runQuery = async (brand: boolean, scope: boolean, tabs: boolean) => {
    const p = await getProductBySlugQuery(pool, slug, brand, scope, includeAlcoholColumn, tabs)
    if (!p) return null
    await enrichProductDetail(pool, p, scope)
    return p
  }
  try {
    return await runQuery(true, true, includeTabColumns)
  } catch (e) {
    if (isMissingProductTabColumnError(e) && includeTabColumns) {
      cachedProductTabColumns = false
      includeTabColumns = false
      try {
        return await runQuery(true, true, false)
      } catch (eTab) {
        e = eTab
      }
    }
    if (!isMissingBrandColumnError(e)) {
      if (isMissingCatalogueScopeColumnError(e)) {
        return await runQuery(true, false, includeTabColumns)
      }
      throw e
    }
    try {
      return await runQuery(false, true, includeTabColumns)
    } catch (e2) {
      if (isMissingCatalogueScopeColumnError(e2)) {
        return await runQuery(false, false, includeTabColumns)
      }
      throw e2
    }
  }
}

export async function getProductBySlug(pool: ConnectionPool, slug: string): Promise<ProductDto | null> {
  try {
    return await getProductBySlugWithFlags(pool, slug, true)
  } catch (e) {
    if (isMissingContainsAlcoholColumnError(e)) {
      return await getProductBySlugWithFlags(pool, slug, false)
    }
    throw e
  }
}

export async function replaceVariantOptions(
  exec: SqlExecutor,
  variantId: string,
  options: { name: string; value: string }[],
): Promise<void> {
  await exec.request().input('vid', variantId).query(`DELETE FROM dbo.product_variant_options WHERE variant_id = @vid`)
  let ord = 0
  for (const o of options) {
    const nm = o.name.trim()
    const val = o.value.trim()
    if (!nm || !val) continue
    await exec
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

export type ProductTabContentFields = {
  deliveryInformation?: string | null
  returnPolicy?: string | null
  warrantyInfo?: string | null
  whatsInTheBox?: string | null
}

async function applyProductTabContentPatch(
  exec: SqlExecutor,
  productId: string,
  tabs: ProductTabContentFields,
): Promise<void> {
  const pairs: Array<[keyof ProductTabContentFields, string]> = [
    ['deliveryInformation', 'delivery_information'],
    ['returnPolicy', 'return_policy'],
    ['warrantyInfo', 'warranty_info'],
    ['whatsInTheBox', 'whats_in_the_box'],
  ]
  const hasAny = pairs.some(([k]) => tabs[k] !== undefined)
  if (!hasAny) return
  try {
    for (const [key, col] of pairs) {
      if (tabs[key] === undefined) continue
      await exec
        .request()
        .input('id', productId)
        .input('v', tabs[key])
        .query(`UPDATE dbo.products SET ${col} = @v WHERE id = @id`)
    }
  } catch (e) {
    if (isMissingProductTabColumnError(e)) return
    throw e
  }
}

export async function createProductSimple(
  exec: SqlExecutor,
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
    packageLengthMm?: number | null
    packageWidthMm?: number | null
    packageHeightMm?: number | null
    grossWeightG?: number | null
    /** When set and the column exists, stamps `dbo.products.pay_today_merchant_id` after insert. */
    payTodayMerchantId?: number | null
  } & ProductTabContentFields,
): Promise<{ productId: string; variantId: string }> {
  const invPol = input.inventoryPolicy ?? 'track'
  const cmp = input.compareAtPriceCents
  if (cmp != null) {
    if (!Number.isInteger(cmp) || cmp < 0) {
      throw new Error('compareAtPriceCents must be null or a non-negative integer')
    }
    if (cmp <= input.priceCents) {
      throw new Error('List price (compare-at) must be greater than sale price (priceCents)')
    }
  }
  const r1 = exec.request()
  r1.input('slug', input.slug)
  r1.input('name', input.name)
  r1.input('description', input.description)
  r1.input('categoryId', input.categoryId)
  const bs = input.brandSlug?.trim() || null
  const bn = input.brandName?.trim() || null
  r1.input('brandSlug', bs)
  r1.input('brandName', bn)
  const img = input.imageUrl?.trim()
  const isActiveInsert = img ? 1 : 0
  let productId: string
  try {
    const pRes = await r1.query<{ id: string }>(`
      INSERT INTO dbo.products (category_id, slug, name, description, brand_slug, brand_name, is_active)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@categoryId, @slug, @name, @description, @brandSlug, @brandName, ${isActiveInsert})
    `)
    productId = pRes.recordset[0].id
  } catch (e) {
    if (!isMissingBrandColumnError(e)) throw e
    const r0 = exec.request()
    r0.input('slug', input.slug)
    r0.input('name', input.name)
    r0.input('description', input.description)
    r0.input('categoryId', input.categoryId)
    const pRes = await r0.query<{ id: string }>(`
      INSERT INTO dbo.products (category_id, slug, name, description, is_active)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@categoryId, @slug, @name, @description, ${isActiveInsert})
    `)
    productId = pRes.recordset[0].id
  }

  const mid = input.payTodayMerchantId
  if (mid != null && typeof mid === 'number' && Number.isInteger(mid) && mid >= 0) {
    try {
      await exec
        .request()
        .input('pid', productId)
        .input('mid', mid)
        .query(`UPDATE dbo.products SET pay_today_merchant_id = @mid WHERE id = @pid`)
    } catch {
      /* Column or FK missing on older schemas */
    }
  }

  await applyProductTabContentPatch(exec, productId, {
    deliveryInformation: input.deliveryInformation,
    returnPolicy: input.returnPolicy,
    warrantyInfo: input.warrantyInfo,
    whatsInTheBox: input.whatsInTheBox,
  })

  const r2 = exec.request()
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
    const vRes = await exec.request().input('productId', productId).input('sku', input.sku).input('variantName', input.variantName).input('priceCents', input.priceCents).input('currency', input.currency).query<{ id: string }>(`
      INSERT INTO dbo.product_variants (product_id, sku, name, price_cents, currency)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@productId, @sku, @variantName, @priceCents, @currency)
    `)
    variantId = vRes.recordset[0].id
  }

  const dimPatch: VariantPackageDimensionPatch = {}
  if (input.packageLengthMm !== undefined) dimPatch.packageLengthMm = input.packageLengthMm
  if (input.packageWidthMm !== undefined) dimPatch.packageWidthMm = input.packageWidthMm
  if (input.packageHeightMm !== undefined) dimPatch.packageHeightMm = input.packageHeightMm
  if (input.grossWeightG !== undefined) dimPatch.grossWeightG = input.grossWeightG
  if (
    Object.prototype.hasOwnProperty.call(dimPatch, 'packageLengthMm') ||
    Object.prototype.hasOwnProperty.call(dimPatch, 'packageWidthMm') ||
    Object.prototype.hasOwnProperty.call(dimPatch, 'packageHeightMm') ||
    Object.prototype.hasOwnProperty.call(dimPatch, 'grossWeightG')
  ) {
    await persistVariantPackageDimensionsPool(exec, variantId, dimPatch)
  }

  const rWh = exec.request()
  const wh = await rWh.query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`)
  const warehouseId = wh.recordset[0]?.id
  if (!warehouseId) {
    throw new Error('No warehouse configured')
  }

  const r3 = exec.request()
  r3.input('variantId', variantId)
  r3.input('warehouseId', warehouseId)
  r3.input('qty', input.initialStock)
  await r3.query(`
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES (@variantId, @warehouseId, @qty)
  `)

  if (img) {
    const r4 = exec.request()
    r4.input('productId', productId)
    r4.input('url', img.slice(0, 2000))
    await r4.query(`
      INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES (@productId, @url, 0)
    `)
  }

  const opts = input.variantOptions?.filter((o) => o.name.trim() && o.value.trim()) ?? []
  if (opts.length > 0) {
    try {
      await replaceVariantOptions(exec, variantId, opts)
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
  _sortOrderIgnored: number,
  variantId?: string | null,
): Promise<void> {
  const u = url.trim().slice(0, 2000)
  if (!u) {
    throw new Error('url required')
  }
  const nextRes = await pool
    .request()
    .input('pid', productId)
    .query<{ m: number }>(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM dbo.product_images WHERE product_id = @pid`)
  const so = Number(nextRes.recordset[0]?.m ?? -1) + 1
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

export async function updateProductImage(
  pool: ConnectionPool,
  productId: string,
  imageId: string,
  patch: { url?: string; variantId?: string | null },
): Promise<void> {
  if (patch.url === undefined && patch.variantId === undefined) {
    throw new Error('No fields to update')
  }
  const own = await pool
    .request()
    .input('iid', imageId)
    .input('pid', productId)
    .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_images WHERE id = @iid AND product_id = @pid`)
  if (Number(own.recordset[0]?.c ?? 0) === 0) {
    throw new Error('Image not found for product')
  }
  if (patch.url !== undefined) {
    const u = patch.url.trim().slice(0, 2000)
    if (!u) throw new Error('url cannot be empty')
    await pool.request().input('iid', imageId).input('u', u).query(`UPDATE dbo.product_images SET url = @u WHERE id = @iid`)
  }
  if (patch.variantId !== undefined) {
    const vid = patch.variantId === null ? null : String(patch.variantId).trim() || null
    if (vid) {
      const vchk = await pool
        .request()
        .input('pid', productId)
        .input('vid', vid)
        .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_variants WHERE id = @vid AND product_id = @pid`)
      if (Number(vchk.recordset[0]?.c ?? 0) === 0) {
        throw new Error('variantId does not belong to this product')
      }
    }
    try {
      await pool.request().input('iid', imageId).input('vid', vid).query(`UPDATE dbo.product_images SET variant_id = @vid WHERE id = @iid`)
    } catch {
      throw new Error('variant_id column missing — run database migrations')
    }
  }
}

export async function deleteProductImage(pool: ConnectionPool, productId: string, imageId: string): Promise<string | null> {
  const r = await pool
    .request()
    .input('iid', imageId)
    .input('pid', productId)
    .query<{ url: string }>(`SELECT TOP 1 url FROM dbo.product_images WHERE id = @iid AND product_id = @pid`)
  const row = r.recordset[0]
  if (!row) {
    throw new Error('Image not found for product')
  }
  const url = row.url
  await pool.request().input('iid', imageId).query(`DELETE FROM dbo.product_images WHERE id = @iid`)
  return url
}

export async function reorderProductImages(pool: ConnectionPool, productId: string, orderedImageIds: string[]): Promise<void> {
  if (orderedImageIds.length === 0) {
    throw new Error('orderedImageIds required')
  }
  const r = await pool
    .request()
    .input('pid', productId)
    .query<{ id: string }>(`SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.product_images WHERE product_id = @pid`)
  const existing = new Set(r.recordset.map((x) => x.id))
  if (existing.size !== orderedImageIds.length || orderedImageIds.some((id) => !existing.has(id))) {
    throw new Error('orderedImageIds must list every image for this product exactly once')
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    for (let i = 0; i < orderedImageIds.length; i++) {
      await tx
        .request()
        .input('iid', orderedImageIds[i]!)
        .input('so', i)
        .input('pid', productId)
        .query(`UPDATE dbo.product_images SET sort_order = @so WHERE id = @iid AND product_id = @pid`)
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    throw e
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
    containsAlcohol?: boolean
  } & ProductTabContentFields,
): Promise<void> {
  const has = (k: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, k)
  if (
    !has('name') &&
    !has('slug') &&
    !has('description') &&
    !has('isActive') &&
    !has('categoryId') &&
    !has('containsAlcohol') &&
    !has('deliveryInformation') &&
    !has('returnPolicy') &&
    !has('warrantyInfo') &&
    !has('whatsInTheBox')
  ) {
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
      if (patch.isActive === true) {
        const cnt = await tx
          .request()
          .input('id', productId)
          .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_images WHERE product_id = @id`)
        if (Number(cnt.recordset[0]?.c ?? 0) === 0) {
          throw new Error('Active products must have at least one catalog image')
        }
      }
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
    await applyProductTabContentPatch(tx, productId, {
      deliveryInformation: patch.deliveryInformation,
      returnPolicy: patch.returnPolicy,
      warrantyInfo: patch.warrantyInfo,
      whatsInTheBox: patch.whatsInTheBox,
    })

    if (patch.containsAlcohol !== undefined) {
      try {
        await tx
          .request()
          .input('id', productId)
          .input('alc', patch.containsAlcohol ? 1 : 0)
          .query(`UPDATE dbo.products SET contains_alcohol = @alc WHERE id = @id`)
      } catch (e) {
        if (isMissingContainsAlcoholColumnError(e)) {
          throw new Error(
            'Database is missing dbo.products.contains_alcohol. Apply migration 053 (npm run db:migrate from the backend folder) or run backend/migrations/053_merchant_hours_and_alcohol_flag.sql in SSMS.',
          )
        }
        throw e
      }
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    throw e
  }
}

function validateVariantDimensionPatch(patch: {
  packageLengthMm?: number | null
  packageWidthMm?: number | null
  packageHeightMm?: number | null
  grossWeightG?: number | null
}): void {
  const lKey = Object.prototype.hasOwnProperty.call(patch, 'packageLengthMm')
  const wKey = Object.prototype.hasOwnProperty.call(patch, 'packageWidthMm')
  const hKey = Object.prototype.hasOwnProperty.call(patch, 'packageHeightMm')
  if (lKey || wKey || hKey) {
    if (!lKey || !wKey || !hKey) {
      throw new Error('packageLengthMm, packageWidthMm, and packageHeightMm must be sent together')
    }
    const l = patch.packageLengthMm
    const w = patch.packageWidthMm
    const h = patch.packageHeightMm
    if (l == null || w == null || h == null) {
      throw new Error('Package length, width, and height (mm) cannot be cleared; send non-negative integers for all three')
    }
    for (const [label, v] of [
      ['packageLengthMm', l],
      ['packageWidthMm', w],
      ['packageHeightMm', h],
    ] as const) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
        throw new Error(`${label} must be a non-negative integer (mm)`)
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'grossWeightG') && patch.grossWeightG !== undefined && patch.grossWeightG != null) {
    const g = patch.grossWeightG
    if (typeof g !== 'number' || !Number.isInteger(g) || g < 0) {
      throw new Error('grossWeightG must be null or a non-negative integer (grams)')
    }
  }
}

export type VariantPackageDimensionPatch = {
  packageLengthMm?: number | null
  packageWidthMm?: number | null
  packageHeightMm?: number | null
  grossWeightG?: number | null
}

async function persistVariantPackageDimensionsPool(
  exec: SqlExecutor,
  variantId: string,
  patch: VariantPackageDimensionPatch,
): Promise<void> {
  if (
    !Object.prototype.hasOwnProperty.call(patch, 'packageLengthMm') &&
    !Object.prototype.hasOwnProperty.call(patch, 'packageWidthMm') &&
    !Object.prototype.hasOwnProperty.call(patch, 'packageHeightMm') &&
    !Object.prototype.hasOwnProperty.call(patch, 'grossWeightG')
  ) {
    return
  }
  validateVariantDimensionPatch(patch)
  try {
    if (Object.prototype.hasOwnProperty.call(patch, 'packageLengthMm')) {
      await exec
        .request()
        .input('vid', variantId)
        .input('pl', patch.packageLengthMm ?? null)
        .query(`UPDATE dbo.product_variants SET package_length_mm = @pl WHERE id = @vid`)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'packageWidthMm')) {
      await exec
        .request()
        .input('vid', variantId)
        .input('pw', patch.packageWidthMm ?? null)
        .query(`UPDATE dbo.product_variants SET package_width_mm = @pw WHERE id = @vid`)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'packageHeightMm')) {
      await exec
        .request()
        .input('vid', variantId)
        .input('ph', patch.packageHeightMm ?? null)
        .query(`UPDATE dbo.product_variants SET package_height_mm = @ph WHERE id = @vid`)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'grossWeightG')) {
      await exec
        .request()
        .input('vid', variantId)
        .input('gw', patch.grossWeightG ?? null)
        .query(`UPDATE dbo.product_variants SET gross_weight_g = @gw WHERE id = @vid`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/package_length_mm|Invalid column name/i.test(msg)) {
      throw new Error('Package dimension columns missing — run database migrations (019_product_variant_package_dimensions.sql)')
    }
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
    packageLengthMm?: number | null
    packageWidthMm?: number | null
    packageHeightMm?: number | null
    grossWeightG?: number | null
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
    const snapRes = await tx
      .request()
      .input('vid', variantId)
      .query<{ pc: number; ca: number | null }>(
        `SELECT price_cents AS pc, compare_at_price_cents AS ca FROM dbo.product_variants WHERE id = @vid`,
      )
    const snap = snapRes.recordset[0]
    if (!snap) {
      throw new Error('Variant not found for product')
    }
    const nextPrice = patch.priceCents !== undefined ? patch.priceCents : snap.pc
    const nextCompare = patch.compareAtPriceCents !== undefined ? patch.compareAtPriceCents : snap.ca
    if (nextCompare != null) {
      if (!Number.isInteger(nextCompare) || nextCompare < 0) {
        throw new Error('compareAtPriceCents must be null or a non-negative integer')
      }
      if (nextCompare <= nextPrice) {
        throw new Error('List price (compare-at) must be greater than sale price')
      }
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
    if (
      Object.prototype.hasOwnProperty.call(patch, 'packageLengthMm') ||
      Object.prototype.hasOwnProperty.call(patch, 'packageWidthMm') ||
      Object.prototype.hasOwnProperty.call(patch, 'packageHeightMm') ||
      Object.prototype.hasOwnProperty.call(patch, 'grossWeightG')
    ) {
      validateVariantDimensionPatch(patch)
      try {
        if (Object.prototype.hasOwnProperty.call(patch, 'packageLengthMm')) {
          await tx
            .request()
            .input('vid', variantId)
            .input('pl', patch.packageLengthMm ?? null)
            .query(`UPDATE dbo.product_variants SET package_length_mm = @pl WHERE id = @vid`)
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'packageWidthMm')) {
          await tx
            .request()
            .input('vid', variantId)
            .input('pw', patch.packageWidthMm ?? null)
            .query(`UPDATE dbo.product_variants SET package_width_mm = @pw WHERE id = @vid`)
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'packageHeightMm')) {
          await tx
            .request()
            .input('vid', variantId)
            .input('ph', patch.packageHeightMm ?? null)
            .query(`UPDATE dbo.product_variants SET package_height_mm = @ph WHERE id = @vid`)
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'grossWeightG')) {
          await tx
            .request()
            .input('vid', variantId)
            .input('gw', patch.grossWeightG ?? null)
            .query(`UPDATE dbo.product_variants SET gross_weight_g = @gw WHERE id = @vid`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/package_length_mm|Invalid column name/i.test(msg)) {
          throw new Error('Package dimension columns missing — run database migrations (019_product_variant_package_dimensions.sql)')
        }
        throw e
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

const SUPER_DEALS_RAIL_CAP = 72

/**
 * True when the active category subtree has at least one product and every active product is alcohol.
 * Used for storefront messaging when liquor gating hides the catalogue for non-adults.
 */
export async function isCategorySubtreeAlcoholOnly(pool: ConnectionPool, categorySlug: string): Promise<boolean> {
  const slug = categorySlug.trim()
  if (!slug) return false
  try {
    const r = await pool.request().input('slug', slug).query<{ v: number }>(`
      ;WITH cat_subtree AS (
        SELECT id FROM dbo.categories WHERE slug = @slug AND COALESCE(is_active, 1) = 1
        UNION ALL
        SELECT c.id FROM dbo.categories c
        INNER JOIN cat_subtree t ON c.parent_id = t.id
        WHERE COALESCE(c.is_active, 1) = 1
      ),
      agg AS (
        SELECT
          COUNT_BIG(CASE WHEN ISNULL(p.contains_alcohol, 0) = 0 THEN 1 END) AS non_alc,
          COUNT_BIG(1) AS total
        FROM dbo.products p
        WHERE p.is_active = 1 AND p.category_id IN (SELECT id FROM cat_subtree)
      )
      SELECT CAST(CASE WHEN total > 0 AND non_alc = 0 THEN 1 ELSE 0 END AS INT) AS v FROM agg
    `)
    return Number(r.recordset[0]?.v ?? 0) === 1
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/contains_alcohol/i.test(msg)) return false
    throw e
  }
}

/**
 * Store home “Super deals”: active products with compare-at above sale price on any variant,
 * ordered by largest per-product savings (then hydrated via `listProducts`).
 */
export async function listSuperDealProducts(pool: ConnectionPool): Promise<ProductDto[]> {
  const r = await pool.request().query<{ pid: string }>(`
    WITH per_product AS (
      SELECT CAST(p.id AS NVARCHAR(36)) AS pid,
        MAX(
          CASE
            WHEN v.compare_at_price_cents IS NOT NULL
              AND CAST(v.compare_at_price_cents AS BIGINT) > CAST(v.price_cents AS BIGINT)
            THEN CAST(v.compare_at_price_cents AS BIGINT) - CAST(v.price_cents AS BIGINT)
            ELSE CAST(0 AS BIGINT)
          END
        ) AS best_save
      FROM dbo.products p
      INNER JOIN dbo.product_variants v ON v.product_id = p.id
      WHERE p.is_active = 1
      GROUP BY p.id
    )
    SELECT TOP (${SUPER_DEALS_RAIL_CAP}) CAST(pid AS NVARCHAR(36)) AS pid
    FROM per_product
    WHERE best_save > 0
    ORDER BY best_save DESC, pid
  `)
  const ids = r.recordset.map((row) => String(row.pid))
  if (!ids.length) return []
  return listProducts(pool, { productIds: ids, sort: 'name', includeImages: true })
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
