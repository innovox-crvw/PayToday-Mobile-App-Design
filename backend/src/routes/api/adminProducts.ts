import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Router, type Response } from 'express'
import multer, { MulterError } from 'multer'
import { env } from '../../config/env.js'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  isPayTodayMerchantIdAllowedForScope,
  resolveAdminMerchantScopeFromRequest,
} from '../../lib/adminMerchantScope.js'
import { isUuidString } from '../../repos/inventoryRepo.js'
import { listMerchantsForUser } from '../../repos/usersRepo.js'
import type { ConnectionPool } from 'mssql'
import {
  createProductSimple,
  deleteProductImage,
  insertProductImage,
  listProductsAdmin,
  lookupProductPayTodayMerchantId,
  normalizeInventoryPolicy,
  reorderProductImages,
  updateProductAdmin,
  updateProductImage,
  updateVariantAdmin,
} from '../../repos/productsRepo.js'
import { applyProductBulkCsvImport } from '../../services/productBulkCsvImport.js'
import {
  buildSkuImageUrlMapFromZipFile,
  listZipSkuImageKeys,
  BULK_IMPORT_IMAGES_ZIP_MAX_BYTES,
} from '../../services/bulkImportZipSkuImages.js'
import {
  parseCatalogImageUrl,
  parseCurrencyCode,
  parseNonNegativeInt,
  parseNonNegativeIntCents,
  parseOptionalBrandName,
  parseOptionalBrandSlug,
  parseOptionalCatalogImageUrl,
  parseOptionalCompareAtPriceCents,
  parseProductDescription,
  parseProductDescriptionNullable,
  parseProductName,
  parseProductSlug,
  parseSku,
  parseVariantName,
  parseVariantNameRequired,
  parseVariantOptionsArray,
} from '../../lib/inputValidators.js'

async function requireAdminProductMutationAccess(
  pool: ConnectionPool,
  productId: string,
  scope: number[] | undefined,
  res: Response,
): Promise<boolean> {
  if (!scope?.length) return true
  const lu = await lookupProductPayTodayMerchantId(pool, productId)
  if (!lu.ok) return true
  if (!lu.exists) {
    res.status(404).json({ error: 'Product not found' })
    return false
  }
  if (!isPayTodayMerchantIdAllowedForScope(scope, lu.payTodayMerchantId)) {
    res.status(403).json({ error: 'Not allowed to manage this product' })
    return false
  }
  return true
}
function readBodyNullableNonNegInt(body: Record<string, unknown>, key: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined
  const v = body[key]
  if (v === null) return null
  let n: number
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`${key} must be an integer`)
    n = v
  } else if (typeof v === 'string') {
    const t = v.trim()
    if (t === '') return null
    const parsed = Number(t)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) throw new Error(`${key} must be an integer`)
    n = parsed
  } else {
    throw new Error(`${key} must be null or an integer`)
  }
  if (n < 0) throw new Error(`${key} must be >= 0`)
  return n
}

function tryUnlinkUploadedProductFile(url: string | null | undefined): void {
  if (!url?.trim()) return
  const m = /^\/api\/uploads\/products\/([^/?#]+)$/i.exec(url.trim())
  if (!m?.[1]) return
  const name = path.basename(decodeURIComponent(m[1]))
  if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(name)) return
  const fp = path.join(env.productImageUploadDir, name)
  if (!fp.startsWith(path.resolve(env.productImageUploadDir))) return
  fs.unlink(fp, () => {})
}

export const adminProductsRouter = Router()
adminProductsRouter.use(requireAuth, requireRole('admin', 'ops'))

const allowedImageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

const productImageMulter = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        fs.mkdirSync(env.productImageUploadDir, { recursive: true })
      } catch {
        /* ignore */
      }
      cb(null, env.productImageUploadDir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const useExt = allowedImageExt.has(ext) ? ext : '.jpg'
      cb(null, `${randomUUID()}${useExt}`)
    },
  }),
  limits: { fileSize: env.productImageUploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'))
      return
    }
    cb(null, true)
  },
})

const zipImportMulter = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `sku-zip-${randomUUID()}.zip`),
  }),
  limits: { fileSize: BULK_IMPORT_IMAGES_ZIP_MAX_BYTES },
})

