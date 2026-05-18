export interface StoreCategoryDto {
  id: string
  slug: string
  name: string
  parentId?: string | null
  sortOrder?: number
  isActive?: boolean
  /** Allowlisted key from API; UI maps via `categoryIcons`. */
  iconKey?: string | null
  /** When true (or an ancestor is true), product pages may show financing for variants at or above the store minimum (N$5,000). */
  financeEligible?: boolean
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
  liquorGatingEnabled?: boolean
  /** Category root slugs (e.g. liquor, wine) used for minor UX + gating; from `AGE_RESTRICTED_CATEGORY_SLUGS`. */
  minorRestrictedCategorySlugs?: string[]
  /** URL opened by “Apply for finance” (default NedAccess); override with `NEDBANK_FINANCE_URL`. */
  nedbankFinanceUrl?: string
  defaultStoreMerchantId?: number
  yangoEnabled?: boolean
}

export interface StoreCheckoutPreview {
  outsideStoreHours: boolean
  requiresScheduledTime: boolean
}

/** Populated on `GET /api/cart?preview=1` when the database cart is used. */
export interface LiquorCheckoutPreview {
  hasAlcohol: boolean
  outsideLiquorSellingWindow: boolean
  /** When true, checkout must include a scheduled window (home or pickup) until liquor hours allow immediate fulfilment. */
  requiresDeliveryTime: boolean
}

export interface CartTotalsPreview {
  subtotalCents: number
  currency: string
  shippingCentsHome: number
  shippingCentsPickup: number
  /** Optional express home-delivery estimate when API is configured with `SHIPPING_EXPRESS_CENTS`. */
  shippingCentsExpress?: number | null
  taxCents: number
  /** Promotional / voucher discounts (cents); 0 when none applied. */
  discountCents?: number
  totalHomeCents: number
  totalPickupCents: number
  freeShippingThresholdCents: number
  qualifiesFreeShippingHome: boolean
  flatShippingCents: number
}
