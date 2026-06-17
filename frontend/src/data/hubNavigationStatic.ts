import type { HubNavigationTileDto } from '../types/hubNavigation'

/** Payments hub category grid — drill-down rows load from SQL (`hub_payment_category_items`) or static API fallback. */
export const PAYMENTS_HUB_TILES: readonly HubNavigationTileDto[] = [
  {
    slug: 'businesses',
    label: 'Businesses',
    iconKey: 'business',
    listStyle: 'business',
    linkPath: 'payments/businesses',
    paymentMethodsCaption: 'Wallet · Card · QR',
  },
  {
    slug: 'contacts',
    label: 'Contacts',
    iconKey: 'contacts',
    listStyle: 'contacts',
    linkPath: 'payments/contacts',
    paymentMethodsCaption: 'Wallet · Instant pay',
  },
  {
    slug: 'airtime',
    label: 'Airtime',
    iconKey: 'airtime',
    listStyle: 'business',
    linkPath: 'payments/airtime',
    paymentMethodsCaption: 'Wallet · Card · PIN',
  },
  {
    slug: 'electricity',
    label: 'Electricity',
    iconKey: 'electricity',
    listStyle: 'business',
    linkPath: 'payments/electricity',
    paymentMethodsCaption: 'Prepaid token · Card · Wallet',
  },
  {
    slug: 'bills',
    label: 'Bills',
    iconKey: 'bills',
    listStyle: 'business',
    linkPath: 'payments/bills',
    paymentMethodsCaption: 'Wallet · Card · Reference',
  },
  {
    slug: 'food',
    label: 'Food',
    iconKey: 'food',
    listStyle: 'business',
    linkPath: 'payments/food',
    paymentMethodsCaption: 'Card · Wallet · Order ahead',
  },
  {
    slug: 'fuel',
    label: 'Fuel',
    iconKey: 'fuel',
    listStyle: 'business',
    linkPath: 'payments/fuel',
    paymentMethodsCaption: 'Fleet card · Wallet',
  },
  {
    slug: 'parking',
    label: 'Parking',
    iconKey: 'parking',
    listStyle: 'business',
    linkPath: 'payments/parking',
    paymentMethodsCaption: 'Wallet · Plate / bay ref',
  },
  {
    slug: 'stay',
    label: 'Stay',
    iconKey: 'stay',
    listStyle: 'business',
    linkPath: 'payments/stay',
    paymentMethodsCaption: 'Card · Wallet · Deposit',
  },
  {
    slug: 'services',
    label: 'Services',
    iconKey: 'services',
    listStyle: 'business',
    linkPath: 'payments/services',
    paymentMethodsCaption: 'Wallet · Card · Invoice ref',
  },
]

/** Services hub quick links — same captions as DB seed after migration 003. */
export const SERVICES_HUB_TILES: readonly HubNavigationTileDto[] = [
  {
    slug: 'airtime',
    label: 'Airtime',
    iconKey: 'airtime',
    listStyle: null,
    linkPath: 'services/airtime',
    paymentMethodsCaption: 'Wallet · Card · USSD',
  },
  {
    slug: 'water',
    label: 'Water',
    iconKey: 'water',
    listStyle: null,
    linkPath: 'services/water',
    paymentMethodsCaption: 'Wallet · EFT · Municipality ref',
  },
  {
    slug: 'electricity',
    label: 'Electricity',
    iconKey: 'electricity',
    listStyle: null,
    linkPath: 'services/electricity',
    paymentMethodsCaption: 'Prepaid meter · Card · Wallet',
  },
  {
    slug: 'parking',
    label: 'Parking',
    iconKey: 'parking',
    listStyle: null,
    linkPath: 'services/parking',
    paymentMethodsCaption: 'Wallet · Tap to pay',
  },
  {
    slug: 'insurance',
    label: 'Insurance',
    iconKey: 'insurance',
    listStyle: null,
    linkPath: 'services/insurance/nedlife',
    paymentMethodsCaption: 'Card · Debit order',
  },
  {
    slug: 'ussd',
    label: 'USSD',
    iconKey: 'ussd',
    listStyle: null,
    linkPath: 'services/ussd',
    paymentMethodsCaption: 'USSD · *120#',
  },
  {
    slug: 'store',
    label: 'Store',
    iconKey: 'storefront',
    listStyle: null,
    linkPath: 'shop',
    paymentMethodsCaption: 'Card · Wallet · Pickup',
  },
]

export function getPaymentHubTileBySlug(slug: string): HubNavigationTileDto | undefined {
  return PAYMENTS_HUB_TILES.find((t) => t.slug === slug)
}
