import { isValidEmailFormat } from './emailValidation.js'

/** Result of parsing a single input field for API handlers. */
export type FieldParseResult<T> = { ok: true; value: T } | { ok: false; message: string; field: string }

const ASCII_CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export const INPUT_LIMITS = {
  emailMax: 320,
  slugMax: 160,
  skuMax: 80,
  productNameMax: 300,
  variantNameMax: 120,
  descriptionMax: 8000,
  urlMax: 2000,
  displayNameMax: 200,
  addressLineMax: 200,
  cityMax: 120,
  regionMax: 120,
  postalMax: 32,
  countryMax: 3,
  labelMax: 80,
  guestPersonNameMax: 120,
  phonePaymentMax: 40,
  variantOptionNameMax: 64,
  variantOptionValueMax: 120,
  /** Sanity ceiling for catalogue money and stock integers. */
  priceCentsMax: 1_000_000_000,
} as const

function hasAsciiControlChars(s: string): boolean {
  return ASCII_CTRL_RE.test(s)
}

/** Login / register / guest checkout email (normalized lowercase). */
export function parseEmailString(raw: unknown, field = 'email'): FieldParseResult<string> {
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim().toLowerCase()
  if (!t) return { ok: false, message: 'Email is required', field }
  if (t.length > INPUT_LIMITS.emailMax) return { ok: false, message: 'Email is too long', field }
  if (!isValidEmailFormat(t)) return { ok: false, message: 'Invalid email format', field }
  return { ok: true, value: t }
}

/**
 * Catalog / marketing image URLs: `https` only (blocks `data:`, `file:`, `javascript:` pasted into JSON).
 * Empty string or null → null.
 */
export function parseOptionalHttpsCatalogImageUrl(raw: unknown, field: string): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > INPUT_LIMITS.urlMax) return { ok: false, message: 'URL is too long', field }
  const lower = t.slice(0, 12).toLowerCase()
  if (
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:')
  ) {
    return { ok: false, message: 'Only https image URLs are allowed', field }
  }
  if (!t.startsWith('https://')) {
    return { ok: false, message: 'Image URL must use https', field }
  }
  try {
    void new URL(t)
  } catch {
    return { ok: false, message: 'Invalid image URL', field }
  }
  return { ok: true, value: t }
}

/** Same-origin product upload path from `POST /api/admin/products/upload-image`. */
const CATALOG_UPLOAD_REL_PATH_RE = /^\/api\/uploads\/products\/[a-f0-9-]{36}\.[a-z0-9]+$/i

/**
 * Catalog image: `https://…` **or** a safe relative upload path under `/api/uploads/products/`.
 * Rejects `data:`, `file:`, `javascript:`, and other schemes on absolute URLs.
 */
export function parseOptionalCatalogImageUrl(raw: unknown, field: string): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > INPUT_LIMITS.urlMax) return { ok: false, message: 'URL is too long', field }
  if (CATALOG_UPLOAD_REL_PATH_RE.test(t)) return { ok: true, value: t }
  return parseOptionalHttpsCatalogImageUrl(t, field)
}

/** Non-empty catalog image URL (`https` or upload path). */
export function parseCatalogImageUrl(raw: unknown, field = 'url'): FieldParseResult<string> {
  const r = parseOptionalCatalogImageUrl(raw, field)
  if (!r.ok) return r
  if (r.value == null || r.value === '') {
    return { ok: false, message: 'URL is required', field }
  }
  return { ok: true, value: r.value }
}

/** Product URL slug: lowercase `a-z0-9` with single hyphens, no leading/trailing hyphen. */
const PRODUCT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function parseProductSlug(raw: unknown, field = 'slug'): FieldParseResult<string> {
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim().toLowerCase()
  if (!t) return { ok: false, message: 'Slug is required', field }
  if (t.length > INPUT_LIMITS.slugMax) return { ok: false, message: 'Slug is too long', field }
  if (!PRODUCT_SLUG_RE.test(t)) {
    return {
      ok: false,
      message: 'Slug must be lowercase letters, digits, and hyphens only (no leading/trailing hyphen)',
      field,
    }
  }
  return { ok: true, value: t }
}

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,79}$/