/** Multipart image upload → public URL under `/api/uploads/products/`. */
adminProductsRouter.post('/upload-image', (req, res) => {
  productImageMulter.single('image')(req, res, (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: `Image too large (max ${env.productImageUploadMaxBytes} bytes).` })
      return
    }
    if (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      res.status(400).json({ error: msg })
      return
    }
    const f = req.file
    if (!f?.filename) {
      res.status(400).json({ error: 'Missing file field "image"' })
      return
    }
    const url = `/api/uploads/products/${encodeURIComponent(f.filename)}`
    res.status(201).json({ url })
  })
})

adminProductsRouter.get('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const items = await listProductsAdmin(pool, scope?.length ? { payTodayMerchantIds: scope } : undefined)
  res.json({ items })
})

adminProductsRouter.post('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const slugR = parseProductSlug(req.body?.slug, 'slug')
  if (!slugR.ok) {
    res.status(400).json({ error: slugR.message, field: slugR.field, code: 'validation_error' })
    return
  }
  const nameR = parseProductName(req.body?.name, 'name')
  if (!nameR.ok) {
    res.status(400).json({ error: nameR.message, field: nameR.field, code: 'validation_error' })
    return
  }
  const descR = parseProductDescription(req.body?.description, 'description')
  if (!descR.ok) {
    res.status(400).json({ error: descR.message, field: descR.field, code: 'validation_error' })
    return
  }
  const skuR = parseSku(req.body?.sku, 'sku')
  if (!skuR.ok) {
    res.status(400).json({ error: skuR.message, field: skuR.field, code: 'validation_error' })
    return
  }
  const variantR = parseVariantName(req.body?.variantName, 'variantName')
  if (!variantR.ok) {
    res.status(400).json({ error: variantR.message, field: variantR.field, code: 'validation_error' })
    return
  }
  const priceR = parseNonNegativeIntCents(req.body?.priceCents, 'priceCents')
  if (!priceR.ok) {
    res.status(400).json({ error: priceR.message, field: priceR.field, code: 'validation_error' })
    return
  }
  const currencyR = parseCurrencyCode(req.body?.currency, 'currency')
  if (!currencyR.ok) {
    res.status(400).json({ error: currencyR.message, field: currencyR.field, code: 'validation_error' })
    return
  }
  const stockR = parseNonNegativeInt(req.body?.initialStock ?? 0, 'initialStock')
  if (!stockR.ok) {
    res.status(400).json({ error: stockR.message, field: stockR.field, code: 'validation_error' })
    return
  }
  const brandSlugR = parseOptionalBrandSlug(req.body?.brandSlug, 'brandSlug')
  if (!brandSlugR.ok) {
    res.status(400).json({ error: brandSlugR.message, field: brandSlugR.field, code: 'validation_error' })
    return
  }
  const brandNameR = parseOptionalBrandName(req.body?.brandName, 'brandName')
  if (!brandNameR.ok) {
    res.status(400).json({ error: brandNameR.message, field: brandNameR.field, code: 'validation_error' })
    return
  }
  const imageR = parseOptionalCatalogImageUrl(req.body?.imageUrl, 'imageUrl')
  if (!imageR.ok) {
    res.status(400).json({ error: imageR.message, field: imageR.field, code: 'validation_error' })
    return
  }
  const compareR = parseOptionalCompareAtPriceCents(req.body?.compareAtPriceCents, priceR.value, 'compareAtPriceCents')
  if (!compareR.ok) {
    res.status(400).json({ error: compareR.message, field: compareR.field, code: 'validation_error' })
    return
  }
  let variantOptions: { name: string; value: string }[] | undefined
  if (Array.isArray(req.body?.variantOptions)) {
    const vo = parseVariantOptionsArray(req.body.variantOptions, 'variantOptions')
    if (!vo.ok) {
      res.status(400).json({ error: vo.message, field: vo.field, code: 'validation_error' })
      return
    }
    variantOptions = vo.value
  }
  const slug = slugR.value
  const name = nameR.value
  const description = descR.value
  const sku = skuR.value
  const variantName = variantR.value
  const priceCents = priceR.value
  const currency = currencyR.value
  const initialStock = stockR.value
  const categoryId =
    typeof req.body?.categoryId === 'string' && req.body.categoryId.trim() ? req.body.categoryId.trim() : null
  const brandSlug = brandSlugR.value
  const brandName = brandNameR.value
  const imageUrl = imageR.value
  const compareAtPriceCents = compareR.value
  const inventoryPolicy =
    typeof req.body?.inventoryPolicy === 'string' ? normalizeInventoryPolicy(req.body.inventoryPolicy) : undefined
  const body = req.body as Record<string, unknown>
  let packageLengthMm: number | null | undefined
  let packageWidthMm: number | null | undefined
  let packageHeightMm: number | null | undefined
  let grossWeightG: number | null | undefined
  try {
    const pl = readBodyNullableNonNegInt(body, 'packageLengthMm')
    if (pl !== undefined) packageLengthMm = pl
    const pw = readBodyNullableNonNegInt(body, 'packageWidthMm')
    if (pw !== undefined) packageWidthMm = pw
    const ph = readBodyNullableNonNegInt(body, 'packageHeightMm')
    if (ph !== undefined) packageHeightMm = ph
    const gw = readBodyNullableNonNegInt(body, 'grossWeightG')
    if (gw !== undefined) grossWeightG = gw
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid package dimensions' })
    return
  }
  const { scope, uid } = await resolveAdminMerchantScopeFromRequest(pool, req)

  let payTodayMerchantId: number | null | undefined
  if (Object.prototype.hasOwnProperty.call(body, 'payTodayMerchantId')) {
    const raw = body.payTodayMerchantId
    if (raw === null || raw === '') {
      payTodayMerchantId = null
    } else {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        res.status(400).json({ error: 'payTodayMerchantId must be null or a non-negative integer' })
        return
      }
      payTodayMerchantId = n
    }
  } else if (uid) {
    const merchants = await listMerchantsForUser(pool, uid)
    const prim = merchants.find((m) => m.isPrimary) ?? merchants[0]
    payTodayMerchantId = prim?.payTodayMerchantId
  }

  if (scope?.length) {
    if (payTodayMerchantId == null) {
      const merchants = uid ? await listMerchantsForUser(pool, uid) : []
      const prim = merchants.find((m) => m.isPrimary) ?? merchants[0]
      payTodayMerchantId = prim?.payTodayMerchantId ?? null
    }
    if (!isPayTodayMerchantIdAllowedForScope(scope, payTodayMerchantId)) {
      res.status(403).json({ error: 'payTodayMerchantId must be one of your linked merchants' })
      return
    }
  }

  try {
    const ids = await createProductSimple(pool, {
      slug,
      name,
      description,
      categoryId,
      brandSlug: brandSlug || null,
      brandName: brandName || null,
      sku,
      variantName,
      priceCents,
      currency,
      initialStock,
      imageUrl: imageUrl || null,
      compareAtPriceCents: compareAtPriceCents ?? null,
      inventoryPolicy,
      variantOptions,
      packageLengthMm,
      packageWidthMm,
      packageHeightMm,
      grossWeightG,
      ...(payTodayMerchantId !== undefined ? { payTodayMerchantId } : {}),
    })
    res.status(201).json(ids)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

/** UTF-8 CSV bulk create: one product + default variant per row. Body `{ csv }`. */
adminProductsRouter.post('/import-csv', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const csv = typeof req.body?.csv === 'string' ? req.body.csv : ''
  if (!csv.trim()) {
    res.status(400).json({ error: 'Body must include { "csv": "..." }' })
    return
  }
  const { scope, uid: uidCsv } = await resolveAdminMerchantScopeFromRequest(pool, req)
  let defaultPayTodayMerchantId: number | undefined
  if (uidCsv) {
    const merchants = await listMerchantsForUser(pool, uidCsv)
    const prim = merchants.find((m) => m.isPrimary) ?? merchants[0]
    defaultPayTodayMerchantId = prim?.payTodayMerchantId
  }

  try {
    const result = await applyProductBulkCsvImport(pool, csv, {
      defaultPayTodayMerchantId,
      ...(scope?.length ? { allowedPayTodayMerchantIds: scope } : {}),
    })
    if (!result.ok && 'parseErrors' in result) {
      res.status(400).json({ parseErrors: result.parseErrors })
      return
    }
    if (!result.ok) {
      res.status(400).json({ rowErrors: result.rowErrors })
      return
    }
    res.status(201).json({ ok: true, applied: result.applied })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Import failed' })
  }
})

