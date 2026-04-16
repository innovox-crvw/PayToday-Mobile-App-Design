export interface StoreCategoryDto {
  id: string
  slug: string
  name: string
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
  totalHomeCents: number
  totalPickupCents: number
  freeShippingThresholdCents: number
  qualifiesFreeShippingHome: boolean
  flatShippingCents: number
}
