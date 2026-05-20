/** Category slugs treated as alcohol for admin hours (align with backend AGE_RESTRICTED_CATEGORY_SLUGS). */
export const LIQUOR_CATEGORY_SLUGS = new Set(['liquor', 'wine', 'beer', 'spirits'])

export function slugTouchesLiquorCategory(slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase()
  if (!s) return false
  if (LIQUOR_CATEGORY_SLUGS.has(s)) return true
  return s.startsWith('liquor')
}

export function summariesTouchLiquorCategory(categorySummary: string | null, productCategorySlugs: (string | null)[]): boolean {
  const fromSummary = (categorySummary ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  for (const slug of [...fromSummary, ...productCategorySlugs]) {
    if (slugTouchesLiquorCategory(slug)) return true
  }
  return false
}