adminProductsRouter.post('/import-images-zip', (req, res) => {
  zipImportMulter.single('file')(req, res, async (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: `ZIP too large (max ${BULK_IMPORT_IMAGES_ZIP_MAX_BYTES} bytes).` })
      return
    }
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' })
      return
    }
    const pool = await getSqlPool()
    if (!pool) {
      res.status(503).json({ error: 'Database not configured' })
      return
    }
    const f = req.file
    if (!f?.path) {
      res.status(400).json({ error: 'Missing file field "file"' })
      return
    }
    const zipPath = f.path
    const dry =
      String(req.query.dryRun ?? '').trim() === '1' || String(req.query.dryRun ?? '').toLowerCase() === 'true'
    const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
    try {
      if (dry) {
        const { skuToPlaceholderUrl, warnings } = await listZipSkuImageKeys(zipPath)
        res.json({
          dryRun: true,
          skus: [...skuToPlaceholderUrl.entries()].map(([sku, placeholderUrl]) => ({ sku, placeholderUrl })),
          warnings,
        })
        return
      }
      const { skuToPublicUrl, warnings } = await buildSkuImageUrlMapFromZipFile(zipPath, env.productImageUploadDir)
      let linked = 0
      const missingSkus: string[] = []
      const skippedScope: string[] = []
      for (const [skuNorm, url] of skuToPublicUrl) {
        const r = await pool.request().input('sku', skuNorm).query<{ productId: string; variantId: string }>(`
          SELECT CAST(p.id AS NVARCHAR(36)) AS productId, CAST(v.id AS NVARCHAR(36)) AS variantId
          FROM dbo.product_variants v
          INNER JOIN dbo.products p ON p.id = v.product_id
          WHERE LOWER(LTRIM(RTRIM(v.sku))) = @sku
        `)
        const row = r.recordset[0]
        if (!row) {
          missingSkus.push(skuNorm)
          continue
        }
        if (scope?.length) {
          const lu = await lookupProductPayTodayMerchantId(pool, row.productId)
          if (
            lu.ok &&
            lu.exists &&
            lu.payTodayMerchantId != null &&
            !isPayTodayMerchantIdAllowedForScope(scope, lu.payTodayMerchantId)
          ) {
            skippedScope.push(skuNorm)
            continue
          }
        }
        await insertProductImage(pool, row.productId, url, 0, row.variantId)
        linked += 1
      }
      res.status(201).json({ ok: true, linked, missingSkus, skippedScope, warnings })
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'ZIP import failed' })
    } finally {
      await fsp.unlink(zipPath).catch(() => {})
    }
  })
})

