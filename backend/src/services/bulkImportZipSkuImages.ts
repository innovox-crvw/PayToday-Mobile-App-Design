/**
 * Optional ZIP of images for bulk CSV import: filenames must match SKU + image extension
 * (e.g. `SKU-001.jpg`). Files are copied into the product upload directory; returned URLs are
 * `/api/uploads/products/<uuid>.<ext>` for use as `image_url` when the CSV cell is blank.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import yauzl from 'yauzl'
import { parseSku } from '../lib/inputValidators.js'

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

/** Max ZIP payload we unpack for catalogue imports (compressed file size). */
export const BULK_IMPORT_IMAGES_ZIP_MAX_BYTES = 100 * 1024 * 1024
/** Max image files processed from one ZIP. */
export const BULK_IMPORT_IMAGES_ZIP_MAX_FILES = 600
/** Refuse a single entry larger than this (bytes), mitigates zip bombs. */
const MAX_SINGLE_UNCOMPRESSED_BYTES = 15 * 1024 * 1024

export type ZipSkuImageBuildResult = {
  skuToPublicUrl: Map<string, string>
  warnings: string[]
}

function posixBasename(fileName: string): string {
  const n = fileName.replace(/\\/g, '/')
  const i = n.lastIndexOf('/')
  return i >= 0 ? n.slice(i + 1) : n
}

function shouldSkipEntry(fileName: string): boolean {
  const n = fileName.replace(/\\/g, '/')
  if (n.startsWith('__MACOSX/') || n.includes('/__MACOSX/')) return true
  const base = posixBasename(n)
  if (base === '.DS_Store' || base.startsWith('._')) return true
  return false
}

function collectEntries(zipfile: yauzl.ZipFile): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: yauzl.Entry[] = []
    zipfile.readEntry()
    zipfile.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry)
      zipfile.readEntry()
    })
    zipfile.on('end', () => resolve(entries))
    zipfile.on('error', reject)
  })
}

async function extractEntryToPath(zipfile: yauzl.ZipFile, entry: yauzl.Entry, destPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zipfile.openReadStream(entry, (err, rs) => {
      if (err || !rs) {
        reject(err ?? new Error('openReadStream failed'))
        return
      }
      const ws = createWriteStream(destPath)
      rs.on('error', reject)
      ws.on('error', reject)
      ws.on('finish', () => resolve())
      rs.pipe(ws)
    })
  })
}

type Cand = { pathKey: string; skuNorm: string; ext: string; base: string }

/** Valid-looking `/api/uploads/products/<uuid>.jpg` for dry-run preview (no file created). */
export function placeholderUploadUrlForSkuNorm(skuNorm: string): string {
  const h = createHash('sha256').update(`zip-dryrun:${skuNorm}`).digest('hex')
  const u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  return `/api/uploads/products/${u}.jpg`
}

function collectImageCandidatesFromZipEntries(allEntries: yauzl.Entry[], warnings: string[]): Cand[] {
  const candidates: Cand[] = []
  for (const entry of allEntries) {
    if (/\/$/u.test(entry.fileName)) continue
    if (shouldSkipEntry(entry.fileName)) continue
    const base = posixBasename(entry.fileName)
    const ext = path.extname(base).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) continue
    const stem = base.slice(0, -ext.length).trim()
    if (!stem) continue
    const skuP = parseSku(stem, 'sku')
    if (!skuP.ok) {
      warnings.push(`Skipped ${base}: ${skuP.message}`)
      continue
    }
    const skuNorm = skuP.value.toLowerCase()
    if (entry.uncompressedSize > MAX_SINGLE_UNCOMPRESSED_BYTES) {
      warnings.push(`Skipped ${base}: file too large (${entry.uncompressedSize} bytes)`)
      continue
    }
    const pathKey = entry.fileName.replace(/\\/g, '/')
    candidates.push({ pathKey, skuNorm, ext, base })
  }
  return candidates
}

