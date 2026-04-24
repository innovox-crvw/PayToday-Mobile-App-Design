/** Keys allowed for `dbo.categories.icon_key` — must match frontend `categoryIcons` registry. */
export const CATEGORY_ICON_KEYS = [
  'electronics',
  'fashion',
  'home',
  'groceries',
  'basket',
  'pets',
  'sports',
  'beauty',
  'toys',
  'automotive',
  'books',
  'garden',
  'cleaning',
  'beverages',
  'snacks',
  'produce',
  'accessories',
  'audio',
] as const

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number]

const ALLOWED = new Set<string>(CATEGORY_ICON_KEYS)

export function isValidCategoryIconKey(raw: string | null | undefined): raw is CategoryIconKey {
  if (!raw || typeof raw !== 'string') return false
  return ALLOWED.has(raw.trim().toLowerCase())
}

export function normalizeCategoryIconKey(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase()
  return ALLOWED.has(t) ? t : null
}
