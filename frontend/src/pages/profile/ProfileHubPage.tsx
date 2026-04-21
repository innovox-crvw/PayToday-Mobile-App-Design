import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
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
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'

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
  const onboardingSignInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile`)}`
  const { user, loading, refresh } = useAuthMe()
  const [loggingOut, setLoggingOut] = useState(false)
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (user?.fullName != null) setFullName(user.fullName || '')
  }, [user?.fullName, user?.sub])

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

  async function saveDisplayName() {
    if (!user) return
    setProfileMsg(null)
    setSavingProfile(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setProfileMsg({ text: data.error ?? 'Could not save', severity: 'error' })
        return
      }
      setProfileMsg({ text: 'Display name saved.', severity: 'success' })
      await refresh()
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setProfileMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ maxWidth: { xs: 480, md: 560 }, mx: 'auto', pb: { xs: 2, md: 4 } }}>
      <WalletSubheader title="My account" />
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.55, px: 1, mt: -1.5 }}>
        Sign-in, your store display name, and profile settings — all in one place.
      </Typography>

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
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" justifyContent="center">
              <Typography variant="h6" fontWeight={800} textAlign="center">
                {displayName}
              </Typography>
              {user.role && user.role !== 'customer' ? (
                <Chip label={user.role} size="small" sx={{ height: 24, fontWeight: 600, textTransform: 'capitalize' }} />
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {user.email}
            </Typography>
          </Stack>

          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
            <CardContent sx={{ py: 2.5, px: 2.25 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>
                Store display name
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.55 }}>
                This is how your name appears on orders and receipts. Detailed contact info is under{' '}
                <RouterLink to={`${base}/personal`}>My personal details</RouterLink>.
              </Typography>
              <Stack spacing={2}>
                <TextField label="Display name" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth />
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  In-app alerts are in{' '}
                  <RouterLink to={`${prefix}/notifications`}>Notifications</RouterLink>. Email vs in-app preferences are under{' '}
                  <RouterLink to={`${base}/settings`}>Settings</RouterLink>.
                </Alert>
                <Button
                  variant="contained"
                  onClick={() => void saveDisplayName()}
                  disabled={savingProfile}
                  sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
                >
                  {savingProfile ? 'Saving…' : 'Save display name'}
                </Button>
                {profileMsg ? (
                  <Alert severity={profileMsg.severity} onClose={() => setProfileMsg(null)}>
                    {profileMsg.text}
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

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
