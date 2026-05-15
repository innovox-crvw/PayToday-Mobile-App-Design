import type { StoreCategoryDto } from '../types/storefront'

/** True when `categorySlug` matches a configured root or sits under it in `categories`. */
export function categorySlugTouchesRoots(
  categorySlug: string,
  categories: StoreCategoryDto[],
  rootsLower: string[],
): boolean {
  if (!categorySlug.trim() || rootsLower.length === 0) return false
  const slugLower = categorySlug.trim().toLowerCase()
  const rootSet = new Set(rootsLower)
  if (rootSet.has(slugLower)) return true
  const cat = categories.find((c) => c.slug.trim().toLowerCase() === slugLower)
  if (!cat) return false
  const byId = new Map(categories.map((c) => [c.id, c]))
  let cur: StoreCategoryDto | undefined = cat
  let d = 0
  while (cur && d < 64) {
    if (rootSet.has(cur.slug.trim().toLowerCase())) return true
    const pid = cur.parentId?.trim()
    if (!pid) break
    cur = byId.get(pid)
    d += 1
  }
  return false
}
