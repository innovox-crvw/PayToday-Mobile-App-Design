import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { parseLocationForRecent, recordRecentVisit } from '../lib/recentVisits'
import { readResponseJson } from '../api/client'
import { apiUrl } from '../lib/apiOrigin'
import { NOTIFICATIONS_CHANGED_EVENT } from '../lib/notificationEvents'
import { SESSION_CHANGED_EVENT } from '../hooks/useAuthMe'
import {
  AppBar,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Container,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Toolbar,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { HEADER_APP_GRADIENT, SURFACE_BORDER } from '../theme/branding'
import { StoreAppBarBrand } from '../components/layout/StoreAppBarBrand'
import { StoreDesktopNav } from '../components/layout/StoreDesktopNav'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner'
import PaymentsIcon from '@mui/icons-material/Payments'
import ShoppingBasketOutlinedIcon from '@mui/icons-material/ShoppingBasketOutlined'
import SearchIcon from '@mui/icons-material/Search'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'

const appBarIconFocus = {
  '&:focus-visible': {
    outline: '2px solid rgba(255,255,255,0.95)',
    outlineOffset: 2,
  },
} as const

function storeBasePath(pathname: string): string {
  const p = pathname.replace(/^\/embed/, '') || '/'
  return p === '' ? '/' : p
}

const navValue = (pathname: string): number => {
  const p = storeBasePath(pathname)
  if (p === '/') return 0
  if (p.startsWith('/wallet')) return 1
  if (p.startsWith('/payments')) return 2
  if (p.startsWith('/scan')) return 3
  if (p.startsWith('/services')) return 4
  if (p.startsWith('/cart') || p.startsWith('/checkout')) return -1
  return -1
}

export function StoreLayout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const homePath = pathPrefix || '/'
  const base = storeBasePath(pathname)
  const isHome = base === '/'
  const isPaymentsFlow = base === '/payments' || base.startsWith('/payments/')
  const isServicesFlow = base === '/services' || base.startsWith('/services/')
  const hideChromeAppBar = isMobile && (isHome || isPaymentsFlow || isServicesFlow)

  const mobilePaths = [
    homePath,
    pathPrefix ? `${pathPrefix}/wallet` : '/wallet',
    pathPrefix ? `${pathPrefix}/payments` : '/payments',
    pathPrefix ? `${pathPrefix}/scan` : '/scan',
    pathPrefix ? `${pathPrefix}/services` : '/services',
  ] as const

  const profilePath = `${pathPrefix}/profile`
  const notificationsPath = `${pathPrefix}/notifications`
  const cartPath = `${pathPrefix}/cart`
  const shopPath = `${pathPrefix}/shop`

  const [cartCount, setCartCount] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [searchQ, setSearchQ] = useState('')
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null)

  useEffect(() => {
    const parsed = parseLocationForRecent(pathname, search)
    if (parsed) recordRecentVisit(parsed)
  }, [pathname, search])

  useEffect(() => {
    const sp = new URLSearchParams(search)
    setSearchQ(sp.get('q') ?? '')
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function loadCart() {
      try {
        const res = await fetch(apiUrl('/api/cart'), { credentials: 'include' })
        if (!res.ok) return
        const data = await readResponseJson<{ items?: { quantity: number }[] }>(res)
        const n = data.items?.reduce((s, i) => s + i.quantity, 0) ?? 0
        if (!cancelled) setCartCount(n)
      } catch {
        /* offline */
      }
    }
    void loadCart()
    const onUpd = () => void loadCart()
    window.addEventListener('pt-cart-updated', onUpd)
    return () => {
      cancelled = true
      window.removeEventListener('pt-cart-updated', onUpd)
    }
  }, [pathname])

  useEffect(() => {
    let cancelled = false
    async function loadUnread() {
      try {
        const res = await fetch(apiUrl('/api/notifications/unread-count'), { credentials: 'include' })
        if (!res.ok) {
          if (!cancelled) setUnreadNotifications(0)
          return
        }
        const data = await readResponseJson<{ unread?: number }>(res)
        if (!cancelled) setUnreadNotifications(Number(data.unread ?? 0))
      } catch {
        if (!cancelled) setUnreadNotifications(0)
      }
    }
    void loadUnread()
    const on = () => void loadUnread()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, on)
    window.addEventListener(SESSION_CHANGED_EVENT, on)
    return () => {
      cancelled = true
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, on)
      window.removeEventListener(SESSION_CHANGED_EVENT, on)
    }
  }, [pathname])

  const currentNav = navValue(pathname)
  const showMobileStoreSearch = isMobile && !hideChromeAppBar && base.startsWith('/shop')

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault()
    const q = searchQ.trim()
    const dest = q ? `${shopPath}?q=${encodeURIComponent(q)}` : shopPath
    navigate(dest)
  }

  const desktopChrome = !isMobile && !hideChromeAppBar

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: desktopChrome ? '#f1f5f9' : 'background.default', display: 'flex', flexDirection: 'column' }}>
      {!hideChromeAppBar && isMobile && (
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            background: HEADER_APP_GRADIENT,
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'saturate(160%) blur(10px)',
          }}
        >
          <Toolbar sx={{ gap: 2, flexWrap: 'wrap', width: 1 }}>
            <StoreAppBarBrand homePath={homePath} />
            <Box sx={{ flexGrow: 1 }} />
            {!isHome && !isPaymentsFlow && (
              <>
                <IconButton component={RouterLink} to={cartPath} sx={{ color: '#fff', ...appBarIconFocus }} aria-label="Cart">
                  <Badge badgeContent={cartCount} color="secondary">
                    <ShoppingCartOutlinedIcon />
                  </Badge>
                </IconButton>
                <IconButton component={RouterLink} to={`${pathPrefix}/wallet`} sx={{ color: '#fff', ...appBarIconFocus }} aria-label="Wallet">
                  <AccountBalanceWalletOutlinedIcon />
                </IconButton>
              </>
            )}
          </Toolbar>
          {showMobileStoreSearch ? (
            <Box sx={{ px: 2, pb: 1.5, pt: 0 }}>
              <Paper
                component="form"
                onSubmit={onSearchSubmit}
                elevation={0}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.75,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'saturate(140%) blur(10px)',
                }}
              >
                <SearchIcon sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 22 }} />
                <InputBase
                  placeholder="Search products, services, payments"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  sx={{
                    flex: 1,
                    color: '#fff',
                    fontSize: '0.95rem',
                    '& .MuiInputBase-input::placeholder': {
                      color: 'rgba(255,255,255,0.6)',
                      opacity: 1,
                    },
                  }}
                  inputProps={{ 'aria-label': 'Search store' }}
                />
              </Paper>
            </Box>
          ) : null}
        </AppBar>
      )}

      {desktopChrome && (
        <Box
          sx={{
            background: HEADER_APP_GRADIENT,
            pt: 2,
            pb: 3.25,
            px: { md: 2, lg: 3 },
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Container maxWidth="lg" disableGutters sx={{ px: { xs: 2, md: 0 } }}>
            <Stack spacing={2.25}>
              <Toolbar
                disableGutters
                sx={{
                  minHeight: { md: 56 },
                  gap: 1.5,
                  flexWrap: { md: 'nowrap' },
                  alignItems: 'center',
                  py: { md: 0.5 },
                }}
              >
                <StoreAppBarBrand homePath={homePath} />
                <StoreDesktopNav pathPrefix={pathPrefix} />
                <Box sx={{ flex: 1 }} />
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <IconButton component={RouterLink} to={profilePath} sx={{ color: '#fff', ...appBarIconFocus }} aria-label="Profile">
                    <PersonOutlineIcon />
                  </IconButton>
                  <IconButton component={RouterLink} to={notificationsPath} sx={{ color: '#fff', ...appBarIconFocus }} aria-label="Notifications">
                    <Badge color="error" variant="dot" invisible={unreadNotifications === 0}>
                      <NotificationsNoneIcon />
                    </Badge>
                  </IconButton>
                  <IconButton component={RouterLink} to={cartPath} sx={{ color: '#fff', ...appBarIconFocus }} aria-label="Cart">
                    <Badge badgeContent={cartCount} color="secondary">
                      <ShoppingCartOutlinedIcon />
                    </Badge>
                  </IconButton>
                  <IconButton
                    sx={{ color: '#fff', ...appBarIconFocus }}
                    aria-label="More"
                    aria-controls={moreAnchor ? 'store-more-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={moreAnchor ? 'true' : undefined}
                    onClick={(e) => setMoreAnchor(e.currentTarget)}
                  >
                    <MoreHorizIcon />
                  </IconButton>
                  <Menu id="store-more-menu" anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)} keepMounted>
                    <MenuItem component={RouterLink} to={`${pathPrefix}/orders`} onClick={() => setMoreAnchor(null)}>
                      My orders
                    </MenuItem>
                    <MenuItem component={RouterLink} to={`${pathPrefix}/account`} onClick={() => setMoreAnchor(null)}>
                      Account
                    </MenuItem>
                    <MenuItem component={RouterLink} to={shopPath} onClick={() => setMoreAnchor(null)}>
                      Store
                    </MenuItem>
                  </Menu>
                </Stack>
              </Toolbar>

              <Paper
                component="form"
                onSubmit={onSearchSubmit}
                elevation={0}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.1,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backdropFilter: 'saturate(140%) blur(10px)',
                  maxWidth: 980,
                  mx: 'auto',
                  transition: theme.transitions.create(['background-color', 'border-color'], {
                    duration: theme.transitions.duration.shorter,
                  }),
                  '&:focus-within': {
                    bgcolor: 'rgba(255,255,255,0.16)',
                    borderColor: 'rgba(255,255,255,0.28)',
                  },
                }}
              >
                <SearchIcon sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 22 }} />
                <InputBase
                  placeholder="Search products, services, payments"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  sx={{
                    flex: 1,
                    color: '#fff',
                    fontSize: '0.95rem',
                    '& .MuiInputBase-input::placeholder': {
                      color: 'rgba(255,255,255,0.6)',
                      opacity: 1,
                    },
                  }}
                  inputProps={{ 'aria-label': 'Search store' }}
                />
              </Paper>
            </Stack>
          </Container>
        </Box>
      )}

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          width: 1,
          ...(desktopChrome
            ? {
                bgcolor: '#ffffff',
              }
            : {}),
        }}
      >
        <Container
          maxWidth="xl"
          sx={{
            flex: 1,
            width: 1,
            minHeight: 0,
            py: hideChromeAppBar ? { xs: 0, sm: 3, md: 4 } : { xs: 2, sm: 3, md: desktopChrome ? 4 : 4 },
            px: { xs: 2, sm: 3, md: desktopChrome ? 4 : 4, lg: 5 },
            // Clear fixed bottom nav (tall bar + labels + optional FAB lift) + home indicator / gesture bar
            pb: isMobile
              ? (t) => `calc(${t.spacing(18)} + env(safe-area-inset-bottom, 0px))`
              : { md: 6 },
            ...(desktopChrome
              ? {
                  bgcolor: 'background.paper',
                  borderRadius: '6px 6px 0 0',
                  border: `1px solid ${SURFACE_BORDER}`,
                  borderBottom: 'none',
                  mt: 0,
                  pt: { md: 4 },
                  boxShadow: '0 -10px 34px rgba(15, 23, 42, 0.06)',
                  maxWidth: 'lg',
                  mx: 'auto',
                }
              : {}),
          }}
        >
          <Outlet />
        </Container>
      </Box>

      {isMobile && (
        <BottomNavigation
          value={currentNav < 0 ? false : currentNav}
          onChange={(_e, newValue) => {
            navigate(mobilePaths[newValue])
          }}
          showLabels
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: theme.zIndex.appBar - 1,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            '& .MuiBottomNavigationAction-root': { minWidth: 56, maxWidth: 80, py: 0.5 },
          }}
        >
          <BottomNavigationAction label="Home" icon={<HomeOutlinedIcon />} />
          <BottomNavigationAction label="Wallet" icon={<AccountBalanceWalletOutlinedIcon />} />
          <BottomNavigationAction
            label="Payments"
            icon={
              <Box
                sx={(t) => ({
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 8px 24px ${alpha(t.palette.primary.main, 0.42)}`,
                  color: '#fff',
                })}
              >
                <PaymentsIcon sx={{ fontSize: 26 }} />
              </Box>
            }
            sx={{
              transform: 'translateY(-12px)',
              minWidth: 68,
              maxWidth: 88,
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.65rem',
                mt: 0.5,
                opacity: 1,
              },
            }}
          />
          <BottomNavigationAction label="Scan" icon={<QrCodeScannerIcon />} />
          <BottomNavigationAction label="Services" icon={<ShoppingBasketOutlinedIcon />} />
        </BottomNavigation>
      )}
    </Box>
  )
}
