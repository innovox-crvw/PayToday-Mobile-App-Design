import type { HubPaymentCategoryItemDto } from '../repos/hubPaymentCategoryItemsRepo.js'



/** Demo drill-down rows when SQL is off (same shape as DB API; keep in sync with paytoday-full-setup seed). */

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

        paymentMethod: 'Wallet · Card · EFT ref',

      },

      {

        id: 'static-b2',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Windhoek Fresh Market',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Wallet · Tap to pay · QR',

      },

      {

        id: 'static-b3',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Namibia Auto Parts',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Wallet · Card · invoice ref',

      },

      {

        id: 'static-b4',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Coastal Coffee Co.',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Wallet · loyalty stamps',

      },

      {

        id: 'static-b5',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Desert Bloom Pharmacy',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Wallet · medical aid · card',

      },

      {

        id: 'static-b6',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Katutura Hardware & Paint',

        initials: null,

        sortOrder: 60,

        paymentMethod: 'Wallet · bulk quote ref',

      },

      {

        id: 'static-b7',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Walvis Bay Marine Supplies',

        initials: null,

        sortOrder: 70,

        paymentMethod: 'Wallet · PO number',

      },

      {

        id: 'static-b8',

        categorySlug: 'businesses',

        itemKind: 'business',

        displayName: 'Oshakati Electronics Hub',

        initials: null,

        sortOrder: 80,

        paymentMethod: 'Wallet · lay-by ref',

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

      {

        id: 'static-c2',

        categorySlug: 'contacts',

        itemKind: 'contact',

        displayName: 'Johan van Wyk',

        initials: 'JW',

        sortOrder: 20,

        paymentMethod: 'Wallet · request money',

      },

      {

        id: 'static-c3',

        categorySlug: 'contacts',

        itemKind: 'contact',

        displayName: 'Lisa #Shapumba',

        initials: 'LS',

        sortOrder: 30,

        paymentMethod: 'Wallet only · P2P',

      },

      {

        id: 'static-c4',

        categorySlug: 'contacts',

        itemKind: 'contact',

        displayName: 'Tomas Hamutenya',

        initials: 'TH',

        sortOrder: 40,

        paymentMethod: 'Wallet · split bill',

      },

      {

        id: 'static-c5',

        categorySlug: 'contacts',

        itemKind: 'contact',

        displayName: 'Helvi Ndapandula',

        initials: 'HN',

        sortOrder: 50,

        paymentMethod: 'Wallet only',

      },

      {

        id: 'static-c6',

        categorySlug: 'contacts',

        itemKind: 'contact',

        displayName: 'Petro #Kahimise',

        initials: 'PK',

        sortOrder: 60,

        paymentMethod: 'Wallet · request link',

      },

      {

        id: 'static-c7',

        categorySlug: 'contacts',

        itemKind: 'contact',

        displayName: 'Chrizelle du Preez',

        initials: 'CD',

        sortOrder: 70,

        paymentMethod: 'Wallet · P2P',

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

        paymentMethod: 'Wallet · MTC app · *682#',

      },

      {

        id: 'static-a2',

        categorySlug: 'airtime',

        itemKind: 'business',

        displayName: 'TN Mobile',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Wallet · TN voucher · USSD',

      },

      {

        id: 'static-a3',

        categorySlug: 'airtime',

        itemKind: 'business',

        displayName: 'RechargeNow Namibia',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Wallet · MSISDN lookup',

      },

      {

        id: 'static-a4',

        categorySlug: 'airtime',

        itemKind: 'business',

        displayName: 'Corporate airtime pool',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Wallet · company account ref',

      },

      {

        id: 'static-a5',

        categorySlug: 'airtime',

        itemKind: 'business',

        displayName: 'Tourist SIM top-up',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Card · passport ref on file',

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

        paymentMethod: 'Meter · wallet · card',

      },

      {

        id: 'static-e2',

        categorySlug: 'electricity',

        itemKind: 'business',

        displayName: 'City of Windhoek prepaid',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Meter · wallet · USSD',

      },

      {

        id: 'static-e3',

        categorySlug: 'electricity',

        itemKind: 'business',

        displayName: 'Erongo RED prepaid',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Meter · wallet',

      },

      {

        id: 'static-e4',

        categorySlug: 'electricity',

        itemKind: 'business',

        displayName: 'Omaheke municipal prepaid',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Meter · wallet · branch code',

      },

    ],

    bills: [

      {

        id: 'static-bl1',

        categorySlug: 'bills',

        itemKind: 'business',

        displayName: 'City of Windhoek — rates & refuse',

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Account · wallet · ref',

      },

      {

        id: 'static-bl2',

        categorySlug: 'bills',

        itemKind: 'business',

        displayName: 'MultiChoice Namibia (DStv)',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Smartcard · wallet · card',

      },

      {

        id: 'static-bl3',

        categorySlug: 'bills',

        itemKind: 'business',

        displayName: 'NamWater — municipal bulk',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Account · wallet',

      },

      {

        id: 'static-bl4',

        categorySlug: 'bills',

        itemKind: 'business',

        displayName: 'School fees — Khomas cluster',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Learner ID · wallet',

      },

      {

        id: 'static-bl5',

        categorySlug: 'bills',

        itemKind: 'business',

        displayName: 'Namibia Medical Aid (demo)',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Member no. · wallet · card',

      },

    ],

    food: [

      {

        id: 'static-f1',

        categorySlug: 'food',

        itemKind: 'business',

        displayName: "Joe's Beerhouse — Windhoek",

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Wallet · table QR',

      },

      {

        id: 'static-f2',

        categorySlug: 'food',

        itemKind: 'business',

        displayName: 'The Stellenbosch — Klein Windhoek',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Wallet · booking ref',

      },

      {

        id: 'static-f3',

        categorySlug: 'food',

        itemKind: 'business',

        displayName: 'Local Eats Collective',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Wallet · rider tip',

      },

      {

        id: 'static-f4',

        categorySlug: 'food',

        itemKind: 'business',

        displayName: 'Swakopmund Jetty Restaurant',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Wallet · split bill',

      },

      {

        id: 'static-f5',

        categorySlug: 'food',

        itemKind: 'business',

        displayName: 'Oshakati open-market vendors',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Wallet · stall code',

      },

    ],

    fuel: [

      {

        id: 'static-fu1',

        categorySlug: 'fuel',

        itemKind: 'business',

        displayName: 'Engen — Independence Ave',

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Rewards · wallet · card',

      },

      {

        id: 'static-fu2',

        categorySlug: 'fuel',

        itemKind: 'business',

        displayName: 'Puma Energy — B1 stop',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Fleet card · wallet',

      },

      {

        id: 'static-fu3',

        categorySlug: 'fuel',

        itemKind: 'business',

        displayName: 'Shell V-Power — Hosea Kutako',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Card · wallet',

      },

      {

        id: 'static-fu4',

        categorySlug: 'fuel',

        itemKind: 'business',

        displayName: 'TotalEnergies — coastal route',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Loyalty · wallet',

      },

      {

        id: 'static-fu5',

        categorySlug: 'fuel',

        itemKind: 'business',

        displayName: 'Truck diesel — Walvis corridor',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Fleet ref · wallet',

      },

    ],

    parking: [

      {

        id: 'static-p1',

        categorySlug: 'parking',

        itemKind: 'business',

        displayName: 'Grove Mall — underground P1',

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Plate · wallet · QR',

      },

      {

        id: 'static-p2',

        categorySlug: 'parking',

        itemKind: 'business',

        displayName: 'Hosea Kutako short stay',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Ticket · wallet',

      },

      {

        id: 'static-p3',

        categorySlug: 'parking',

        itemKind: 'business',

        displayName: 'CBD Zone A — street meters',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Bay code · wallet',

      },

      {

        id: 'static-p4',

        categorySlug: 'parking',

        itemKind: 'business',

        displayName: 'Swakopmund plaza parking',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'SMS code · wallet',

      },

    ],

    vouchers: [

      {

        id: 'static-v1',

        categorySlug: 'vouchers',

        itemKind: 'business',

        displayName: 'National Bookstore',

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Voucher SKU · wallet · card',

      },

      {

        id: 'static-v2',

        categorySlug: 'vouchers',

        itemKind: 'business',

        displayName: 'Pick n Pay gift cards',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Barcode · wallet',

      },

      {

        id: 'static-v3',

        categorySlug: 'vouchers',

        itemKind: 'business',

        displayName: 'Woermann Brock — grocery voucher',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Store ref · wallet',

      },

      {

        id: 'static-v4',

        categorySlug: 'vouchers',

        itemKind: 'business',

        displayName: 'Cinema combo — Grove',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Showtime · wallet',

      },

    ],

    stay: [

      {

        id: 'static-s1',

        categorySlug: 'stay',

        itemKind: 'business',

        displayName: 'Coastal Guesthouse — Swakop',

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Booking ref · wallet · card',

      },

      {

        id: 'static-s2',

        categorySlug: 'stay',

        itemKind: 'business',

        displayName: 'Hilton Windhoek (demo)',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Confirmation no. · wallet',

      },

      {

        id: 'static-s3',

        categorySlug: 'stay',

        itemKind: 'business',

        displayName: 'Etosha lodge partners',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Park permit ref · wallet',

      },

      {

        id: 'static-s4',

        categorySlug: 'stay',

        itemKind: 'business',

        displayName: 'Farm stay — Khomas Hochland',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Host code · wallet',

      },

      {

        id: 'static-s5',

        categorySlug: 'stay',

        itemKind: 'business',

        displayName: 'Airbnb-style host payout',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Listing ID · wallet',

      },

    ],

    services: [

      {

        id: 'static-sv1',

        categorySlug: 'services',

        itemKind: 'business',

        displayName: 'PayToday Service Desk',

        initials: null,

        sortOrder: 10,

        paymentMethod: 'Wallet · case ref',

      },

      {

        id: 'static-sv2',

        categorySlug: 'services',

        itemKind: 'business',

        displayName: 'NamPost parcel COD',

        initials: null,

        sortOrder: 20,

        paymentMethod: 'Waybill · wallet',

      },

      {

        id: 'static-sv3',

        categorySlug: 'services',

        itemKind: 'business',

        displayName: 'Courier Namibia — same day',

        initials: null,

        sortOrder: 30,

        paymentMethod: 'Pickup code · wallet',

      },

      {

        id: 'static-sv4',

        categorySlug: 'services',

        itemKind: 'business',

        displayName: 'IT support — Windhoek SME',

        initials: null,

        sortOrder: 40,

        paymentMethod: 'Ticket no. · wallet',

      },

      {

        id: 'static-sv5',

        categorySlug: 'services',

        itemKind: 'business',

        displayName: 'Plumbing 24 — emergency',

        initials: null,

        sortOrder: 50,

        paymentMethod: 'Call-out ref · wallet',

      },

      {

        id: 'static-sv6',

        categorySlug: 'services',

        itemKind: 'business',

        displayName: 'Laundry & dry-clean — CBD',

        initials: null,

        sortOrder: 60,

        paymentMethod: 'Bag tag · wallet',

      },

    ],

  }

  return demo[slug] ?? []

}

