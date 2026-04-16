import type { HubPaymentCategoryItemDto } from '../repos/hubPaymentCategoryItemsRepo.js'

/** Demo drill-down rows when SQL is off (same shape as DB API). */
export function staticHubPaymentCategoryItems(categorySlug: string): HubPaymentCategoryItemDto[] {
  const slug = categorySlug.trim().toLowerCase()
  const demo: Record<string, HubPaymentCategoryItemDto[]> = {
    businesses: [
      {
        id: 'static-b1',
        categorySlug: 'businesses',
        itemKind: 'business',
        displayName: 'Okahandja Traders',
        initials: null,
        sortOrder: 10,
        paymentMethod: 'PayToday Wallet · Visa / Mastercard',
      },
      {
        id: 'static-b2',
        categorySlug: 'businesses',
        itemKind: 'business',
        displayName: 'Windhoek Fresh Market',
        initials: null,
        sortOrder: 20,
        paymentMethod: 'Wallet · Card · QR (demo)',
      },
    ],
    contacts: [
      {
        id: 'static-c1',
        categorySlug: 'contacts',
        itemKind: 'contact',
        displayName: 'Anna Nghipondoka',
        initials: 'AN',
        sortOrder: 10,
        paymentMethod: 'Wallet only · P2P',
      },
    ],
    airtime: [
      {
        id: 'static-a1',
        categorySlug: 'airtime',
        itemKind: 'business',
        displayName: 'MTC Prepaid',
        initials: null,
        sortOrder: 10,
        paymentMethod: 'Wallet · MTC app · USSD',
      },
      {
        id: 'static-a2',
        categorySlug: 'airtime',
        itemKind: 'business',
        displayName: 'TN Mobile',
        initials: null,
        sortOrder: 20,
        paymentMethod: 'Card · TN voucher',
      },
    ],
    electricity: [
      {
        id: 'static-e1',
        categorySlug: 'electricity',
        itemKind: 'business',
        displayName: 'Nampower Prepaid',
        initials: null,
        sortOrder: 10,
        paymentMethod: 'Meter number · Card · Wallet',
      },
    ],
  }
  return demo[slug] ?? []
}
