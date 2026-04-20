export interface StoreCategoryDto {
  id: string
  slug: string
  name: string
  parentId?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface StorePromotionDto {
  id: string
  slug: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkPath: string | null
  sortOrder: number
}

/** `GET /api/storefront/popular-stores` — store brand ranked by order line quantity in a date window. */
export interface PopularStoreDto {
  brandSlug: string
  brandName: string | null
  unitsSold: number
  orderCount: number
}

export interface StorefrontConfig {
  shippingFlatCents: number
  shippingFreeSubtotalCents: number
  vatRateBps: number
  scanApiConfigured: boolean
  /** When true, the API rejects guest checkout (`CHECKOUT_REQUIRE_SIGN_IN`). */
  checkoutRequireSignIn?: boolean
}

export interface CartTotalsPreview {
  subtotalCents: number
  currency: string
  shippingCentsHome: number
  shippingCentsPickup: number
  taxCents: number
  /** Promotional / voucher discounts (cents); 0 when none applied. */
  discountCents?: number
  totalHomeCents: number
  totalPickupCents: number
  freeShippingThresholdCents: number
  qualifiesFreeShippingHome: boolean
  flatShippingCents: number
}
