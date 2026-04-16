import type { ConnectionPool } from 'mssql'
import type { ProductDto, ProductVariantDto } from '../types/catalogue.js'

function isMissingBrandColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /brand_slug|brand_name|Invalid column name/i.test(msg)
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
  variantId: string
  sku: string
  variantName: string
  price_cents: number
  currency: string
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

async function listProductsQuery(
  pool: ConnectionPool,
  opts: ListProductsOptions | undefined,
  includeBrandColumns: boolean,
): Promise<ProductDto[]> {
  const req = pool.request()
  const search = opts?.search
  const categorySlug = opts?.categorySlug?.trim()
  const brandSlug = opts?.brandSlug?.trim()
  const sort = opts?.sort ?? 'name'

  const brandSelect = includeBrandColumns
    ? `p.brand_slug AS brandSlug,
      p.brand_name AS brandName,`
    : `CAST(NULL AS NVARCHAR(80)) AS brandSlug,
      CAST(NULL AS NVARCHAR(160)) AS brandName,`

  let sql = `
    SELECT
      CAST(p.id AS NVARCHAR(36)) AS productId,
      p.slug,
      p.name,
      p.description,
      CAST(c.id AS NVARCHAR(36)) AS categoryId,
      c.slug AS categorySlug,
      c.name AS categoryName,
      ${brandSelect}
      CAST(v.id AS NVARCHAR(36)) AS variantId,
      v.sku,
      v.name AS variantName,
      v.price_cents,
      v.currency,
      ISNULL((
        SELECT SUM(iq.quantity) FROM dbo.inventory_quantity iq WHERE iq.variant_id = v.id
      ), 0) AS stock,
      (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order) AS imageUrl
    FROM dbo.products p
    LEFT JOIN dbo.categories c ON c.id = p.category_id
    INNER JOIN dbo.product_variants v ON v.product_id = p.id
    WHERE p.is_active = 1
  `
  if (search && search.trim()) {
    sql += ` AND (p.name LIKE @q OR p.slug LIKE @q OR v.sku LIKE @q)`
    req.input('q', `%${search.trim()}%`)
  }
  if (categorySlug) {
    sql += ` AND c.slug = @catSlug`
    req.input('catSlug', categorySlug)
  }
  if (brandSlug && includeBrandColumns) {
    sql += ` AND LOWER(LTRIM(RTRIM(p.brand_slug))) = LOWER(LTRIM(RTRIM(@brandSlug)))`
    req.input('brandSlug', brandSlug)
  }
  if (sort === 'price_asc') {
    sql += ` ORDER BY v.price_cents ASC, p.name, v.sku`
  } else if (sort === 'price_desc') {
    sql += ` ORDER BY v.price_cents DESC, p.name, v.sku`
  } else {
    sql += ` ORDER BY p.name, v.sku`
  }
  const r = await req.query<ProductRow>(sql)
  return groupProducts(r.recordset)
}

export async function listProducts(pool: ConnectionPool, opts?: ListProductsOptions): Promise<ProductDto[]> {
  try {
    return await listProductsQuery(pool, opts, true)
  } catch (e) {
    if (!isMissingBrandColumnError(e)) throw e
    return listProductsQuery(pool, opts, false)
  }
}

async function getProductBySlugQuery(
  pool: ConnectionPool,
  slug: string,
  includeBrandColumns: boolean,
): Promise<ProductDto | null> {
  const req = pool.request()
  req.input('slug', slug)
  const brandSelect = includeBrandColumns
    ? `p.brand_slug AS brandSlug,
      p.brand_name AS brandName,`
    : `CAST(NULL AS NVARCHAR(80)) AS brandSlug,
      CAST(NULL AS NVARCHAR(160)) AS brandName,`
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
      CAST(v.id AS NVARCHAR(36)) AS variantId,
      v.sku,
      v.name AS variantName,
      v.price_cents,
      v.currency,
      ISNULL((
        SELECT SUM(iq.quantity) FROM dbo.inventory_quantity iq WHERE iq.variant_id = v.id
      ), 0) AS stock,
      (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order) AS imageUrl
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

export async function getProductBySlug(pool: ConnectionPool, slug: string): Promise<ProductDto | null> {
  try {
    return await getProductBySlugQuery(pool, slug, true)
  } catch (e) {
    if (!isMissingBrandColumnError(e)) throw e
    return getProductBySlugQuery(pool, slug, false)
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
  },
): Promise<{ productId: string; variantId: string }> {
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
  const vRes = await r2.query<{ id: string }>(`
    INSERT INTO dbo.product_variants (product_id, sku, name, price_cents, currency)
    OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
    VALUES (@productId, @sku, @variantName, @priceCents, @currency)
  `)
  const variantId = vRes.recordset[0].id

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

  return { productId, variantId }
}
