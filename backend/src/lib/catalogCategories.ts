/**
 * Category tree aligned with catalog-100-products.csv / buildCatalog100Products().
 * Single source for migrations and db:sync-categories.
 */

import type { CategoryIconKey } from './categoryIconKeys.js'

export type CatalogCategoryDef = {
  slug: string
  name: string
  parentSlug: string | null
  sortOrder: number
  iconKey: CategoryIconKey | null
}

/** All category slugs used by the demo catalogue (parents before children in array order). */
export const CATALOG_CATEGORIES: CatalogCategoryDef[] = [
  { slug: 'groceries', name: 'Groceries', parentSlug: null, sortOrder: 10, iconKey: 'groceries' },
  { slug: 'fresh-produce', name: 'Fresh produce', parentSlug: 'groceries', sortOrder: 11, iconKey: 'produce' },
  { slug: 'soft-drinks', name: 'Soft drinks', parentSlug: 'groceries', sortOrder: 12, iconKey: 'beverages' },
  { slug: 'snacks-pantry', name: 'Snacks & pantry', parentSlug: 'groceries', sortOrder: 13, iconKey: 'snacks' },
  { slug: 'electronics', name: 'Electronics', parentSlug: null, sortOrder: 20, iconKey: 'electronics' },
  { slug: 'accessories', name: 'Phone & laptop accessories', parentSlug: 'electronics', sortOrder: 21, iconKey: 'accessories' },
  { slug: 'audio', name: 'Audio', parentSlug: 'electronics', sortOrder: 22, iconKey: 'audio' },
  { slug: 'home', name: 'Home & kitchen', parentSlug: null, sortOrder: 30, iconKey: 'home' },
  { slug: 'cleaning', name: 'Cleaning & laundry', parentSlug: 'home', sortOrder: 31, iconKey: 'cleaning' },
  { slug: 'liquor', name: 'Liquor & beverages', parentSlug: null, sortOrder: 40, iconKey: 'beverages' },
  { slug: 'wine', name: 'Wine', parentSlug: 'liquor', sortOrder: 41, iconKey: 'beverages' },
  { slug: 'beer', name: 'Beer & cider', parentSlug: 'liquor', sortOrder: 42, iconKey: 'beverages' },
  { slug: 'spirits', name: 'Spirits', parentSlug: 'liquor', sortOrder: 43, iconKey: 'beverages' },
]

export const CATALOG_CATEGORY_SLUGS = new Set(CATALOG_CATEGORIES.map((c) => c.slug))