/** Lists SKU keys from a ZIP without extracting (for validate/dry-run). */
export async function listZipSkuImageKeys(zipPath: string): Promise<{
  skuToPlaceholderUrl: Map<string, string>
  warnings: string[]
}> {
  const warnings: string[] = []
  const zipListing = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (err, zf) => {
      if (err || !zf) reject(err ?? new Error('Unable to open ZIP'))
      else resolve(zf)
    })
  })

  let allEntries: yauzl.Entry[]
  try {
    allEntries = await collectEntries(zipListing)
  } finally {
    try {
      zipListing.close()
    } catch {
      /* ignore */
    }
  }

  const candidates = collectImageCandidatesFromZipEntries(allEntries, warnings)
  if (candidates.length > BULK_IMPORT_IMAGES_ZIP_MAX_FILES) {
    return {
      skuToPlaceholderUrl: new Map(),
      warnings: [
        `Too many image files in ZIP (max ${BULK_IMPORT_IMAGES_ZIP_MAX_FILES}).`,
        ...warnings.slice(0, 30),
      ],
    }
  }

  const skuToPlaceholderUrl = new Map<string, string>()
  const skuToPath = new Map<string, string>()
  const extractMap = new Map<string, { skuNorm: string; ext: string }>()
  for (const c of candidates) {
    const prevPath = skuToPath.get(c.skuNorm)
    if (prevPath !== undefined && prevPath !== c.pathKey) {
      warnings.push(`Duplicate image for SKU ${c.skuNorm}; using ${c.base}`)
      extractMap.delete(prevPath)
    }
    skuToPath.set(c.skuNorm, c.pathKey)
    extractMap.set(c.pathKey, { skuNorm: c.skuNorm, ext: c.ext })
  }

  for (const [, meta] of extractMap) {
    skuToPlaceholderUrl.set(meta.skuNorm, placeholderUploadUrlForSkuNorm(meta.skuNorm))
  }

  return { skuToPlaceholderUrl, warnings }
}

/**
 * Reads a ZIP of images, copies each file into `uploadDir`, and builds a map
 * `skuNormalized -> /api/uploads/products/<uuid>.ext`.
 * When multiple files map to the same SKU, the last file in archive iteration order wins.
 */
export async function buildSkuImageUrlMapFromZipFile(
  zipPath: string,
  uploadDir: string,
): Promise<ZipSkuImageBuildResult> {
  const warnings: string[] = []
  const skuToPublicUrl = new Map<string, string>()

  await fsp.mkdir(uploadDir, { recursive: true })

  const zipListing = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (err, zf) => {
      if (err || !zf) reject(err ?? new Error('Unable to open ZIP'))
      else resolve(zf)
    })
  })

  let allEntries: yauzl.Entry[]
  try {
    allEntries = await collectEntries(zipListing)
  } finally {
    try {
      zipListing.close()
    } catch {
      /* ignore */
    }
  }

  const candidates = collectImageCandidatesFromZipEntries(allEntries, warnings)

  if (candidates.length > BULK_IMPORT_IMAGES_ZIP_MAX_FILES) {
    return {
      skuToPublicUrl: new Map(),
      warnings: [
        `Too many image files in ZIP (max ${BULK_IMPORT_IMAGES_ZIP_MAX_FILES}).`,
        ...warnings.slice(0, 30),
      ],
    }
  }

  /** pathKey -> meta; same SKU from multiple paths → last path wins */
  const extractMap = new Map<string, { skuNorm: string; ext: string }>()
  const skuToPath = new Map<string, string>()
  for (const c of candidates) {
    const prevPath = skuToPath.get(c.skuNorm)
    if (prevPath !== undefined && prevPath !== c.pathKey) {
      warnings.push(`Duplicate image for SKU ${c.skuNorm}; using ${c.base}`)
      extractMap.delete(prevPath)
    }
    skuToPath.set(c.skuNorm, c.pathKey)
    extractMap.set(c.pathKey, { skuNorm: c.skuNorm, ext: c.ext })
  }

  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('Unable to open ZIP for extraction'))
        return
      }
      zipfile.on('entry', (entry) => {
        const key = entry.fileName.replace(/\\/g, '/')
        const meta = extractMap.get(key)
        if (!meta || /\/$/u.test(entry.fileName)) {
          zipfile.readEntry()
          return
        }
        const outName = `${randomUUID()}${meta.ext}`
        const destAbs = path.join(uploadDir, outName)
        void extractEntryToPath(zipfile, entry, destAbs)
          .then(() => {
            skuToPublicUrl.set(meta.skuNorm, `/api/uploads/products/${encodeURIComponent(outName)}`)
            zipfile.readEntry()
          })
          .catch(reject)
      })
      zipfile.on('end', () => resolve())
      zipfile.on('error', reject)
      zipfile.readEntry()
    })
  })

  return { skuToPublicUrl, warnings }
}
