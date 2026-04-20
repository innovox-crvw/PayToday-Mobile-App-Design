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
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import { apiFetch, fetchCsrfToken } from '../api/client'
import { SESSION_CHANGED_EVENT } from '../hooks/useAuthMe'

const DRAWER_WIDTH = 264

const LINKS = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/products', label: 'Products & catalogue' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/returns', label: 'Returns' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/fulfillment', label: 'Fulfillment' },
  { to: '/admin/deposit-boxes', label: 'Deposit boxes' },
] as const

export function AdminLayout() {
  const theme = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const drawerPaperSx = {
    boxSizing: 'border-box' as const,
    width: DRAWER_WIDTH,
    borderRight: `1px solid ${theme.palette.divider}`,
    bgcolor: 'background.paper',
  }

  async function signOut() {
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
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
          borderColor: 'divider',
          px: 2,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${alpha(theme.palette.secondary.main, 0.06)} 100%)`,
        }}
      >
        <Typography variant="h6" fontWeight={800} letterSpacing={-0.25} sx={{ color: 'text.primary' }}>
          PayToday Ops
        </Typography>
      </Toolbar>
      <List sx={{ px: 1.5, py: 1.5, flex: 1 }}>
        {LINKS.map((item) => (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={pathname === item.to}
            sx={{
              borderRadius: 1.5,
              py: 1.15,
              mb: 0.25,
              '&.Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.1),
              },
            }}
          >
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
          </ListItemButton>
        ))}
        <Divider sx={{ my: 1.5 }} />
        <ListItemButton onClick={() => void signOut()} sx={{ borderRadius: 1.5, py: 1.15 }}>
          <ListItemIcon sx={{ minWidth: 40 }}>
            <LogoutOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Sign out" primaryTypographyProps={{ fontWeight: 600, variant: 'body2' }} />
        </ListItemButton>
        <ListItemButton component={RouterLink} to="/" sx={{ borderRadius: 1.5, py: 1.15 }}>
          <ListItemText primary="← Back to storefront" primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
        </ListItemButton>
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <CssBaseline />
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
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': drawerPaperSx,
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
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
        component="main"
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