adminProductsRouter.patch('/:productId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const productId = String(req.params.productId ?? '')
  if (!isUuidString(productId)) {
    res.status(400).json({ error: 'Invalid product id' })
    return
  }
  if (!(await requireAdminProductMutationAccess(pool, productId, scope, res))) return
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateProductAdmin>[2] = {}
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string') {
      res.status(400).json({ error: 'name must be a string', field: 'name', code: 'validation_error' })
      return
    }
    const nr = parseProductName(body.name, 'name')
    if (!nr.ok) {
      res.status(400).json({ error: nr.message, field: nr.field, code: 'validation_error' })
      return
    }
    patch.name = nr.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'slug')) {
    if (typeof body.slug !== 'string') {
      res.status(400).json({ error: 'slug must be a string', field: 'slug', code: 'validation_error' })
      return
    }
    const sr = parseProductSlug(body.slug, 'slug')
    if (!sr.ok) {
      res.status(400).json({ error: sr.message, field: sr.field, code: 'validation_error' })
      return
    }
    patch.slug = sr.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    const dr = parseProductDescriptionNullable(body.description, 'description')
    if (!dr.ok) {
      res.status(400).json({ error: dr.message, field: dr.field, code: 'validation_error' })
      return
    }
    patch.description = dr.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
    patch.isActive = Boolean(body.isActive)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
    patch.categoryId = typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'containsAlcohol')) {
    patch.containsAlcohol = Boolean(body.containsAlcohol)
  }
  try {
    await updateProductAdmin(pool, productId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Product not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminProductsRouter.patch('/:productId/variants/:variantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const productId = String(req.params.productId ?? '')
  const variantId = String(req.params.variantId ?? '')
  if (!isUuidString(productId) || !isUuidString(variantId)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  if (!(await requireAdminProductMutationAccess(pool, productId, scope, res))) return
  const body = req.body as Record<string, unknown>
  const patch: Parameters<typeof updateVariantAdmin>[3] = {}
  if (Object.prototype.hasOwnProperty.call(body, 'sku')) {
    if (typeof body.sku !== 'string') {
      res.status(400).json({ error: 'sku must be a string', field: 'sku', code: 'validation_error' })
      return
    }
    const sk = parseSku(body.sku, 'sku')
    if (!sk.ok) {
      res.status(400).json({ error: sk.message, field: sk.field, code: 'validation_error' })
      return
    }
    patch.sku = sk.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'variantName')) {
    if (typeof body.variantName !== 'string') {
      res.status(400).json({ error: 'variantName must be a string', field: 'variantName', code: 'validation_error' })
      return
    }
    const vn = parseVariantNameRequired(body.variantName, 'variantName')
    if (!vn.ok) {
      res.status(400).json({ error: vn.message, field: vn.field, code: 'validation_error' })
      return
    }
    patch.variantName = vn.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'priceCents')) {
    const pr = parseNonNegativeIntCents(body.priceCents, 'priceCents')
    if (!pr.ok) {
      res.status(400).json({ error: pr.message, field: pr.field, code: 'validation_error' })
      return
    }
    patch.priceCents = pr.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'currency')) {
    if (typeof body.currency !== 'string') {
      res.status(400).json({ error: 'currency must be a string', field: 'currency', code: 'validation_error' })
      return
    }
    const cr = parseCurrencyCode(body.currency, 'currency')
    if (!cr.ok) {
      res.status(400).json({ error: cr.message, field: cr.field, code: 'validation_error' })
      return
    }
    patch.currency = cr.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'compareAtPriceCents')) {
    let saleForCompare: number
    if (patch.priceCents !== undefined) {
      saleForCompare = patch.priceCents
    } else {
      const snap = await pool
        .request()
        .input('vid', variantId)
        .input('pid', productId)
        .query<{ pc: number | null }>(
          `SELECT TOP 1 price_cents AS pc FROM dbo.product_variants WHERE id = @vid AND product_id = @pid`,
        )
      const pc = snap.recordset[0]?.pc
      if (pc == null || !Number.isFinite(pc)) {
        res.status(404).json({ error: 'Variant not found for product' })
        return
      }
      saleForCompare = pc
    }
    const cmp = parseOptionalCompareAtPriceCents(body.compareAtPriceCents, saleForCompare, 'compareAtPriceCents')
    if (!cmp.ok) {
      res.status(400).json({ error: cmp.message, field: cmp.field, code: 'validation_error' })
      return
    }
    patch.compareAtPriceCents = cmp.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'inventoryPolicy') && typeof body.inventoryPolicy === 'string') {
    patch.inventoryPolicy = normalizeInventoryPolicy(body.inventoryPolicy)
  }
  if (Array.isArray(body?.variantOptions)) {
    const vo = parseVariantOptionsArray(body.variantOptions, 'variantOptions')
    if (!vo.ok) {
      res.status(400).json({ error: vo.message, field: vo.field, code: 'validation_error' })
      return
    }
    patch.options = vo.value ?? []
  }
  try {
    const pl = readBodyNullableNonNegInt(body, 'packageLengthMm')
    if (pl !== undefined) patch.packageLengthMm = pl
    const pw = readBodyNullableNonNegInt(body, 'packageWidthMm')
    if (pw !== undefined) patch.packageWidthMm = pw
    const ph = readBodyNullableNonNegInt(body, 'packageHeightMm')
    if (ph !== undefined) patch.packageHeightMm = ph
    const gw = readBodyNullableNonNegInt(body, 'grossWeightG')
    if (gw !== undefined) patch.grossWeightG = gw
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid dimensions' })
    return
  }
  try {
    await updateVariantAdmin(pool, productId, variantId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Variant not found for product') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminProductsRouter.put('/:productId/images/reorder', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const productId = String(req.params.productId ?? '')
  if (!isUuidString(productId)) {
    res.status(400).json({ error: 'Invalid product id' })
    return
  }
  if (!(await requireAdminProductMutationAccess(pool, productId, scope, res))) return
  const raw = req.body?.imageIds
  const imageIds = Array.isArray(raw) ? raw.map((x) => String(x ?? '').trim()).filter((x) => isUuidString(x)) : []
  if (imageIds.length === 0) {
    res.status(400).json({ error: 'imageIds must be a non-empty array of UUIDs' })
    return
  }
  try {
    await reorderProductImages(pool, productId, imageIds)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Reorder failed' })
  }
})

