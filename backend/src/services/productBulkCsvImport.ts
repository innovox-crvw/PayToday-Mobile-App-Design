import type { ConnectionPool } from 'mssql'
import {
  parseCurrencyCode,
  parseNonNegativeInt,
  parseOptionalBrandName,
  parseOptionalBrandSlug,
  parseOptionalCatalogImageUrl,
  parseOptionalCompareAtPriceCents,
  parseProductDescription,
  parseProductTabText,
  parseProductName,
  parseProductSlug,
  parseSku,
  parseVariantName,
} from '../lib/inputValidators.js'
import { parseCsvDocument, stripHashCommentLines } from '../lib/simpleCsv.js'
import { listCategories } from '../repos/categoriesRepo.js'
import { createProductSimple, normalizeInventoryPolicy, type SqlExecutor } from '../repos/productsRepo.js'
import type { InventoryPolicy } from '../types/catalogue.js'

export const PRODUCT_CSV_IMPORT_MAX_BYTES = 512 * 1024
export const PRODUCT_CSV_IMPORT_MAX_ROWS = 500

export type CsvParseError = { line: number; message: string }
export type CsvRowError = { line: number; sku: string; message: string }

export type ProductBulkCsvImportResult =
  | { ok: true; applied: number }
  | { ok: false; parseErrors: CsvParseError[] }
  | { ok: false; rowErrors: CsvRowError[] }

