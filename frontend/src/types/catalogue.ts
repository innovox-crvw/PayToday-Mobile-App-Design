export type InventoryPolicy = 'track' | 'continue' | 'not_tracked'

export interface VariantOptionDto {
  name: string
  value: string
}

export interface ProductImageDto {
  url: string
  sortOrder: number
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
  categorySlug: string
  categoryName: string
  brandSlug: string | null
  brandName: string | null
  imageUrl: string | null
  images?: ProductImageDto[]
  variants: ProductVariantDto[]
  isActive?: boolean
}

export interface ProductListResponse {
  source: string
  items: ProductDto[]
  catalogFallbackReason?: 'sql_unreachable'
  sqlConnectHint?: string
}