export function parseSku(raw: unknown, field = 'sku'): FieldParseResult<string> {
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: false, message: 'SKU is required', field }
  if (t.length > INPUT_LIMITS.skuMax) return { ok: false, message: 'SKU is too long', field }
  if (!SKU_RE.test(t)) {
    return {
      ok: false,
      message: 'SKU must start with a letter or digit and may contain letters, digits, . _ - /',
      field,
    }
  }
  if (hasAsciiControlChars(t)) return { ok: false, message: 'SKU contains invalid characters', field }
  return { ok: true, value: t }
}

export function parseProductName(raw: unknown, field = 'name'): FieldParseResult<string> {
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: false, message: 'Name is required', field }
  if (t.length > INPUT_LIMITS.productNameMax) return { ok: false, message: 'Name is too long', field }
  if (t.includes('\u0000')) return { ok: false, message: 'Name contains invalid characters', field }
  if (hasAsciiControlChars(t)) return { ok: false, message: 'Name contains invalid characters', field }
  return { ok: true, value: t }
}

export function parseProductDescription(raw: unknown, field = 'description'): FieldParseResult<string> {
  if (raw == null) return { ok: true, value: '' }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (t.length > INPUT_LIMITS.descriptionMax) return { ok: false, message: 'Description is too long', field }
  if (t.includes('\u0000')) return { ok: false, message: 'Description contains invalid characters', field }
  return { ok: true, value: t }
}

/** PATCH: `null` clears; empty string → `null`. */
export function parseProductDescriptionNullable(raw: unknown, field = 'description'): FieldParseResult<string | null> {
  if (raw === null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string or null', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > INPUT_LIMITS.descriptionMax) return { ok: false, message: 'Description is too long', field }
  if (t.includes('\u0000')) return { ok: false, message: 'Description contains invalid characters', field }
  return { ok: true, value: t }
}

const CURRENCY_RE = /^[A-Z]{3}$/

export function parseCurrencyCode(raw: unknown, field = 'currency'): FieldParseResult<string> {
  const s = typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : 'NAD'
  if (!CURRENCY_RE.test(s)) return { ok: false, message: 'currency must be a 3-letter ISO code', field }
  return { ok: true, value: s }
}

export function parseNonNegativeInt(raw: unknown, field: string): FieldParseResult<number> {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(String(raw).trim()) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, message: 'Must be a non-negative integer', field }
  }
  if (n > INPUT_LIMITS.priceCentsMax) {
    return { ok: false, message: 'Amount is too large', field }
  }
  return { ok: true, value: n }
}

export function parseNonNegativeIntCents(raw: unknown, field: string): FieldParseResult<number> {
  return parseNonNegativeInt(raw, field)
}

export function parseOptionalCompareAtPriceCents(
  raw: unknown,
  salePriceCents: number,
  field = 'compareAtPriceCents',
): FieldParseResult<number | null> {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(String(raw).trim()) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, message: 'compare-at price must be null or a non-negative integer (cents)', field }
  }
  if (n === 0) return { ok: true, value: null }
  if (n <= salePriceCents) {
    return { ok: false, message: 'List price must be greater than sale price when set', field }
  }
  if (n > INPUT_LIMITS.priceCentsMax) return { ok: false, message: 'Amount is too large', field }
  return { ok: true, value: n }
}

export function parseVariantName(raw: unknown, field = 'variantName'): FieldParseResult<string> {
  if (raw == null || raw === '') return { ok: true, value: 'Default' }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: 'Default' }
  if (t.length > INPUT_LIMITS.variantNameMax) return { ok: false, message: 'Variant name is too long', field }
  if (hasAsciiControlChars(t)) return { ok: false, message: 'Variant name contains invalid characters', field }
  return { ok: true, value: t }
}

/** Variant display name for PATCH (non-empty). */
export function parseVariantNameRequired(raw: unknown, field = 'variantName'): FieldParseResult<string> {
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: false, message: 'variantName cannot be empty', field }
  if (t.length > INPUT_LIMITS.variantNameMax) return { ok: false, message: 'Variant name is too long', field }
  if (hasAsciiControlChars(t)) return { ok: false, message: 'Variant name contains invalid characters', field }
  return { ok: true, value: t }
}

