/**
 * Client-side mirrors of [`backend/src/lib/inputValidators.ts`](../../backend/src/lib/inputValidators.ts).
 * The API remains authoritative; these helpers only improve UX before requests.
 */

export type FieldParseResult<T> = { ok: true; value: T } | { ok: false; message: string; field: string }

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

function isValidEmailFormat(email: string): boolean {
  const s = email.trim()
  if (s.length < 5 || s.length > 254) return false
  return EMAIL_RE.test(s)
}

function hasAsciiControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if ((c >= 0 && c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 31) || c === 127) return true
  }
  return false
}

export const INPUT_LIMITS = {
  emailMax: 320,
  slugMax: 160,
  skuMax: 80,
  productNameMax: 300,
  urlMax: 2000,
} as const

export function parseEmailString(raw: unknown, field = 'email'): FieldParseResult<string> {
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim().toLowerCase()
  if (!t) return { ok: false, message: 'Email is required', field }
  if (t.length > INPUT_LIMITS.emailMax) return { ok: false, message: 'Email is too long', field }
  if (!isValidEmailFormat(t)) return { ok: false, message: 'Invalid email format', field }
  return { ok: true, value: t }
}

const CATALOG_UPLOAD_REL_PATH_RE = /^\/api\/uploads\/products\/[a-f0-9-]{36}\.[a-z0-9]+$/i

export function parseOptionalCatalogImageUrl(raw: unknown, field: string): FieldParseResult<string | null> {
  if (raw == null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > INPUT_LIMITS.urlMax) return { ok: false, message: 'URL is too long', field }
  if (CATALOG_UPLOAD_REL_PATH_RE.test(t)) return { ok: true, value: t }
  const lower = t.slice(0, 12).toLowerCase()
  if (
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:')
  ) {
    return { ok: false, message: 'Only https or upload image URLs are allowed', field }
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
  if (t.includes('\u0000') || hasAsciiControlChars(t)) return { ok: false, message: 'Name contains invalid characters', field }
  return { ok: true, value: t }
}

export function parseNonNegativeInt(raw: unknown, field: string): FieldParseResult<number> {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(String(raw).trim()) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { ok: false, message: 'Must be a non-negative integer', field }
  }
  return { ok: true, value: n }
}

export function parseNonNegativeIntCents(raw: unknown, field: string): FieldParseResult<number> {
  return parseNonNegativeInt(raw, field)
}

const DISPLAY_NAME_MAX = 200

export function parseOptionalDisplayName(raw: unknown, field = 'fullName'): FieldParseResult<string | null> {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, message: 'Must be a string', field }
  const t = raw.trim()
  if (!t) return { ok: true, value: null }
  if (t.length > DISPLAY_NAME_MAX) return { ok: false, message: 'Name is too long', field }
  if (t.includes('\u0000') || hasAsciiControlChars(t)) return { ok: false, message: 'Name contains invalid characters', field }
  return { ok: true, value: t }
}
