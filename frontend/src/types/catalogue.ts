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
  /** Retail category slug from the API (e.g. electronics, groceries). */
  categorySlug: string
  categoryName: string
  /** In-store / retailer brand (e.g. spar) — used for shop filters and related products. */
  brandSlug: string | null
  brandName: string | null
  imageUrl: string | null
  variants: ProductVariantDto[]
  /** Admin API only — inactive products are hidden from the storefront. */
  isActive?: boolean
}

export interface ProductListResponse {
  source: string
  items: ProductDto[]
  /** Legacy: API no longer serves in-memory products; kept for optional tooling. */
  catalogFallbackReason?: 'sql_unreachable'
  sqlConnectHint?: string
}