const BRAND_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function parseOptionalBrandSlug(raw: unknown, field = 'brandSlug'): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim().toLowerCase()
  if (!t) return { ok: true, value: null }
  if (t.length > 80) return { ok: false, message: 'brand_slug is too long', field }
  if (!BRAND_SLUG_RE.test(t)) return { ok: false, message: 'brand_slug has invalid characters', field }
  return { ok: true, value: t }
}

export function parseOptionalBrandName(raw: unknown, field = 'brandName'): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > 160) return { ok: false, message: 'brand_name is too long', field }
  if (t.includes('\u0000') || hasAsciiControlChars(t)) return { ok: false, message: 'brand_name contains invalid characters', field }
  return { ok: true, value: t }
}

/** Profile / register display name (optional empty → null). */
export function parseOptionalDisplayName(raw: unknown, field = 'fullName'): FieldParseResult<string | null> {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > INPUT_LIMITS.displayNameMax) return { ok: false, message: 'Name is too long', field }
  if (t.includes('\u0000') || hasAsciiControlChars(t)) return { ok: false, message: 'Name contains invalid characters', field }
  return { ok: true, value: t }
}

/** Guest / payer first or last name (empty → null). */
export function parseOptionalGuestPersonName(raw: unknown, field: string): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim().slice(0, INPUT_LIMITS.guestPersonNameMax)
  if (!t) return { ok: true, value: null }
  if (hasAsciiControlChars(t)) return { ok: false, message: 'Contains invalid characters', field }
  return { ok: true, value: t }
}

/** Phone digits / common punctuation only, bounded (payment intent payer). */
export function parseOptionalPhoneDigits(raw: unknown, field: string): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim().slice(0, INPUT_LIMITS.phonePaymentMax)
  if (!t) return { ok: true, value: null }
  if (!/^[\d+\-().\s]{5,40}$/.test(t)) {
    return { ok: false, message: 'Phone must contain only digits and + ( ) - . space', field }
  }
  return { ok: true, value: t }
}

export function parseAddressTextLine(raw: unknown, field: string, maxLen: number, required: boolean): FieldParseResult<string> {
  if (typeof raw !== 'string') {
    return required ? { ok: false, message: 'Must be a string', field } : { ok: true, value: '' }
  }
  const t = raw.trim()
  if (required && !t) return { ok: false, message: 'Required', field }
  if (t.length > maxLen) return { ok: false, message: 'Too long', field }
  if (t.includes('\u0000') || hasAsciiControlChars(t)) return { ok: false, message: 'Invalid characters', field }
  return { ok: true, value: t }
}

export function parseOptionalCountryCode(raw: unknown, field = 'country'): FieldParseResult<string> {
  const rawStr = typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : 'NA'
  if (rawStr.length > INPUT_LIMITS.countryMax || !/^[A-Z]{2,3}$/.test(rawStr)) {
    return { ok: false, message: 'country must be a 2–3 letter ISO code', field }
  }
  return { ok: true, value: rawStr }
}

export type VariantOptionRow = { name: string; value: string }

/** Parses `variantOptions` array items; skips empty pairs. */
export function parseVariantOptionsArray(raw: unknown, field = 'variantOptions'): FieldParseResult<VariantOptionRow[] | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined }
  if (!Array.isArray(raw)) return { ok: false, message: 'Must be an array', field }
  const out: VariantOptionRow[] = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const n = typeof o.name === 'string' ? o.name.trim() : ''
    const v = typeof o.value === 'string' ? o.value.trim() : ''
    if (!n && !v) continue
    if (!n || !v) {
      return { ok: false, message: 'Each variant option needs both name and value', field: `${field}[${i}]` }
    }
    if (n.length > INPUT_LIMITS.variantOptionNameMax) {
      return { ok: false, message: 'Option name is too long', field: `${field}[${i}].name` }
    }
    if (v.length > INPUT_LIMITS.variantOptionValueMax) {
      return { ok: false, message: 'Option value is too long', field: `${field}[${i}].value` }
    }
    if (hasAsciiControlChars(n) || hasAsciiControlChars(v)) {
      return { ok: false, message: 'Option contains invalid characters', field: `${field}[${i}]` }
    }
    out.push({ name: n, value: v })
  }
  return { ok: true, value: out.length ? out : undefined }
}
