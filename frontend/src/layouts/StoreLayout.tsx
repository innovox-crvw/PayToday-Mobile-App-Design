import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link as RouterLink, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { parseLocationForRecent, recordRecentVisit } from '../lib/recentVisits'
import { readResponseJson } from '../api/client'
import { apiUrl } from '../lib/apiOrigin'
import { NOTIFICATIONS_CHANGED_EVENT } from '../lib/notificationEvents'
import { SESSION_CHANGED_EVENT, useAuthMe } from '../hooks/useAuthMe'
import {
  AppBar,
  Badge,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Tooltip,
  Toolbar,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { HEADER_APP_GRADIENT, STORE_DESKTOP_CANVAS_GREY } from '../theme/branding'
import { StoreAppBarBrand } from '../components/layout/StoreAppBarBrand'
import { StoreDesktopNav } from '../components/layout/StoreDesktopNav'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import ElectricBoltOutlinedIcon from '@mui/icons-material/ElectricBoltOutlined'
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined'
import SearchIcon from '@mui/icons-material/Search'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import CloseIcon from '@mui/icons-material/Close'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import {
  STORE_COMPACT_BOTTOM_NAV_BAR_HEIGHT_CAP_PX,
  STORE_COMPACT_BOTTOM_NAV_MEASUREMENT_FUDGE_PX,
  STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX,
  storeCompactOutletContainerPb,
  storeCompactScrollBottomInsetPx,
} from '../lib/storeCompactShellPadding'
import {
  SERVICES_HUB_NAV_SHORT_LABELS,
  servicesCompactNavSlot,
  servicesEssentialsHref,
  servicesInsuranceHref,
} from '../lib/servicesHubTabs'

const appBarIconFocus = {
  '&:focus-visible': {
    outline: '2px solid rgba(255,255,255,0.95)',
    outlineOffset: 2,
  },
} as const

const headerIconBtnSx = {
  color: '#fff',
  ...appBarIconFocus,
  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
} as const

function storeBasePath(pathname: string): string {
  const p = pathname.replace(/^\/embed/, '') || '/'
  return p === '' ? '/' : p
}

const navValue = (pathname: string): number => {
  const p = storeBasePath(pathname)
  if (p === '/') return 0
  if (p.startsWith('/shop')) return 1
  if (p.startsWith('/wallet')) return 2
  if (p.startsWith('/orders')) return 3
  const servicesSlot = servicesCompactNavSlot(pathname)
  if (servicesSlot !== null) return servicesSlot
  if (p.startsWith('/cart') || p.startsWith('/checkout')) return -1
  return -1
}

export function StoreLayout() {
  const theme = useTheme()
  /** Viewports below `md`: fixed bottom tab bar + compact header rules (phones and tablets). */
  const isCompactShell = useMediaQuery(theme.breakpoints.down('md'))
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthMe()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const homePath = pathPrefix || '/'
  const base = storeBasePath(pathname)
  const isHome = base === '/'
  const isServicesFlow = base === '/services' || base.startsWith('/services/')
  const isOnboardingLoginFullScreen = base === '/onboarding/login'
  const hideChromeAppBar = isCompactShell && (isHome || isServicesFlow || isOnboardingLoginFullScreen)

  const profilePath = `${pathPrefix}/profile`
  const notificationsPath = `${pathPrefix}/notifications`
  const ordersPath = `${pathPrefix}/orders`

  const mobilePaths = [
    homePath,
    pathPrefix ? `${pathPrefix}/shop` : '/shop',
    pathPrefix ? `${pathPrefix}/wallet` : '/wallet',
    ordersPath,
    servicesEssentialsHref(pathPrefix),
    servicesInsuranceHref(pathPrefix),
  ] as const
  const cartPath = `${pathPrefix}/cart`
  const shopPath = `${pathPrefix}/shop`

  const [cartCount, setCartCount] = useState(0)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [searchQ, setSearchQ] = useState('')
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [mobileSearchDraft, setMobileSearchDraft] = useState('')

  useEffect(() => {
    const parsed = parseLocationForRecent(pathname, search)
    const scope = user?.sub?.trim() || user?.email?.trim() || 'guest'
    if (parsed) recordRecentVisit(parsed, { scope })
  }, [pathname, search, user?.sub, user?.email])

  useEffect(() => {
    const sp = new URLSearchParams(search)
    const q = sp.get('q') ?? ''
    // Avoid synchronous setState in effects (lint rule); defer to next microtask.
    queueMicrotask(() => {
      setSearchQ(q)
      setMobileSearchDraft(q)
    })
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
    const sub = user?.sub?.trim() ?? ''
    const hasSqlUser =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)
    let poll: ReturnType<typeof setInterval> | undefined
    if (hasSqlUser) {
      poll = setInterval(() => {
        if (document.visibilityState === 'visible') void loadUnread()
      }, 20_000)
    }
    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, on)
      window.removeEventListener(SESSION_CHANGED_EVENT, on)
    }
  }, [pathname, user?.sub])

  const bottomNavRef = useRef<HTMLDivElement | null>(null)
  const lastBottomNavBarPxRef = useRef(STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX)

  useLayoutEffect(() => {
    const clearDocInsets = () => {
      document.documentElement.style.removeProperty('--pt-store-bottom-nav-height')
      document.documentElement.style.removeProperty('--pt-store-scroll-bottom-inset')
      document.documentElement.style.removeProperty('scroll-padding-bottom')
    }

    if (!isCompactShell || isOnboardingLoginFullScreen) {
      lastBottomNavBarPxRef.current = STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX
      clearDocInsets()
      return
    }

    /** Bottom inset = measured bottom navigation height only (mobile + tablet). */
    const applyDocInsets = (bar: number) => {
      /** Single inset for scroll-padding, FAB offset, and outlet tail — `ceil(bar)` with a small floor only. */
      const padded = storeCompactScrollBottomInsetPx(bar)
      document.documentElement.style.setProperty('--pt-store-bottom-nav-height', `${padded}px`)
      document.documentElement.style.setProperty('--pt-store-scroll-bottom-inset', `${padded}px`)
      document.documentElement.style.scrollPaddingBottom = `${padded}px`
    }

    applyDocInsets(
      Math.min(
        Math.max(lastBottomNavBarPxRef.current, STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX) +
          STORE_COMPACT_BOTTOM_NAV_MEASUREMENT_FUDGE_PX,
        STORE_COMPACT_BOTTOM_NAV_BAR_HEIGHT_CAP_PX,
      ),
    )

    const el = bottomNavRef.current
    if (!el) {
      return () => {
        clearDocInsets()
      }
    }

    const sync = () => {
      const rect = el.getBoundingClientRect()
      const raw = Math.ceil(rect.height)
      const merged =
        raw > 8
          ? raw
          : lastBottomNavBarPxRef.current > 8
            ? lastBottomNavBarPxRef.current
            : STORE_COMPACT_FALLBACK_BOTTOM_NAV_HEIGHT_PX
      /**
       * Use measured bar height (+ fudge), capped — do **not** use `viewportH - rect.top` here: that is distance from
       * the top of the viewport to the top of the nav (often ~600px+), not nav height, and it pinned inset to the cap
       * and produced a large empty strip above the tabs.
       */
      const bar = Math.min(
        Math.max(merged, 56) + STORE_COMPACT_BOTTOM_NAV_MEASUREMENT_FUDGE_PX,
        STORE_COMPACT_BOTTOM_NAV_BAR_HEIGHT_CAP_PX,
      )
      lastBottomNavBarPxRef.current = bar
      applyDocInsets(bar)
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)

    let raf = 0
    const vv = window.visualViewport
    const onVisualViewport = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = 0
        sync()
      })
    }
    if (vv) {
      vv.addEventListener('resize', onVisualViewport)
      vv.addEventListener('scroll', onVisualViewport)
    }

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      if (vv) {
        vv.removeEventListener('resize', onVisualViewport)
        vv.removeEventListener('scroll', onVisualViewport)
      }
      if (raf) cancelAnimationFrame(raf)
      clearDocInsets()
    }
  }, [isCompactShell, isOnboardingLoginFullScreen, theme, pathname])

  const currentNav = navValue(pathname)

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault()
    const q = searchQ.trim()
    const dest = q ? `${shopPath}?q=${encodeURIComponent(q)}` : shopPath
    navigate(dest)
    setMobileSearchOpen(false)
  }

  function onMobileSearchDialogSubmit(e: FormEvent) {
    e.preventDefault()
    const q = mobileSearchDraft.trim()
    const dest = q ? `${shopPath}?q=${encodeURIComponent(q)}` : shopPath
    navigate(dest)
    setMobileSearchOpen(false)
  }

  const desktopChrome = !isCompactShell && !hideChromeAppBar && !isOnboardingLoginFullScreen

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        height: '100%',
        width: 1,
        maxWidth: '100%',
        overflowX: 'hidden',
        bgcolor: desktopChrome ? STORE_DESKTOP_CANVAS_GREY : 'background.default',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          flex: isCompactShell && !isOnboardingLoginFullScreen ? '0 1 auto' : 1,
          minHeight: 0,
          width: 1,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
      {!hideChromeAppBar && isCompactShell && (
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            background: HEADER_APP_GRADIENT,
            borderBottom: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'saturate(160%) blur(10px)',
          }}
        >
          <Toolbar
            disableGutters
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              width: 1,
              minHeight: { xs: 52, sm: 54 },
              px: { xs: 1, sm: 1.5 },
              py: 0.5,
            }}
          >
            <Box sx={{ flexShrink: 0, minWidth: 0, mr: 0.5 }}>
              <StoreAppBarBrand homePath={homePath} compact />
            </Box>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0}
              sx={{ flexShrink: 0, ml: 'auto' }}
            >
              <IconButton
                component={RouterLink}
                to={profilePath}
                sx={{ ...headerIconBtnSx, p: 0.85 }}
                aria-label="My account"
                size="medium"
              >
                <PersonOutlineIcon sx={{ fontSize: 22 }} />
              </IconButton>
              <IconButton
                component={RouterLink}
                to={notificationsPath}
                sx={{ ...headerIconBtnSx, p: 0.85 }}
                aria-label="Notifications"
                size="medium"
              >
                <Badge color="error" variant="dot" invisible={unreadNotifications === 0}>
                  <NotificationsNoneIcon sx={{ fontSize: 22 }} />
                </Badge>
              </IconButton>
              <IconButton
                component={RouterLink}
                to={cartPath}
                sx={{ ...headerIconBtnSx, p: 0.85 }}
                aria-label="Cart"
                size="medium"
              >
                <Badge badgeContent={cartCount} color="secondary" max={99}>
                  <ShoppingCartOutlinedIcon sx={{ fontSize: 22 }} />
                </Badge>
              </IconButton>
              <IconButton
                onClick={() => {
                  setMobileSearchDraft(searchQ)
                  setMobileSearchOpen(true)
                }}
                sx={{
                  color: '#fff',
                  ...appBarIconFocus,
                  p: 0.85,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                }}
                aria-label="Open search"
                size="medium"
              >
                <SearchIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Stack>
          </Toolbar>
          <Dialog
            fullWidth
            maxWidth="sm"
            open={mobileSearchOpen}
            onClose={() => setMobileSearchOpen(false)}
            aria-labelledby="store-mobile-search-title"
          >
            <DialogTitle id="store-mobile-search-title" sx={{ pr: 6, pb: 1 }}>
              Search store
              <IconButton
                aria-label="Close"
                onClick={() => setMobileSearchOpen(false)}
                sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
              >
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <Box component="form" onSubmit={onMobileSearchDialogSubmit}>
              <DialogContent sx={{ pt: 0, pb: 1 }}>
                <Paper
                  component="div"
                  elevation={0}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'action.hover',
                  }}
                >
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 24, flexShrink: 0 }} />
                  <InputBase
                    autoFocus
                    fullWidth
                    placeholder="Search products and services…"
                    value={mobileSearchDraft}
                    onChange={(e) => setMobileSearchDraft(e.target.value)}
                    sx={{
                      py: 1,
                      fontSize: '1rem',
                      '& .MuiInputBase-input::placeholder': { opacity: 0.75 },
                    }}
                    inputProps={{ 'aria-label': 'Search query' }}
                  />
                </Paper>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                <Button onClick={() => setMobileSearchOpen(false)} color="inherit">
                  Cancel
                </Button>
                <Button type="submit" variant="contained">
                  Search
                </Button>
              </DialogActions>
            </Box>
          </Dialog>
        </AppBar>
      )}

      {desktopChrome && (
        <Box
          sx={{
            background: HEADER_APP_GRADIENT,
            pt: { md: 1.5, lg: 1.75 },
            pb: { md: 1.75, lg: 2 },
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Box
            sx={{
              width: 1,
              maxWidth: 'none',
              px: { md: 2.5, lg: 4 },
              boxSizing: 'border-box',
            }}
          >
            <Box
              component="header"
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  md: 'auto minmax(0, 1fr) minmax(0, 260px) auto',
                  lg: 'auto minmax(0, 1fr) minmax(0, 300px) auto',
                },
                columnGap: { md: 2, lg: 2.5 },
                rowGap: 1.25,
                alignItems: 'center',
                minHeight: { md: 56, lg: 60 },
                py: { md: 0.35, lg: 0.5 },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={2} sx={{ justifySelf: 'start', minWidth: 0 }}>
                <StoreAppBarBrand homePath={homePath} />
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{
                    borderColor: 'rgba(255,255,255,0.22)',
                    height: { md: 34, lg: 40 },
                    alignSelf: 'center',
                  }}
                />
              </Stack>

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: 0,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
                }}
              >
                <StoreDesktopNav pathPrefix={pathPrefix} />
              </Box>

              <Paper
                component="form"
                onSubmit={onSearchSubmit}
                elevation={0}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 999,
                  bgcolor: 'rgba(255,255,255,0.14)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  backdropFilter: 'saturate(160%) blur(12px)',
                  minWidth: 0,
                  width: 1,
                  maxWidth: 1,
                  justifySelf: 'stretch',
                  transition: theme.transitions.create(['background-color', 'border-color', 'box-shadow'], {
                    duration: theme.transitions.duration.shorter,
                  }),
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                  '&:focus-within': {
                    bgcolor: 'rgba(255,255,255,0.2)',
                    borderColor: 'rgba(255,255,255,0.35)',
                    boxShadow: `0 0 0 3px ${alpha('#fff', 0.12)}, inset 0 1px 0 rgba(255,255,255,0.14)`,
                  },
                }}
              >
                <SearchIcon sx={{ color: 'rgba(255,255,255,0.82)', fontSize: 19, flexShrink: 0 }} />
                <InputBase
                  placeholder="Search…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    color: '#fff',
                    fontSize: '0.8125rem',
                    '& .MuiInputBase-input::placeholder': {
                      color: 'rgba(255,255,255,0.55)',
                      opacity: 1,
                    },
                  }}
                  inputProps={{ 'aria-label': 'Search store' }}
                />
              </Paper>

              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0, justifySelf: 'end' }}>
                <Tooltip title="My account" arrow placement="bottom" enterDelay={400}>
                  <Box component="span" sx={{ display: 'inline-flex' }}>
                    <IconButton component={RouterLink} to={profilePath} sx={headerIconBtnSx} aria-label="My account" size="medium">
                      <PersonOutlineIcon />
                    </IconButton>
                  </Box>
                </Tooltip>
                <Tooltip title="Notifications" arrow placement="bottom" enterDelay={400}>
                  <Box component="span" sx={{ display: 'inline-flex' }}>
                    <IconButton component={RouterLink} to={notificationsPath} sx={headerIconBtnSx} aria-label="Notifications" size="medium">
                      <Badge color="error" variant="dot" invisible={unreadNotifications === 0}>
                        <NotificationsNoneIcon />
                      </Badge>
                    </IconButton>
                  </Box>
                </Tooltip>
                <Tooltip title="My orders" arrow placement="bottom" enterDelay={400}>
                  <Box component="span" sx={{ display: 'inline-flex' }}>
                    <IconButton
                      component={NavLink}
                      to={ordersPath}
                      sx={{
                        ...headerIconBtnSx,
                        '&.active': { bgcolor: 'rgba(255,255,255,0.16)' },
                      }}
                      aria-label="My orders"
                      size="medium"
                    >
                      <ReceiptLongOutlinedIcon />
                    </IconButton>
                  </Box>
                </Tooltip>
                <Tooltip title="Cart" arrow placement="bottom" enterDelay={400}>
                  <Box component="span" sx={{ display: 'inline-flex' }}>
                    <IconButton component={RouterLink} to={cartPath} sx={headerIconBtnSx} aria-label="Cart" size="medium">
                      <Badge badgeContent={cartCount} color="secondary">
                        <ShoppingCartOutlinedIcon />
                      </Badge>
                    </IconButton>
                  </Box>
                </Tooltip>
              </Stack>
            </Box>
          </Box>
        </Box>
      )}

      <Box
        component="main"
        sx={{
          // Compact: do not grow to fill the viewport — avoids a long empty scroll past page content (e.g. home).
          flex: isCompactShell && !isOnboardingLoginFullScreen ? '0 1 auto' : 1,
          minHeight: isCompactShell ? 'min-content' : '100%',
          display: 'flex',
          flexDirection: 'column',
          width: 1,
          ...(desktopChrome
            ? {
                bgcolor: STORE_DESKTOP_CANVAS_GREY,
              }
            : {}),
          ...(isCompactShell && !isOnboardingLoginFullScreen
            ? {
                pb: 0,
                bgcolor: 'background.default',
              }
            : { pb: 0 }),
        }}
      >
        {isOnboardingLoginFullScreen ? (
          <Box
            sx={{
              flex: 1,
              width: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              p: 0,
              m: 0,
              pb: isCompactShell ? 'env(safe-area-inset-bottom, 0px)' : 0,
            }}
          >
            <Outlet />
          </Box>
        ) : (
          <Container
            maxWidth={desktopChrome ? false : 'xl'}
            sx={{
              flex: isCompactShell ? '0 1 auto' : 1,
              width: 1,
              minHeight: isCompactShell ? 'min-content' : '100%',
              ...(isCompactShell
                ? {
                    pt: hideChromeAppBar ? { xs: 0, sm: 3, md: 4 } : { xs: 2, sm: 3, md: desktopChrome ? 4 : 4 },
                    px: { xs: 2, sm: 3, md: desktopChrome ? 4 : 4, lg: 5 },
                    pb: (t) => storeCompactOutletContainerPb(t),
                  }
                : {
                    py: hideChromeAppBar ? { xs: 0, sm: 3, md: 4 } : { xs: 2, sm: 3, md: desktopChrome ? 4 : 4 },
                    px: { xs: 2, sm: 3, md: desktopChrome ? 4 : 4, lg: 5 },
                    pb: { md: 6 },
                  }),
              ...(desktopChrome
                ? {
                    bgcolor: 'transparent',
                    maxWidth: 'none',
                  }
                : {}),
            }}
          >
            <Outlet />
          </Container>
        )}
      </Box>
      </Box>

      {isCompactShell && !isOnboardingLoginFullScreen && (
        <BottomNavigation
          ref={bottomNavRef}
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
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            '& .MuiBottomNavigationAction-root': { minWidth: 44, maxWidth: 72, py: 0.5, px: 0.2 },
          }}
        >
          <BottomNavigationAction label="Home" icon={<HomeOutlinedIcon />} />
          <BottomNavigationAction label="Store" icon={<StorefrontOutlinedIcon />} />
          <BottomNavigationAction
            label="Wallet"
            icon={
              <Box
                sx={(t) => ({
                  width: 50,
                  height: 50,
                  borderRadius: 2.25,
                  bgcolor: 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 10px 28px ${alpha(t.palette.primary.main, 0.45)}`,
                  color: '#fff',
                })}
              >
                <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 28 }} />
              </Box>
            }
            sx={{
              transform: 'translateY(-14px)',
              minWidth: 72,
              maxWidth: 92,
              px: 0.5,
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.65rem',
                mt: 0.75,
                opacity: 1,
                fontWeight: 700,
              },
            }}
          />
          <BottomNavigationAction label="My orders" icon={<ReceiptLongOutlinedIcon />} />
          <BottomNavigationAction label={SERVICES_HUB_NAV_SHORT_LABELS.essentials} icon={<ElectricBoltOutlinedIcon />} />
          <BottomNavigationAction label={SERVICES_HUB_NAV_SHORT_LABELS.insurance} icon={<PolicyOutlinedIcon />} />
        </BottomNavigation>
      )}
    </Box>
  )
}
