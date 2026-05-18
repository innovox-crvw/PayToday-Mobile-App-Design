import type { StoreCategoryDto } from '../types/storefront'

/**
 * True when the category for `categorySlug` or any of its ancestors has `financeEligible`
 * (admin checkbox on Categories). Product pages also require price ≥ N$5,000 to show financing.
 */
export function categorySlugEligibleForFinance(categorySlug: string, categories: StoreCategoryDto[]): boolean {
  if (!categorySlug.trim() || categories.length === 0) return false
  const slugLower = categorySlug.trim().toLowerCase()
  const cat = categories.find((c) => c.slug.trim().toLowerCase() === slugLower)
  if (!cat) return false
  const byId = new Map(categories.map((c) => [c.id, c]))
  let cur: StoreCategoryDto | undefined = cat
  let d = 0
  while (cur && d < 64) {
    if (cur.financeEligible) return true
    const pid = cur.parentId?.trim()
    if (!pid) break
    cur = byId.get(pid)
    d += 1
  }
  return false
}
