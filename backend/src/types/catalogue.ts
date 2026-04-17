export interface ProductVariantDto {
  id: string
  sku: string
  name: string
  priceCents: number
  currency: string
  stockQuantity: number
}

export interface ProductDto {
  id: string
  slug: string
  name: string
  description: string
  categoryId: string
  /** Lowercase slug from `categories.slug` (e.g. electronics, groceries). */
  categorySlug: string
  categoryName: string
  /** Retailer / in-store brand (e.g. spar) for shop filtering and product detail. */
  brandSlug: string | null
  brandName: string | null
  imageUrl: string | null
  variants: ProductVariantDto[]
  /** Present on admin catalogue responses. */
  isActive?: boolean
}