function firstCol(headers: string[], names: string[]): number {
  for (const n of names) {
    const i = headers.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}

function cell(row: string[], col: number): string {
  if (col < 0) return ''
  const v = row[col]
  return v == null ? '' : String(v).trim()
}

function parseIntField(raw: string, label: string): number {
  const t = raw.trim()
  if (!t) throw new Error(`${label} is required`)
  const n = Number(t)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label} must be an integer`)
  }
  return n
}

function parseOptInt(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

type PreparedRow = {
  line: number
  slug: string
  name: string
  description: string
  deliveryInformation: string
  returnPolicy: string
  warrantyInfo: string
  whatsInTheBox: string
  sku: string
  variantName: string
  priceCents: number
  currency: string
  initialStock: number
  imageUrl: string | null
  categoryId: string | null
  categorySlug: string | null
  brandSlug: string | null
  brandName: string | null
  compareAtPriceCents: number | null
  inventoryPolicy: InventoryPolicy | undefined
  packageLengthMm: number | null | undefined
  packageWidthMm: number | null | undefined
  packageHeightMm: number | null | undefined
  grossWeightG: number | null | undefined
  /** Per-row merchant override when CSV column is set. */
  payTodayMerchantId?: number
}

function validateHeaders(headers: string[]): CsvParseError | null {
  const checks = [
    ['slug', firstCol(headers, ['slug', 'product_slug'])],
    ['name', firstCol(headers, ['name', 'title'])],
    ['sku', firstCol(headers, ['sku'])],
    ['price_cents', firstCol(headers, ['price_cents', 'price'])],
  ] as const
  for (const [label, idx] of checks) {
    if (idx < 0) {
      return { line: 1, message: `Missing required column for ${label} (see import template for accepted header names)` }
    }
  }
  return null
}

function prepareRows(headers: string[], rows: string[][]): { rows: PreparedRow[]; errors: CsvRowError[] } {
  const ix = {
    slug: firstCol(headers, ['slug', 'product_slug']),
    name: firstCol(headers, ['name', 'title']),
    sku: firstCol(headers, ['sku']),
    price: firstCol(headers, ['price_cents', 'price']),
    description: firstCol(headers, ['description']),
    deliveryInformation: firstCol(headers, ['delivery_information', 'delivery_info']),
    returnPolicy: firstCol(headers, ['return_policy', 'returns']),
    warrantyInfo: firstCol(headers, ['warranty_info', 'warranty']),
    whatsInTheBox: firstCol(headers, ['whats_in_the_box', 'in_the_box', 'box_contents']),
    variantName: firstCol(headers, ['variant_name', 'variant']),
    currency: firstCol(headers, ['currency']),
    stock: firstCol(headers, ['initial_stock', 'stock', 'qty']),
    imageUrl: firstCol(headers, ['image_url', 'image']),
    categorySlug: firstCol(headers, ['category_slug', 'category']),
    brandSlug: firstCol(headers, ['brand_slug']),
    brandName: firstCol(headers, ['brand_name']),
    compareAt: firstCol(headers, ['compare_at_price_cents', 'compare_at']),
    invPol: firstCol(headers, ['inventory_policy']),
    pl: firstCol(headers, ['package_length_mm']),
    pw: firstCol(headers, ['package_width_mm']),
    ph: firstCol(headers, ['package_height_mm']),
    gw: firstCol(headers, ['gross_weight_g']),
    merchantId: firstCol(headers, ['pay_today_merchant_id', 'merchant_id', 'paytoday_merchant_id']),
  }

  const slugSeen = new Set<string>()
  const skuSeen = new Set<string>()
  const prepared: PreparedRow[] = []
  const errors: CsvRowError[] = []

  for (let r = 0; r < rows.length; r++) {
    const line = r + 2
    const row = rows[r] ?? []
    if (!row.some((c) => String(c ?? '').trim() !== '')) continue

    const skuKey = cell(row, ix.sku)
    try {
      const slugRaw = cell(row, ix.slug)
      const nameRaw = cell(row, ix.name)
      if (!slugRaw || !nameRaw || !skuKey) {
        throw new Error('slug, name, and sku are required on each data row')
      }
      const slugP = parseProductSlug(slugRaw, 'slug')
      if (!slugP.ok) throw new Error(slugP.message)
      const slug = slugP.value
      if (slugSeen.has(slug)) {
        throw new Error(`Duplicate slug in file: ${slugRaw}`)
      }
      slugSeen.add(slug)
      const nameP = parseProductName(nameRaw, 'name')
      if (!nameP.ok) throw new Error(nameP.message)
      const name = nameP.value
      const skuP = parseSku(skuKey, 'sku')
      if (!skuP.ok) throw new Error(skuP.message)
      const skuNorm = skuP.value.toLowerCase()
      if (skuSeen.has(skuNorm)) {
        throw new Error(`Duplicate sku in file: ${skuKey}`)
      }
      skuSeen.add(skuNorm)

      const priceP = parseNonNegativeInt(cell(row, ix.price), 'price_cents')
      if (!priceP.ok) throw new Error(priceP.message)
      const priceCents = priceP.value

      const descP = parseProductDescription(cell(row, ix.description), 'description')
      if (!descP.ok) throw new Error(descP.message)
      const description = descP.value

      const diP = parseProductTabText(cell(row, ix.deliveryInformation), 'delivery_information')
      if (!diP.ok) throw new Error(diP.message)
      const deliveryInformation = diP.value
      const rpP = parseProductTabText(cell(row, ix.returnPolicy), 'return_policy')
      if (!rpP.ok) throw new Error(rpP.message)
      const returnPolicy = rpP.value
      const wiP = parseProductTabText(cell(row, ix.warrantyInfo), 'warranty_info')
      if (!wiP.ok) throw new Error(wiP.message)
      const warrantyInfo = wiP.value
      const boxP = parseProductTabText(cell(row, ix.whatsInTheBox), 'whats_in_the_box')
      if (!boxP.ok) throw new Error(boxP.message)
      const whatsInTheBox = boxP.value

      const variantP = parseVariantName(cell(row, ix.variantName), 'variant_name')
      if (!variantP.ok) throw new Error(variantP.message)
      const variantName = variantP.value
      const curP = parseCurrencyCode(cell(row, ix.currency), 'currency')
      if (!curP.ok) throw new Error(curP.message)
      const currency = curP.value
      const stockRaw = cell(row, ix.stock)
      const stockP = stockRaw === '' ? ({ ok: true, value: 0 } as const) : parseNonNegativeInt(stockRaw, 'initial_stock')
      if (!stockP.ok) throw new Error(stockP.message)
      const initialStock = stockP.value

      const imageUrlRaw = cell(row, ix.imageUrl)
      const imgP = parseOptionalCatalogImageUrl(imageUrlRaw === '' ? null : imageUrlRaw, 'image_url')
      if (!imgP.ok) throw new Error(imgP.message)
      const imageUrl = imgP.value

      const categorySlugCell = cell(row, ix.categorySlug)
      const categorySlug = categorySlugCell === '' ? null : categorySlugCell

      const bs = parseOptionalBrandSlug(cell(row, ix.brandSlug) || null, 'brand_slug')
      if (!bs.ok) throw new Error(bs.message)
      const bn = parseOptionalBrandName(cell(row, ix.brandName) || null, 'brand_name')
      if (!bn.ok) throw new Error(bn.message)
      const brandSlug = bs.value
      const brandName = bn.value

      const catRaw = cell(row, ix.compareAt)
      const cmpP = parseOptionalCompareAtPriceCents(catRaw === '' ? null : catRaw, priceCents, 'compare_at_price_cents')
      if (!cmpP.ok) throw new Error(cmpP.message)
      const compareAtPriceCents = cmpP.value

      const invRaw = cell(row, ix.invPol)
      const inventoryPolicy: InventoryPolicy | undefined = invRaw ? normalizeInventoryPolicy(invRaw) : undefined

      const pl = parseOptInt(cell(row, ix.pl))
      const pw = parseOptInt(cell(row, ix.pw))
      const ph = parseOptInt(cell(row, ix.ph))
      const gw = parseOptInt(cell(row, ix.gw))

      let packageLengthMm: number | null | undefined
      let packageWidthMm: number | null | undefined
      let packageHeightMm: number | null | undefined
      let grossWeightG: number | null | undefined
      const dimAny = pl != null || pw != null || ph != null
      if (dimAny) {
        if (pl == null || pw == null || ph == null) {
          throw new Error('When setting package size, package_length_mm, package_width_mm, and package_height_mm are all required')
        }
        packageLengthMm = pl
        packageWidthMm = pw
        packageHeightMm = ph
      }
      if (gw != null) {
        grossWeightG = gw
      }

      let payTodayMerchantId: number | undefined
      const midRaw = cell(row, ix.merchantId)
      if (midRaw !== '') {
        const m = parseIntField(midRaw, 'pay_today_merchant_id')
        if (m < 0) throw new Error('pay_today_merchant_id must be >= 0')
        payTodayMerchantId = m
      }

      prepared.push({
        line,
        slug,
        name,
        description,
        deliveryInformation,
        returnPolicy,
        warrantyInfo,
        whatsInTheBox,
        sku: skuP.value,
        variantName,
        priceCents,
        currency,
        initialStock,
        imageUrl,
        categoryId: null,
        categorySlug,
        brandSlug,
        brandName,
        compareAtPriceCents,
        inventoryPolicy,
        packageLengthMm,
        packageWidthMm,
        packageHeightMm,
        grossWeightG,
        ...(payTodayMerchantId !== undefined ? { payTodayMerchantId } : {}),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push({ line, sku: skuKey || '(no sku)', message: msg })
    }
  }

  return { rows: prepared, errors }
}

function resolveCategoryIds(prepared: PreparedRow[], slugToId: Map<string, string>): CsvRowError[] {
  const errors: CsvRowError[] = []
  for (const p of prepared) {
    if (!p.categorySlug?.trim()) {
      p.categoryId = null
      continue
    }
    const key = p.categorySlug.trim().toLowerCase()
    const id = slugToId.get(key)
    if (!id) {
      errors.push({ line: p.line, sku: p.sku, message: `Unknown category_slug: ${p.categorySlug}` })
    } else {
      p.categoryId = id
    }
  }
  return errors
}

export type ProductBulkCsvImportOptions = {
  /** When a row omits `pay_today_merchant_id`, stamp this merchant (signed-in user’s primary). */
  defaultPayTodayMerchantId?: number
  /** When set, each row’s resolved merchant (column or default) must be in this list. */
  allowedPayTodayMerchantIds?: number[]
}

export async function applyProductBulkCsvImport(
  pool: ConnectionPool,
  csvText: string,
  opts?: ProductBulkCsvImportOptions,
): Promise<ProductBulkCsvImportResult> {
  const raw = csvText.trim()
  if (!raw) {
    return { ok: false, parseErrors: [{ line: 1, message: 'Empty CSV' }] }
  }
  if (Buffer.byteLength(raw, 'utf8') > PRODUCT_CSV_IMPORT_MAX_BYTES) {
    return {
      ok: false,
      parseErrors: [{ line: 1, message: `CSV exceeds ${Math.round(PRODUCT_CSV_IMPORT_MAX_BYTES / 1024)} KB` }],
    }
  }

  let headers: string[]
  let dataRows: string[][]
  try {
    const doc = parseCsvDocument(stripHashCommentLines(raw))
    headers = doc.headers
    dataRows = doc.rows
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, parseErrors: [{ line: 1, message: msg }] }
  }

  const hdrErr = validateHeaders(headers)
  if (hdrErr) return { ok: false, parseErrors: [hdrErr] }

  if (dataRows.length > PRODUCT_CSV_IMPORT_MAX_ROWS) {
    return {
      ok: false,
      parseErrors: [{ line: 1, message: `Too many data rows (max ${PRODUCT_CSV_IMPORT_MAX_ROWS})` }],
    }
  }

  const { rows: prepared, errors: prepErr } = prepareRows(headers, dataRows)
  if (prepErr.length > 0) {
    return { ok: false, rowErrors: prepErr }
  }

  const cats = await listCategories(pool, { includeInactive: true })
  const slugToId = new Map<string, string>()
  for (const c of cats) {
    slugToId.set(c.slug.trim().toLowerCase(), c.id)
  }
  const catErrs = resolveCategoryIds(prepared, slugToId)
  if (catErrs.length > 0) {
    return { ok: false, rowErrors: catErrs }
  }

  const allowed = opts?.allowedPayTodayMerchantIds?.filter((n) => Number.isInteger(n) && n >= 0) ?? []
  if (allowed.length > 0) {
    const scopeErrs: CsvRowError[] = []
    for (const p of prepared) {
      const stampMid = p.payTodayMerchantId ?? opts?.defaultPayTodayMerchantId
      if (stampMid === undefined || !allowed.includes(stampMid)) {
        scopeErrs.push({
          line: p.line,
          sku: p.sku,
          message:
            'pay_today_merchant_id must be set to one of your linked merchants (or omit it to use your primary merchant)',
        })
      }
    }
    if (scopeErrs.length > 0) {
      return { ok: false, rowErrors: scopeErrs }
    }
  }

  const tx = pool.transaction()
  await tx.begin()
  const exec = tx as SqlExecutor
  try {
    for (const p of prepared) {
      const stampMid = p.payTodayMerchantId ?? opts?.defaultPayTodayMerchantId
      await createProductSimple(exec, {
        slug: p.slug,
        name: p.name,
        description: p.description,
        deliveryInformation: p.deliveryInformation || undefined,
        returnPolicy: p.returnPolicy || undefined,
        warrantyInfo: p.warrantyInfo || undefined,
        whatsInTheBox: p.whatsInTheBox || undefined,
        categoryId: p.categoryId,
        brandSlug: p.brandSlug,
        brandName: p.brandName,
        sku: p.sku,
        variantName: p.variantName,
        priceCents: p.priceCents,
        currency: p.currency,
        initialStock: p.initialStock,
        imageUrl: p.imageUrl,
        compareAtPriceCents: p.compareAtPriceCents,
        inventoryPolicy: p.inventoryPolicy,
        packageLengthMm: p.packageLengthMm,
        packageWidthMm: p.packageWidthMm,
        packageHeightMm: p.packageHeightMm,
        grossWeightG: p.grossWeightG,
        ...(stampMid !== undefined ? { payTodayMerchantId: stampMid } : {}),
      })
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      rowErrors: [{ line: 1, sku: '(import)', message: msg }],
    }
  }

  return { ok: true, applied: prepared.length }
}
