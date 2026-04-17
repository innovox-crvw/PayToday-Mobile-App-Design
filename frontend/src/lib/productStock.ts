import type { ProductDto } from '../types/catalogue'

/** Sum of stock across every variant (can exceed what the default PDP line shows). */
export function totalListedStock(product: ProductDto): number {
  return product.variants.reduce((sum, v) => sum + Math.max(0, v.stockQuantity ?? 0), 0)
}

/**
 * Stock for the first variant — same row the storefront product page uses for price, SKU, and quantity.
 * Use this on shop tiles so the number matches the detail page when a product has multiple SKUs.
 */
export function storefrontPrimaryVariantStock(product: ProductDto): number {
  const v0 = product.variants[0]
  return Math.max(0, v0?.stockQuantity ?? 0)
}

/** Min/max price across variants (same currency assumed). */
export function storefrontVariantPriceRange(product: ProductDto): { min: number; max: number; currency: string } | null {
  const v0 = product.variants[0]
  if (!v0) return null
  let min = v0.priceCents
  let max = v0.priceCents
  for (const v of product.variants) {
    min = Math.min(min, v.priceCents)
    max = Math.max(max, v.priceCents)
  }
  return { min, max, currency: v0.currency }
}
