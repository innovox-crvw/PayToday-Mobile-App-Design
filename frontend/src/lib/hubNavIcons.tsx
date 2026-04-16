import type { ReactNode } from 'react'
import BusinessIcon from '@mui/icons-material/Business'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import SimCardOutlinedIcon from '@mui/icons-material/SimCardOutlined'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined'
import LocalGasStationOutlinedIcon from '@mui/icons-material/LocalGasStationOutlined'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import HotelOutlinedIcon from '@mui/icons-material/HotelOutlined'
import ShoppingBasketOutlinedIcon from '@mui/icons-material/ShoppingBasketOutlined'
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined'
import UmbrellaOutlinedIcon from '@mui/icons-material/UmbrellaOutlined'
import DialpadOutlinedIcon from '@mui/icons-material/DialpadOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'

const sx = { fontSize: 28 } as const

const map: Record<string, ReactNode> = {
  business: <BusinessIcon sx={sx} />,
  contacts: <PersonOutlineIcon sx={sx} />,
  airtime: <SimCardOutlinedIcon sx={sx} />,
  electricity: <BoltOutlinedIcon sx={sx} />,
  bills: <ReceiptLongOutlinedIcon sx={sx} />,
  food: <RestaurantOutlinedIcon sx={sx} />,
  fuel: <LocalGasStationOutlinedIcon sx={sx} />,
  parking: <DirectionsCarOutlinedIcon sx={sx} />,
  vouchers: <ConfirmationNumberOutlinedIcon sx={sx} />,
  stay: <HotelOutlinedIcon sx={sx} />,
  services: <ShoppingBasketOutlinedIcon sx={sx} />,
  water: <WaterDropOutlinedIcon sx={sx} />,
  insurance: <UmbrellaOutlinedIcon sx={sx} />,
  ussd: <DialpadOutlinedIcon sx={sx} />,
  storefront: <StorefrontOutlinedIcon sx={sx} />,
}

export function hubNavIcon(iconKey: string): ReactNode {
  return map[iconKey] ?? <BusinessIcon sx={sx} />
}
