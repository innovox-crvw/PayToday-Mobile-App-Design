/**
 * Demo-only retailer “stores” for client presentations.
 * Replace with API-driven merchants when backend is ready.
 */
export type DemoStore = {
  slug: string
  name: string
  shortDescription: string
}

export const DEMO_STORES: readonly DemoStore[] = [
  {
    slug: 'spar',
    name: 'Spar',
    shortDescription: 'Groceries and daily essentials',
  },
  {
    slug: 'pick-n-pay',
    name: 'Pick n Pay',
    shortDescription: 'Supermarket favourites',
  },
  {
    slug: 'woermann-brock',
    name: 'Woermann Brock',
    shortDescription: 'Local retail chain',
  },
]

/** Product slug → demo store slug (extend as you add seed products). */
const PRODUCT_TO_STORE: Readonly<Record<string, string>> = {
  'full-cream-milk': 'spar',
  'brown-bread': 'spar',
  'budget-smartphone': 'pick-n-pay',
}

export function getDemoStoreSlugForProduct(productSlug: string): string | null {
  return PRODUCT_TO_STORE[productSlug] ?? null
}

export function getDemoStoreForProduct(productSlug: string): DemoStore | null {
  const s = getDemoStoreSlugForProduct(productSlug)
  if (!s) return null
  return DEMO_STORES.find((x) => x.slug === s) ?? null
}

export function getDemoStoreBySlug(storeSlug: string | null | undefined): DemoStore | null {
  const k = (storeSlug ?? '').trim().toLowerCase()
  return DEMO_STORES.find((x) => x.slug === k) ?? null
}
