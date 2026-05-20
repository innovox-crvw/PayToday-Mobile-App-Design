/**
 * Download category-matched product splash images and attach them in dbo.product_images.
 *
 * Uses keyword-tagged stock photos (loremflickr.com) derived from product name + category.
 * Run from backend/ with SQL configured in repo root .env:
 *
 *   npm run db:generate-product-images
 *   npm run db:generate-product-images -- --dry-run
 *   npm run db:generate-product-images -- --limit=20
 *   npm run db:generate-product-images -- --all
 *   npm run db:generate-product-images -- --force
 *   npm run db:generate-product-images -- --slug=my-product
 *
 * Default: only products with no image or a known placeholder URL.
 * --all: every active product (replaces the primary image with a name/category-matched photo).
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import {
  buildFlickrTags,
  buildProductSplashImageUrl,
  detectPrimaryProductTag,
  isWeakProductImageUrl,
} from '../src/lib/productSplashImage.js'

const FETCH_TIMEOUT_MS = 45_000
const DELAY_MS = 350

function argValue(prefix: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`))
  return hit ? hit.slice(prefix.length + 1).trim() : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function downloadSplashImage(url: string): Promise<Buffer> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'User-Agent': 'PayToday-ProductSplash/1.0' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!ct.includes('image')) throw new Error(`Unexpected content-type: ${ct || 'unknown'}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 4_000) throw new Error('Image too small')
    return buf
  } finally {
    clearTimeout(t)
  }
}

async function setPrimaryProductImage(
  pool: Awaited<ReturnType<typeof connectMssql>>,
  productId: string,
  publicUrl: string,
  replace: boolean,
): Promise<void> {
  if (replace) {
    await pool.request().input('pid', productId).query(`DELETE FROM dbo.product_images WHERE product_id = @pid`)
  }
  const existing = await pool
    .request()
    .input('pid', productId)
    .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.product_images WHERE product_id = @pid`)
  if (Number(existing.recordset[0]?.c ?? 0) === 0) {
    await pool
      .request()
      .input('pid', productId)
      .input('url', publicUrl)
      .query(`INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES (@pid, @url, 0)`)
    return
  }
  await pool
    .request()
    .input('pid', productId)
    .input('url', publicUrl)
    .query(`
      UPDATE dbo.product_images SET url = @url
      WHERE id = (
        SELECT TOP 1 id FROM dbo.product_images WHERE product_id = @pid ORDER BY sort_order, id
      )
    `)
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  const all = process.argv.includes('--all')
  const force = process.argv.includes('--force') || all
  const slugFilter = argValue('--slug')
  const limitRaw = argValue('--limit')
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null

  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING (or SQL_SERVER / SQL_DATABASE) in .env, then retry.')
    process.exit(1)
  }

  fs.mkdirSync(env.productImageUploadDir, { recursive: true })

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    const req = pool.request()
    let sql = `
      SELECT
        CAST(p.id AS NVARCHAR(36)) AS id,
        p.slug,
        p.name,
        c.slug AS category_slug,
        c.name AS category_name,
        (SELECT TOP 1 pi.url FROM dbo.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id) AS primary_url
      FROM dbo.products p
      LEFT JOIN dbo.categories c ON c.id = p.category_id
      WHERE COALESCE(p.is_active, 1) = 1
    `
    if (slugFilter) {
      req.input('slug', slugFilter)
      sql += ` AND p.slug = @slug`
    }
    sql += ` ORDER BY p.name`

    const rows = (await req.query<{
      id: string
      slug: string
      name: string
      category_slug: string | null
      category_name: string | null
      primary_url: string | null
    }>(sql)).recordset

    const targets = rows.filter((r) => {
      if (all || force) return true
      return isWeakProductImageUrl(r.primary_url)
    })

    const capped = limit != null && Number.isFinite(limit) ? targets.slice(0, limit) : targets

    console.log(
      `Products: ${rows.length} active · need splash: ${targets.length}` +
        (limit != null ? ` · processing: ${capped.length}` : '') +
        (dry ? ' · DRY RUN' : '') +
        (all ? ' · ALL' : force ? ' · FORCE' : ''),
    )

    let ok = 0
    let fail = 0

    for (let i = 0; i < capped.length; i++) {
      const row = capped[i]!
      const tags = buildFlickrTags({
        name: row.name,
        categorySlug: row.category_slug,
        categoryName: row.category_name,
        productSlug: row.slug,
      })
      const sourceUrl = buildProductSplashImageUrl(row.id, tags)

      if (dry) {
        console.log(`[dry-run] ${row.slug} — ${row.name}`)
        console.log(`  tags: ${tags}`)
        console.log(`  ${sourceUrl}`)
        ok++
        continue
      }

      try {
        const buf = await downloadSplashImage(sourceUrl)
        const filename = `${randomUUID()}.jpg`
        const filePath = path.join(env.productImageUploadDir, filename)
        fs.writeFileSync(filePath, buf)
        const publicUrl = `/api/uploads/products/${encodeURIComponent(filename)}`
        await setPrimaryProductImage(pool, row.id, publicUrl, force)
        const primary = detectPrimaryProductTag(row.name, row.slug)
        console.log(`[${i + 1}/${capped.length}] ${row.slug} ← ${primary ?? tags} (${tags})`)
        ok++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[${i + 1}/${capped.length}] ${row.slug} FAILED: ${msg}`)
        fail++
      }

      if (i < capped.length - 1) await sleep(DELAY_MS)
    }

    console.log(`Done. OK: ${ok}, failed: ${fail}`)
    if (fail > 0) process.exitCode = 1
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
