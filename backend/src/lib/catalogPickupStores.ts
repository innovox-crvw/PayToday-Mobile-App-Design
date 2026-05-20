/**
 * Pickup store labels when resolving merchant from category (catalog-100 demo).
 * Merchant ids match nictus-three-merchants-seed.sql + liquor demo 991001 when present.
 */

export type PickupStoreFallback = {
  merchantId: number
  storeName: string
  addressLine: string
  town: string
}

/** Category slug → merchant for products without pay_today_merchant_id. */
export const CATEGORY_PICKUP_STORE: Record<string, PickupStoreFallback> = {
  groceries: {
    merchantId: 931001,
    storeName: 'Nictus Namibia — Grove Mall',
    addressLine: 'Grove Mall, Independence Ave',
    town: 'Windhoek',
  },
  'fresh-produce': {
    merchantId: 931001,
    storeName: 'Nictus Namibia — Grove Mall',
    addressLine: 'Grove Mall, Independence Ave',
    town: 'Windhoek',
  },
  'soft-drinks': {
    merchantId: 931001,
    storeName: 'Nictus Namibia — Grove Mall',
    addressLine: 'Grove Mall, Independence Ave',
    town: 'Windhoek',
  },
  'snacks-pantry': {
    merchantId: 931001,
    storeName: 'Nictus Namibia — Grove Mall',
    addressLine: 'Grove Mall, Independence Ave',
    town: 'Windhoek',
  },
  electronics: {
    merchantId: 931002,
    storeName: 'Outdoor Center — Maerua',
    addressLine: 'Maerua Mall, Centaurus Rd',
    town: 'Windhoek',
  },
  audio: {
    merchantId: 931002,
    storeName: 'Outdoor Center — Maerua',
    addressLine: 'Maerua Mall, Centaurus Rd',
    town: 'Windhoek',
  },
  accessories: {
    merchantId: 931002,
    storeName: 'Outdoor Center — Maerua',
    addressLine: 'Maerua Mall, Centaurus Rd',
    town: 'Windhoek',
  },
  home: {
    merchantId: 931003,
    storeName: 'MTC Retail — CBD',
    addressLine: '154 Independence Ave',
    town: 'Windhoek',
  },
  cleaning: {
    merchantId: 931003,
    storeName: 'MTC Retail — CBD',
    addressLine: '154 Independence Ave',
    town: 'Windhoek',
  },
  liquor: {
    merchantId: 991001,
    storeName: 'Liquor collection — Windhoek CBD',
    addressLine: '123 Independence Ave',
    town: 'Windhoek',
  },
  wine: {
    merchantId: 991001,
    storeName: 'Liquor collection — Windhoek CBD',
    addressLine: '123 Independence Ave',
    town: 'Windhoek',
  },
  beer: {
    merchantId: 991001,
    storeName: 'Liquor collection — Windhoek CBD',
    addressLine: '123 Independence Ave',
    town: 'Windhoek',
  },
  spirits: {
    merchantId: 991001,
    storeName: 'Liquor collection — Windhoek CBD',
    addressLine: '123 Independence Ave',
    town: 'Windhoek',
  },
}

export function pickupStoreForCategory(categorySlug: string | null | undefined): PickupStoreFallback | null {
  const s = (categorySlug ?? '').trim().toLowerCase()
  if (!s) return null
  return CATEGORY_PICKUP_STORE[s] ?? null
}

/** PayToday merchant ids for the four demo pickup stores (see CATEGORY_PICKUP_STORE). */
export const PICKUP_MERCHANT_NICTUS = 931001
export const PICKUP_MERCHANT_OUTDOOR = 931002
export const PICKUP_MERCHANT_MTC = 931003
export const PICKUP_MERCHANT_LIQUOR = 991001

/** Merchant whose store/liquor hours should drive checkout time-window UI. */
export function resolveCheckoutSellingHoursMerchantId(
  pickupStores: { merchantId: number }[],
  cartContainsAlcohol: boolean,
): number | null {
  const ids = [...new Set(pickupStores.map((s) => s.merchantId).filter((id) => Number.isFinite(id) && id > 0))]
  if (!ids.length) return null
  if (cartContainsAlcohol && ids.includes(PICKUP_MERCHANT_LIQUOR)) return PICKUP_MERCHANT_LIQUOR
  return ids.sort((a, b) => a - b)[0]!
}

export function formatBusinessAddress(parts: {
  name: string
  addressLine1?: string | null
  addressLine2?: string | null
  town?: string | null
  postal?: string | null
}): string {
  const lines: string[] = []
  const a1 = parts.addressLine1?.trim()
  const a2 = parts.addressLine2?.trim()
  const town = parts.town?.trim()
  const postal = parts.postal?.trim()
  if (a1) lines.push(a1)
  if (a2) lines.push(a2)
  const city = [town, postal].filter(Boolean).join(' ')
  if (city) lines.push(city)
  if (lines.length) return lines.join(', ')
  return parts.name.trim() || 'See store details in your order confirmation.'
}