adminProductsRouter.patch('/:productId/images/:imageId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const productId = String(req.params.productId ?? '')
  const imageId = String(req.params.imageId ?? '')
  if (!isUuidString(productId) || !isUuidString(imageId)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  if (!(await requireAdminProductMutationAccess(pool, productId, scope, res))) return
  const body = req.body as Record<string, unknown>
  const patch: { url?: string; variantId?: string | null } = {}
  if (Object.prototype.hasOwnProperty.call(body, 'url')) {
    if (typeof body.url !== 'string') {
      res.status(400).json({ error: 'url must be a string', field: 'url', code: 'validation_error' })
      return
    }
    const ur = parseCatalogImageUrl(body.url, 'url')
    if (!ur.ok) {
      res.status(400).json({ error: ur.message, field: ur.field, code: 'validation_error' })
      return
    }
    patch.url = ur.value
  }
  if (Object.prototype.hasOwnProperty.call(body, 'variantId')) {
    const v = body.variantId
    if (v === null || v === undefined) patch.variantId = null
    else if (typeof v === 'string') patch.variantId = v.trim() ? v.trim() : null
  }
  try {
    const prev = await pool
      .request()
      .input('iid', imageId)
      .input('pid', productId)
      .query<{ url: string }>(`SELECT TOP 1 url FROM dbo.product_images WHERE id = @iid AND product_id = @pid`)
    if (!prev.recordset[0]) {
      res.status(404).json({ error: 'Image not found for product' })
      return
    }
    const oldUrl = prev.recordset[0].url
    if (patch.variantId != null && patch.variantId) {
      if (!isUuidString(patch.variantId)) {
        res.status(400).json({ error: 'variantId must be a UUID or empty' })
        return
      }
      const vchk = await pool
        .request()
        .input('pid', productId)
        .input('vid', patch.variantId)
        .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_variants WHERE id = @vid AND product_id = @pid`)
      if (Number(vchk.recordset[0]?.c ?? 0) === 0) {
        res.status(400).json({ error: 'variantId does not belong to this product' })
        return
      }
    }
    await updateProductImage(pool, productId, imageId, patch)
    if (patch.url !== undefined && patch.url.trim() && patch.url.trim() !== oldUrl.trim()) {
      tryUnlinkUploadedProductFile(oldUrl)
    }
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Image not found for product') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminProductsRouter.delete('/:productId/images/:imageId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const productId = String(req.params.productId ?? '')
  const imageId = String(req.params.imageId ?? '')
  if (!isUuidString(productId) || !isUuidString(imageId)) {
    res.status(400).json({ error: 'Invalid id' })
    return
  }
  if (!(await requireAdminProductMutationAccess(pool, productId, scope, res))) return
  try {
    const meta = await pool
      .request()
      .input('pid', productId)
      .query<{ is_active: number; img_count: number }>(`
        SELECT CAST(COALESCE(p.is_active, 0) AS INT) AS is_active,
               (SELECT COUNT_BIG(1) FROM dbo.product_images pi WHERE pi.product_id = p.id) AS img_count
        FROM dbo.products p WHERE p.id = @pid
      `)
    const row = meta.recordset[0]
    if (!row) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    if (row.is_active === 1 && Number(row.img_count ?? 0) <= 1) {
      res.status(400).json({ error: 'Cannot remove the last image from an active product. Add another image or deactivate first.' })
      return
    }
    const removedUrl = await deleteProductImage(pool, productId, imageId)
    tryUnlinkUploadedProductFile(removedUrl)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed'
    if (msg === 'Image not found for product') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminProductsRouter.post('/:productId/images', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const productId = String(req.params.productId ?? '')
  if (!isUuidString(productId)) {
    res.status(400).json({ error: 'Invalid product id' })
    return
  }
  if (!(await requireAdminProductMutationAccess(pool, productId, scope, res))) return
  const urlR = parseCatalogImageUrl(req.body?.url, 'url')
  if (!urlR.ok) {
    res.status(400).json({ error: urlR.message, field: urlR.field, code: 'validation_error' })
    return
  }
  const url = urlR.value
  const sortOrder = Number(req.body?.sortOrder ?? 0)
  const variantId =
    typeof req.body?.variantId === 'string' && req.body.variantId.trim() && isUuidString(req.body.variantId.trim())
      ? req.body.variantId.trim()
      : null
  try {
    const chk = await pool.request().input('id', productId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.products WHERE id = @id`)
    if (Number(chk.recordset[0]?.c ?? 0) === 0) {
      res.status(404).json({ error: 'Product not found' })
      return
    }
    if (variantId) {
      const vchk = await pool
        .request()
        .input('pid', productId)
        .input('vid', variantId)
        .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_variants WHERE id = @vid AND product_id = @pid`)
      if (Number(vchk.recordset[0]?.c ?? 0) === 0) {
        res.status(400).json({ error: 'variantId does not belong to this product' })
        return
      }
    }
    await insertProductImage(pool, productId, url, sortOrder, variantId)
    res.status(201).json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Insert failed' })
  }
})
