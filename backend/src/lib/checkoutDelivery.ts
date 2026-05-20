/** Values persisted on `orders.delivery_method` (NVARCHAR). */

export type CheckoutDeliveryMethod = 'home' | 'yango_delivery' | 'store_pickup' | 'deposit_box'

const PICKUP: ReadonlySet<string> = new Set(['deposit_box', 'store_pickup'])
const HOME: ReadonlySet<string> = new Set(['home', 'yango_delivery'])

export function isPickupDeliveryMethod(m: string): boolean {
  return PICKUP.has(String(m ?? '').trim().toLowerCase())
}

export function isStorePickupDeliveryMethod(m: string): boolean {
  return String(m ?? '').trim().toLowerCase() === 'store_pickup'
}

export function isDepositBoxDeliveryMethod(m: string): boolean {
  return String(m ?? '').trim().toLowerCase() === 'deposit_box'
}

export function isHomeDeliveryMethod(m: string): boolean {
  return HOME.has(String(m ?? '').trim().toLowerCase())
}

export function shippingUsesHomeRates(m: string): boolean {
  return isHomeDeliveryMethod(m)
}

/** Only explicit Yango checkout rows trigger Yango courier API after payment (not generic `home`). */
export function isYangoCourierDeliveryMethod(m: string): boolean {
  return String(m ?? '').trim().toLowerCase() === 'yango_delivery'
}

export function parseCheckoutDeliveryMethod(raw: unknown, yangoEnabled: boolean): CheckoutDeliveryMethod {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (s === 'deposit_box') return 'deposit_box'
  if (s === 'store_pickup') return 'store_pickup'
  if (s === 'yango_delivery') {
    if (yangoEnabled) return 'yango_delivery'
    return 'home'
  }
  return 'home'
}
