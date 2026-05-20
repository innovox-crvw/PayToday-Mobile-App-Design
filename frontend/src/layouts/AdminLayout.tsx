import { useState } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { apiFetch, fetchCsrfToken } from '../api/client'
import { SESSION_CHANGED_EVENT } from '../hooks/useAuthMe'
import { APP_DISPLAY_NAME } from '../theme/branding'

const DRAWER_WIDTH = 264

const LINKS = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/products', label: 'Products & catalogue' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/stores', label: 'Pickup stores' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/payment-plans', label: 'Payment plans' },
  { to: '/admin/disputes', label: 'Disputes' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/fulfillment', label: 'Fulfillment' },
  { to: '/admin/deposit-boxes', label: 'Deposit boxes' },
  { to: '/admin/store-hours', label: 'Store hours' },
] as const

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const drawerPaperSx = {
    boxSizing: 'border-box' as const,
    width: DRAWER_WIDTH,
    borderRight: 'none',
    bgcolor: '#1a1d24',
    color: 'grey.100',
  }

  const navItemSx = {
    borderRadius: 2,
    py: 1.15,
    mb: 0.35,
    color: 'grey.300',
    '&:hover': {
      bgcolor: alpha('#fff', 0.06),
    },
    '&.Mui-selected': {
      bgcolor: 'common.white',
      color: 'grey.900',
      '&:hover': {
        bgcolor: 'common.white',
      },
    },
  }

  async function signOut() {
    setSignOutBusy(true)
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    } finally {
      setSignOutBusy(false)
    }
    window.dispatchEvent(new Event('pt-cart-updated'))
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    navigate('/admin/login', { replace: true })
  }

  const drawer = (
    <Box onClick={() => setMobileOpen(false)} sx={{ textAlign: 'left', height: 1, display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        sx={{
          minHeight: { xs: 56, sm: 64 },
          borderBottom: 1,
          borderColor: alpha('#fff', 0.1),
          px: 2,
          bgcolor: 'transparent',
        }}
      >
        <Typography variant="h6" fontWeight={800} letterSpacing={-0.25} sx={{ color: 'common.white' }}>
          {APP_DISPLAY_NAME} Ops
        </Typography>
      </Toolbar>
      <List sx={{ px: 1.5, py: 1.5, flex: 1 }}>
        {LINKS.map((item) => (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={pathname === item.to}
            sx={navItemSx}
          >
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
          </ListItemButton>
        ))}
        <Divider sx={{ my: 1.5, borderColor: alpha('#fff', 0.12) }} />
        <ListItemButton disabled sx={{ ...navItemSx, opacity: 0.45 }}>
          <ListItemText primary="Help" primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
        </ListItemButton>
        <ListItemButton disabled sx={{ ...navItemSx, opacity: 0.45, mb: 1 }}>
          <ListItemText primary="Settings" primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
        </ListItemButton>
        <ListItemButton onClick={() => void signOut()} disabled={signOutBusy} sx={navItemSx}>
          <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
            <LogoutOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={signOutBusy ? 'Signing out…' : 'Sign out'} primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
        </ListItemButton>
        <ListItemButton component={RouterLink} to="/" sx={{ ...navItemSx, color: 'grey.500', '&.Mui-selected': { bgcolor: 'transparent', color: 'grey.400' } }}>
          <ListItemText primary="← Back to storefront" primaryTypographyProps={{ variant: 'body2' }} />
        </ListItemButton>
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', position: 'relative' }}>
      <CssBaseline />
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          top: 0,
          zIndex: 9999,
          px: 2,
          py: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          textDecoration: 'none',
          borderRadius: 1,
          fontWeight: 700,
          fontSize: '0.875rem',
          '&:focus': {
            left: 8,
            top: 8,
            outline: '2px solid',
            outlineColor: 'primary.light',
          },
        }}
        className="skip-link"
      >
        Skip to content
      </Box>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
        }}
        elevation={0}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, gap: 1 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, display: { md: 'none' } }}
            aria-label="Open navigation menu"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" fontWeight={800} letterSpacing={-0.2}>
            Admin / Operations
          </Typography>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          aria-label="Admin navigation"
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': drawerPaperSx,
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          aria-label="Admin navigation"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': drawerPaperSx,
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        id="main-content"
        component="main"
        tabIndex={-1}
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: { xs: 7, sm: 8 },
          bgcolor: 'background.default',
          minHeight: '100dvh',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  )
}
