import { resolveAdminMediaUrl } from './resolveMediaUrl'

/**
 * Unsplash URLs when `image_url` is missing or invalid (free to use).
 * Keys match `store_promotions.slug` / static promotion slugs where possible.
 */
const PROMOTION_UNSPLASH_BY_SLUG: Record<string, string> = {
  welcome:
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80',
  pickup:
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80',
  secure:
    'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1400&q=80',
  'weekend-snacks':
    'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=1200&q=80',
  'home-essentials':
    'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
}

const DEFAULT_PROMOTION_UNSPLASH =
  'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80'

/** Extra Unsplash art for arbitrary promotion slugs (stable pick via hash). */
const ROTATING_PROMOTION_UNSPLASH = [
  DEFAULT_PROMOTION_UNSPLASH,
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80',
] as const

function unsplashForUnknownSlug(slug: string): string {
  let h = 0
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return ROTATING_PROMOTION_UNSPLASH[h % ROTATING_PROMOTION_UNSPLASH.length]!
}

/**
 * Resolved image URL for storefront promotions: stored URL (incl. `/api/...`) or Unsplash placeholder.
 */
export function resolvePromotionDisplayUrl(
  slug: string | null | undefined,
  imageUrl: string | null | undefined,
): string {
  const raw = imageUrl?.trim()
  if (raw) {
    const resolved = resolveAdminMediaUrl(raw).trim()
    if (resolved) return resolved
  }
  const key = (slug ?? '').toLowerCase()
  if (key && PROMOTION_UNSPLASH_BY_SLUG[key]) return PROMOTION_UNSPLASH_BY_SLUG[key]!
  if (key) return unsplashForUnknownSlug(key)
  return DEFAULT_PROMOTION_UNSPLASH
}
