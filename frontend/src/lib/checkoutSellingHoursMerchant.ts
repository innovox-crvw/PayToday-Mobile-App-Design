/** Demo pickup merchant ids (match backend catalogPickupStores + nictus-three-merchants-seed). */
export const PICKUP_MERCHANT_NICTUS = 931001
export const PICKUP_MERCHANT_OUTDOOR = 931002
export const PICKUP_MERCHANT_MTC = 931003
export const PICKUP_MERCHANT_LIQUOR = 991001

/** Merchant whose store/liquor hours drive checkout selling-times UI. */
export function resolveCheckoutSellingHoursMerchantId(
  pickupStores: { merchantId: number }[],
  cartContainsAlcohol: boolean,
): number | null {
  const ids = [...new Set(pickupStores.map((s) => s.merchantId).filter((id) => Number.isFinite(id) && id > 0))]
  if (!ids.length) return null
  if (cartContainsAlcohol && ids.includes(PICKUP_MERCHANT_LIQUOR)) return PICKUP_MERCHANT_LIQUOR
  return ids.sort((a, b) => a - b)[0]!
}
