import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import {
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken } from '../../api/client'

type MenuItem = {
  to: string
  label: string
  icon: ReactNode
  /** Hidden when not signed in */
  authOnly?: boolean
}

const menu: MenuItem[] = [
  { to: 'personal', label: 'My Personal Details', icon: <PersonOutlineIcon />, authOnly: true },
  { to: 'addresses', label: 'Address book', icon: <HomeWorkOutlinedIcon />, authOnly: true },
  { to: 'settings', label: 'Settings', icon: <SettingsOutlinedIcon />, authOnly: true },
  { to: 'support', label: 'Support', icon: <SupportAgentOutlinedIcon /> },
  { to: 'legal', label: 'Legal', icon: <GavelOutlinedIcon /> },
  { to: 'delete-account', label: 'Delete my Account', icon: <DeleteOutlineIcon />, authOnly: true },
  { to: 'feedback', label: 'Feedback', icon: <CampaignOutlinedIcon /> },
]

export function ProfileHubPage() {
  const prefix = useStorePathPrefix()
  const base = prefix ? `${prefix}/profile` : '/profile'
  const { pathname } = useLocation()
  const accountPath = pathname.startsWith('/embed') ? '/embed/account' : '/account'
  const onboardingSignInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile`)}`
  const { user, loading } = useAuthMe()
  const [loggingOut, setLoggingOut] = useState(false)

  const visibleMenu = menu.filter((item) => !item.authOnly || user)

  const initial =
    user?.fullName?.trim()?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? ''

  const displayName = user?.fullName?.trim() || user?.email || ''

  async function logout() {
    setLoggingOut(true)
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch {
      /* ignore */
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ maxWidth: { xs: 480, md: 560 }, mx: 'auto', pb: { xs: 2, md: 4 } }}>
      <WalletSubheader title="Profile" />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={36} />
        </Box>
      ) : user ? (
        <>
          <Stack alignItems="center" spacing={1} sx={{ py: 1 }}>
            <Avatar sx={{ width: 88, height: 88, bgcolor: 'primary.main', fontSize: '2rem', fontWeight: 800 }}>
              {initial || '?'}
            </Avatar>
            <Button component={RouterLink} to={accountPath} size="small" variant="text" sx={{ fontWeight: 700 }}>
              Edit on Account
            </Button>
            <Typography variant="h6" fontWeight={800} textAlign="center">
              {displayName}
            </Typography>
            {user.fullName?.trim() ? (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {user.email}
              </Typography>
            ) : null}
          </Stack>

          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', overflow: 'hidden' }}>
            <List disablePadding>
              {visibleMenu.map((item, i) => (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={`${base}/${item.to}`}
                  sx={{
                    py: 2,
                    px: 2,
                    borderBottom: i < visibleMenu.length - 1 ? 1 : 0,
                    borderColor: 'divider',
                  }}
                >
                  <ListItemIcon sx={{ color: 'primary.main', minWidth: 44 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
                  <ChevronRightIcon color="action" />
                </ListItemButton>
              ))}
            </List>
          </Card>

          <Box sx={{ textAlign: 'center', pt: 1 }}>
            <Button
              color="inherit"
              sx={{ fontWeight: 700 }}
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              {loggingOut ? 'Signing out…' : 'Log out'}
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Stack alignItems="center" spacing={1.5} sx={{ py: 2, px: 1 }}>
            <Avatar sx={{ width: 88, height: 88, bgcolor: 'action.hover', color: 'text.secondary' }}>
              <PersonOutlineIcon sx={{ fontSize: 48 }} />
            </Avatar>
            <Typography variant="h6" fontWeight={800} textAlign="center">
              No account signed in
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 320, lineHeight: 1.5 }}>
              Sign in to see your name and email here, manage personal details, and use account-only options.
            </Typography>
            <Button component={RouterLink} to={onboardingSignInPath} variant="contained" size="large" sx={{ fontWeight: 700, mt: 1 }}>
              Sign in or create account
            </Button>
          </Stack>

          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', overflow: 'hidden' }}>
            <List disablePadding>
              {visibleMenu.map((item, i) => (
                <ListItemButton
                  key={item.to}
                  component={RouterLink}
                  to={`${base}/${item.to}`}
                  sx={{
                    py: 2,
                    px: 2,
                    borderBottom: i < visibleMenu.length - 1 ? 1 : 0,
                    borderColor: 'divider',
                  }}
                >
                  <ListItemIcon sx={{ color: 'primary.main', minWidth: 44 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
                  <ChevronRightIcon color="action" />
                </ListItemButton>
              ))}
            </List>
          </Card>
        </>
      )}
    </Stack>
  )
}
