/**
 * Checkout “Demo addresses” — derived from `YANGO_DEMO_ZONES` so each `home_delivery_areas.code`
 * stays aligned with map bounds, courier demo cents, and the preset form fields.
 */

import { YANGO_DEMO_ZONES } from './yangoDeliveryDemo'

export type CheckoutDemoAddressPreset = {
  /** Same as `home_delivery_areas.code` / zone id (`whk_south_central`, …). */
  id: string
  areaCode: string
  title: string
  line1: string
  line2: string
  suburb: string
  city: string
  region: string
  postalCode: string
  country: string
  blurb: string
}

export const CHECKOUT_DEMO_ADDRESS_PRESETS: readonly CheckoutDemoAddressPreset[] = YANGO_DEMO_ZONES.filter(
  (z): z is typeof z & { demoAddress: NonNullable<(typeof z)['demoAddress']> } => Boolean(z.demoAddress),
).map((z) => {
  const d = z.demoAddress
  return {
    id: z.id,
    areaCode: z.id,
    title: d.presetTitle,
    line1: d.line1,
    line2: d.line2 ?? '',
    suburb: d.suburb,
    city: d.city,
    region: d.region ?? '',
    postalCode: d.postalCode ?? '',
    country: d.country ?? 'NA',
    blurb: d.blurb,
  }
})
