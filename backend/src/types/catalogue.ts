export type InventoryPolicy = 'track' | 'continue' | 'not_tracked'

export interface VariantOptionDto {
  name: string
  value: string
}

export interface ProductImageDto {
  /** Row id in `dbo.product_images` (admin edit / reorder / delete). */
  id?: string
  url: string
  sortOrder: number
  /** When set, this image is shown first for that variant in the gallery. */
  variantId: string | null
}

export interface ProductVariantDto {
  id: string
  sku: string
  name: string
  priceCents: number
  currency: string
  stockQuantity: number
  compareAtPriceCents: number | null
  inventoryPolicy: InventoryPolicy
  options: VariantOptionDto[]
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
  /** Primary tile image (first product-level gallery image, else any). */
  imageUrl: string | null
  /** Full gallery — detail responses only; list may omit or send empty. */
  images?: ProductImageDto[]
  variants: ProductVariantDto[]
  /** Present on admin catalogue responses. */
  isActive?: boolean
}
