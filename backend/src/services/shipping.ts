import { env } from '../config/env.js'
import { shippingUsesHomeRates } from '../lib/checkoutDelivery.js'

/** Home / Yango home shipping: free at or above threshold when `shippingFreeSubtotalCents` > 0; else flat rate. Pickup methods are free. */
export function shippingCentsForDelivery(subtotalCents: number, deliveryMethod: string): number {
  if (!shippingUsesHomeRates(deliveryMethod)) return 0
  if (env.shippingFreeSubtotalCents > 0 && subtotalCents >= env.shippingFreeSubtotalCents) return 0
  return env.shippingFlatCents
}

export function taxCentsForSubtotal(subtotalCents: number): number {
  if (env.vatRateBps <= 0) return 0
  return Math.floor((subtotalCents * env.vatRateBps) / 10_000)
}
