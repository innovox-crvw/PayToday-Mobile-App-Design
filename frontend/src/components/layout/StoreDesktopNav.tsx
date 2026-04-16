import { NavLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import PaymentOutlinedIcon from '@mui/icons-material/PaymentOutlined'
import QrCodeScannerOutlinedIcon from '@mui/icons-material/QrCodeScannerOutlined'
import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined'
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
  fontSize: 12.5,
  textTransform: 'none' as const,
  px: 0.5,
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

export function StoreDesktopNav(props: { centered?: boolean; pathPrefix?: string }) {
  const { centered, pathPrefix = '' } = props
  const home = storeHref(pathPrefix, '')
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: centered ? 'center' : 'flex-start',
        flexWrap: 'wrap',
        gap: 1.25,
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
      <Button component={NavLink} to={storeHref(pathPrefix, 'payments')} sx={navSx} startIcon={<PaymentOutlinedIcon sx={{ fontSize: 18 }} />}>
        Payments
      </Button>
      <Button component={NavLink} to={storeHref(pathPrefix, 'scan')} sx={navSx} startIcon={<QrCodeScannerOutlinedIcon sx={{ fontSize: 18 }} />}>
        Scan
      </Button>
      <Button component={NavLink} to={storeHref(pathPrefix, 'services')} sx={navSx} startIcon={<AppsOutlinedIcon sx={{ fontSize: 18 }} />}>
        Services
      </Button>
    </Box>
  )
}
