import { NavLink, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import ElectricBoltOutlinedIcon from '@mui/icons-material/ElectricBoltOutlined'
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined'
import {
  SERVICES_HUB_TAB_LABELS,
  servicesCompactNavSlot,
  servicesEssentialsHref,
  servicesInsuranceHref,
} from '../../lib/servicesHubTabs'
import { HEADER_TEXT_MUTED, HEADER_TEXT_PRIMARY } from '../../theme/branding'

function storeHref(pathPrefix: string, segment: string): string {
  if (!segment) return pathPrefix || '/'
  const rel = segment.replace(/^\//, '')
  if (!pathPrefix) return `/${rel}`
  return `${pathPrefix}/${rel}`.replace(/\/+/g, '/')
}

const navSx = {
  color: HEADER_TEXT_MUTED,
  fontWeight: 600,
  fontSize: { md: 11.5, lg: 12.5 },
  textTransform: 'none' as const,
  px: { md: 0.35, lg: 0.5 },
  py: 0.45,
  borderRadius: 2,
  minWidth: 0,
  lineHeight: 1.2,
  gap: 0,
  '&:hover': {
    bgcolor: 'rgba(255,255,255,0.08)',
  },
  '&.active': {
    color: HEADER_TEXT_PRIMARY,
    bgcolor: 'rgba(255,255,255,0.06)',
    '& .MuiButton-startIcon': { opacity: 1 },
  },
  '& .MuiButton-startIcon': {
    /* MUI sets its own margins; override fully for tight icon-label spacing. */
    marginLeft: 0,
    marginRight: 0,
    opacity: 0.9,
    display: 'inline-flex',
    alignItems: 'center',
  },
  '& .MuiButton-startIcon > *:nth-of-type(1)': {
    /* Remove any extra inline spacing around the icon element itself. */
    margin: 0,
  },
}

const serviceNavActiveSx = {
  color: HEADER_TEXT_PRIMARY,
  bgcolor: 'rgba(255,255,255,0.06)',
  '& .MuiButton-startIcon': { opacity: 1 },
} as const

export function StoreDesktopNav(props: { centered?: boolean; pathPrefix?: string }) {
  const { centered, pathPrefix = '' } = props
  const { pathname } = useLocation()
  const servicesSlot = servicesCompactNavSlot(pathname)
  const home = storeHref(pathPrefix, '')
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: centered ? 'center' : 'flex-start',
        flexWrap: 'nowrap',
        gap: { md: 0.75, lg: 1.25 },
        flex: centered ? 1 : undefined,
        minWidth: 0,
      }}
    >
      <Button component={NavLink} to={home} end sx={navSx} startIcon={<HomeOutlinedIcon sx={{ fontSize: 18 }} />}>
        Home
      </Button>
      <Button component={NavLink} to={storeHref(pathPrefix, 'shop')} sx={navSx} startIcon={<StorefrontOutlinedIcon sx={{ fontSize: 18 }} />}>
        Store
      </Button>
      <Button component={NavLink} to={storeHref(pathPrefix, 'wallet')} sx={navSx} startIcon={<AccountBalanceWalletOutlinedIcon sx={{ fontSize: 18 }} />}>
        Wallet
      </Button>
      <Button
        component={NavLink}
        to={servicesEssentialsHref(pathPrefix)}
        sx={{ ...navSx, ...(servicesSlot === 4 ? serviceNavActiveSx : {}) }}
        startIcon={<ElectricBoltOutlinedIcon sx={{ fontSize: 18 }} />}
      >
        {SERVICES_HUB_TAB_LABELS.essentials}
      </Button>
      <Button
        component={NavLink}
        to={servicesInsuranceHref(pathPrefix)}
        sx={{ ...navSx, ...(servicesSlot === 5 ? serviceNavActiveSx : {}) }}
        startIcon={<PolicyOutlinedIcon sx={{ fontSize: 18 }} />}
      >
        {SERVICES_HUB_TAB_LABELS.insurance}
      </Button>
    </Box>
  )
}
