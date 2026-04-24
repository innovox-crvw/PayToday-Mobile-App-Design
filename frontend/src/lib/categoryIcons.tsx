/**
 * Storefront category icons — keys must stay in sync with `backend/src/lib/categoryIconKeys.ts`.
 * Only these keys may be stored in `dbo.categories.icon_key` (API validates).
 */
import type { ReactNode } from 'react'
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined'
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import LocalGroceryStoreOutlinedIcon from '@mui/icons-material/LocalGroceryStoreOutlined'
import ShoppingBasketOutlinedIcon from '@mui/icons-material/ShoppingBasketOutlined'
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined'
import SportsBasketballOutlinedIcon from '@mui/icons-material/SportsBasketballOutlined'
import FaceRetouchingNaturalOutlinedIcon from '@mui/icons-material/FaceRetouchingNaturalOutlined'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined'
import CleaningServicesOutlinedIcon from '@mui/icons-material/CleaningServicesOutlined'
import LocalCafeOutlinedIcon from '@mui/icons-material/LocalCafeOutlined'
import CookieOutlinedIcon from '@mui/icons-material/CookieOutlined'
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined'
import HeadsetOutlinedIcon from '@mui/icons-material/HeadsetOutlined'
import GraphicEqOutlinedIcon from '@mui/icons-material/GraphicEqOutlined'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'

export type CategoryIconRegistryKey =
  | 'electronics'
  | 'fashion'
  | 'home'
  | 'groceries'
  | 'basket'
  | 'pets'
  | 'sports'
  | 'beauty'
  | 'toys'
  | 'automotive'
  | 'books'
  | 'garden'
  | 'cleaning'
  | 'beverages'
  | 'snacks'
  | 'produce'
  | 'accessories'
  | 'audio'

const iconSx = { fontSize: 36, color: 'primary.main' } as const

const REGISTRY: Record<CategoryIconRegistryKey, ReactNode> = {
  electronics: <PhoneIphoneOutlinedIcon sx={iconSx} />,
  fashion: <CheckroomOutlinedIcon sx={iconSx} />,
  home: <HomeOutlinedIcon sx={iconSx} />,
  groceries: <LocalGroceryStoreOutlinedIcon sx={iconSx} />,
  basket: <ShoppingBasketOutlinedIcon sx={iconSx} />,
  pets: <PetsOutlinedIcon sx={iconSx} />,
  sports: <SportsBasketballOutlinedIcon sx={iconSx} />,
  beauty: <FaceRetouchingNaturalOutlinedIcon sx={iconSx} />,
  toys: <SmartToyOutlinedIcon sx={iconSx} />,
  automotive: <DirectionsCarOutlinedIcon sx={iconSx} />,
  books: <MenuBookOutlinedIcon sx={iconSx} />,
  garden: <GrassOutlinedIcon sx={iconSx} />,
  cleaning: <CleaningServicesOutlinedIcon sx={iconSx} />,
  beverages: <LocalCafeOutlinedIcon sx={iconSx} />,
  snacks: <CookieOutlinedIcon sx={iconSx} />,
  produce: <LocalFloristOutlinedIcon sx={iconSx} />,
  accessories: <HeadsetOutlinedIcon sx={iconSx} />,
  audio: <GraphicEqOutlinedIcon sx={iconSx} />,
}

const LABELS: Record<CategoryIconRegistryKey, string> = {
  electronics: 'Electronics',
  fashion: 'Fashion',
  home: 'Home & kitchen',
  groceries: 'Groceries',
  basket: 'Basket / general',
  pets: 'Pets',
  sports: 'Sports',
  beauty: 'Beauty',
  toys: 'Toys',
  automotive: 'Automotive',
  books: 'Books',
  garden: 'Garden',
  cleaning: 'Cleaning',
  beverages: 'Beverages',
  snacks: 'Snacks',
  produce: 'Fresh produce',
  accessories: 'Accessories',
  audio: 'Audio',
}

export const CATEGORY_ICON_OPTIONS: { key: CategoryIconRegistryKey; label: string }[] = (
  [
    'electronics',
    'fashion',
    'home',
    'groceries',
    'basket',
    'pets',
    'sports',
    'beauty',
    'toys',
    'automotive',
    'books',
    'garden',
    'cleaning',
    'beverages',
    'snacks',
    'produce',
    'accessories',
    'audio',
  ] as const
).map((key) => ({ key, label: LABELS[key] }))

function slugHintIcon(slug: string): ReactNode | null {
  const s = slug.toLowerCase()
  if (s.includes('phone') || s.includes('electronic')) return REGISTRY.electronics
  if (s.includes('cloth') || s.includes('fashion') || s.includes('wear')) return REGISTRY.fashion
  if (s.includes('grocery') || (s.includes('food') && !s.includes('soft'))) return REGISTRY.groceries
  if (s.includes('drink') || s.includes('beverage') || s.includes('soft-drink')) return REGISTRY.beverages
  if (s.includes('snack')) return REGISTRY.snacks
  if (s.includes('produce') || s.includes('fresh')) return REGISTRY.produce
  if (s.includes('pet')) return REGISTRY.pets
  if (s.includes('sport')) return REGISTRY.sports
  if (s.includes('toy')) return REGISTRY.toys
  if (s.includes('car') || s.includes('auto')) return REGISTRY.automotive
  if (s.includes('book')) return REGISTRY.books
  if (s.includes('garden') || s.includes('outdoor')) return REGISTRY.garden
  if (s.includes('clean')) return REGISTRY.cleaning
  if (s.includes('audio') || s.includes('sound')) return REGISTRY.audio
  if (s.includes('accessor')) return REGISTRY.accessories
  if (s.includes('home') || s.includes('kitchen')) return REGISTRY.home
  return null
}

export function renderCategoryIcon(iconKey: string | null | undefined, slug: string | null | undefined): ReactNode {
  const k = (iconKey ?? '').trim().toLowerCase() as CategoryIconRegistryKey
  if (k && k in REGISTRY) return REGISTRY[k]
  const fromSlug = slug ? slugHintIcon(slug) : null
  if (fromSlug) return fromSlug
  return <CategoryOutlinedIcon sx={iconSx} />
}
