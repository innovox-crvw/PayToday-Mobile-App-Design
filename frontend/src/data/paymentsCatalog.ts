/**
 * Payments drill-down lists load from GET /api/hub/payment-category-items?category={slug}.
 * Hub category tiles are defined in `hubNavigationStatic.ts`.
 */

export type PaymentCategoryListStyle = 'business' | 'contacts'

export interface PaymentCategoryDef {
  id: string
  label: string
  listStyle: PaymentCategoryListStyle
}

export function tileToPaymentCategory(tile: {
  slug: string
  label: string
  listStyle: 'business' | 'contacts' | null
}): PaymentCategoryDef {
  const listStyle = tile.listStyle === 'contacts' ? 'contacts' : 'business'
  return { id: tile.slug, label: tile.label, listStyle }
}

export interface PaymentBusinessRow {
  id: string
  name: string
  /** Typical rails from API, e.g. "Wallet · Card". */
  paymentMethod?: string | null
}

export interface PaymentContactRow {
  id: string
  name: string
  initials: string
  paymentMethod?: string | null
}

export function initialsFromDisplayName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/u).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[1]!.charAt(0)}`.toUpperCase()
  }
  const one = parts[0] ?? '?'
  return one.slice(0, 2).toUpperCase()
}

export function groupedContactItems(items: PaymentContactRow[]): { letter: string; items: PaymentContactRow[] }[] {
  const sorted = [...items].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  const map = new Map<string, PaymentContactRow[]>()
  for (const c of sorted) {
    const letter = (c.name ?? '').trim().charAt(0).toUpperCase()
    const L = /[A-Z]/.test(letter) ? letter : '#'
    if (!map.has(L)) map.set(L, [])
    map.get(L)!.push(c)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, rowItems]) => ({ letter, items: rowItems }))
}

const symKey = 'sym'

export function letterBucket(name: string | null | undefined): string {
  const L = (name ?? '').trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(L) ? L : symKey
}

export function lettersForBusinesses(rows: PaymentBusinessRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    set.add(letterBucket(r.name))
  }
  const arr = [...set].filter((x) => x !== symKey).sort()
  if (set.has(symKey)) arr.push('#')
  return arr
}

export { symKey }
