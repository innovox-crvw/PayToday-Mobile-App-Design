import type { SvgIconComponent } from '@mui/icons-material'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined'
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined'
import ChairOutlinedIcon from '@mui/icons-material/ChairOutlined'
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined'
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined'
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined'
import MoreHorizOutlinedIcon from '@mui/icons-material/MoreHorizOutlined'

export type ListingType = 'sale' | 'rent'

export type ClassifiedListing = {
  id: string
  title: string
  priceCents: number
  location: string
  category: string
  categorySlug: string
  listingType: ListingType
  description: string
  sellerName: string
  contactPhone: string
  /** Data URL or https URL */
  imageUrl: string | null
  /** CSS gradient when no image */
  imageGradient: string
  isUserPosted?: boolean
}

export type PostAdDraft = {
  listingType: ListingType
  categorySlug: string
  title: string
  priceCents: number
  description: string
  location: string
  contactPhone: string
  sellerName: string
  imageDataUrl: string | null
}

const TERMS_KEY = 'classifieds_terms_accepted_v1'
const MY_ADS_KEY = 'classifieds_my_listings_v1'

export function hasAcceptedClassifiedsTerms(): boolean {
  try {
    return localStorage.getItem(TERMS_KEY) === '1'
  } catch {
    return false
  }
}

export function acceptClassifiedsTerms(): void {
  try {
    localStorage.setItem(TERMS_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function loadMyListings(): ClassifiedListing[] {
  try {
    const raw = localStorage.getItem(MY_ADS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ClassifiedListing[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMyListings(listings: ClassifiedListing[]): void {
  try {
    localStorage.setItem(MY_ADS_KEY, JSON.stringify(listings))
    window.dispatchEvent(new Event('classifieds-my-ads-updated'))
  } catch {
    /* quota */
  }
}

export function addMyListing(listing: ClassifiedListing): void {
  const cur = loadMyListings()
  saveMyListings([listing, ...cur])
}

export function deleteMyListing(id: string): void {
  const cur = loadMyListings()
  saveMyListings(cur.filter((x) => x.id !== id))
}

export type CategoryDef = { slug: string; label: string; icon: SvgIconComponent }

export const POST_CATEGORIES: CategoryDef[] = [
  { slug: 'vehicles', label: 'Vehicles', icon: DirectionsCarOutlinedIcon },
  { slug: 'real-estate', label: 'Real Estate', icon: HomeWorkOutlinedIcon },
  { slug: 'electronics', label: 'Electronics', icon: PhoneIphoneOutlinedIcon },
  { slug: 'furniture', label: 'Furniture', icon: ChairOutlinedIcon },
  { slug: 'fashion', label: 'Fashion', icon: CheckroomOutlinedIcon },
  { slug: 'gaming', label: 'Gaming', icon: SportsEsportsOutlinedIcon },
  { slug: 'pets', label: 'Pets', icon: PetsOutlinedIcon },
  { slug: 'other', label: 'Other', icon: MoreHorizOutlinedIcon },
]

export const LOCATIONS = [
  'Windhoek',
  'Swakopmund',
  'Walvis Bay',
  'Oshakati',
  'Rundu',
  'Katima Mulilo',
  'Otjiwarongo',
  'Other',
] as const

export const CLASSIFIEDS_MOCK: ClassifiedListing[] = [
  {
    id: 'ad1',
    title: 'Giant Mountain Bike',
    priceCents: 390_000,
    location: 'Windhoek',
    category: 'Vehicles',
    categorySlug: 'vehicles',
    listingType: 'sale',
    description:
      'Giant mountain bike in excellent condition. Recently serviced, new tyres. Ideal for trails and commuting. Serious buyers only.',
    sellerName: 'Jan D.',
    contactPhone: '+264811234567',
    imageUrl: null,
    imageGradient: 'linear-gradient(135deg,#1e3a5f,#3d6b8c)',
  },
  {
    id: 'ad2',
    title: 'Toyota sedan — low mileage',
    priceCents: 18_500_000,
    location: 'Swakopmund',
    category: 'Vehicles',
    categorySlug: 'vehicles',
    listingType: 'sale',
    description: 'One owner, full service history. Aircon, central locking. Viewing by appointment.',
    sellerName: 'Maria K.',
    contactPhone: '+264811000222',
    imageUrl: null,
    imageGradient: 'linear-gradient(135deg,#7f1d1d,#b91c1c)',
  },
  {
    id: 'ad3',
    title: 'iPhone — sample listing',
    priceCents: 120_000,
    location: 'Walvis Bay',
    category: 'Electronics',
    categorySlug: 'electronics',
    listingType: 'sale',
    description: 'Latest generation, box and charger included. No scratches on screen.',
    sellerName: 'Tech Hub',
    contactPhone: '+264811333444',
    imageUrl: null,
    imageGradient: 'linear-gradient(135deg,#312e81,#6366f1)',
  },
  {
    id: 'ad4',
    title: 'Office desk and ergonomic chair',
    priceCents: 45_000,
    location: 'Windhoek',
    category: 'Furniture',
    categorySlug: 'furniture',
    listingType: 'sale',
    description: 'Solid wood desk and adjustable office chair. Collection from Klein Windhoek.',
    sellerName: 'Pierre L.',
    contactPhone: '+264811555666',
    imageUrl: null,
    imageGradient: 'linear-gradient(135deg,#422006,#a16207)',
  },
  {
    id: 'ad5',
    title: '2-bed flat to rent',
    priceCents: 8_500_000,
    location: 'Windhoek',
    category: 'Real Estate',
    categorySlug: 'real-estate',
    listingType: 'rent',
    description: 'Secure complex, parking, prepaid utilities. Available from next month.',
    sellerName: 'Property Co.',
    contactPhone: '+264811777888',
    imageUrl: null,
    imageGradient: 'linear-gradient(135deg,#134e4a,#0d9488)',
  },
] as ClassifiedListing[]
