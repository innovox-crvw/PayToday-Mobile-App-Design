import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  Divider,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'

type MenuItem = {
  to: string
  label: string
  icon: ReactNode
  description?: string
  authOnly?: boolean
}

const menu: MenuItem[] = [
  { to: 'personal', label: 'Personal', description: 'Name, email, password', icon: <PersonOutlineIcon />, authOnly: true },
  { to: 'addresses', label: 'Addresses', description: 'Delivery addresses', icon: <HomeWorkOutlinedIcon />, authOnly: true },
  { to: 'settings', label: 'Settings', description: 'Alerts & language', icon: <SettingsOutlinedIcon />, authOnly: true },
  { to: 'support', label: 'Support', icon: <SupportAgentOutlinedIcon /> },
  { to: 'legal', label: 'Legal', icon: <GavelOutlinedIcon /> },
  { to: 'delete-account', label: 'Delete account', description: 'Permanent', icon: <DeleteOutlineIcon />, authOnly: true },
  { to: 'feedback', label: 'Feedback', icon: <CampaignOutlinedIcon /> },
]

const ACCOUNT_ROUTES = new Set(['personal', 'addresses', 'settings'])
const HELP_ROUTES = new Set(['support', 'legal', 'feedback'])
const DANGER_ROUTES = new Set(['delete-account'])

function buildMenuGroups(items: MenuItem[]): { label: string; items: MenuItem[] }[] {
  const account = items.filter((i) => ACCOUNT_ROUTES.has(i.to))
  const help = items.filter((i) => HELP_ROUTES.has(i.to))
  const danger = items.filter((i) => DANGER_ROUTES.has(i.to))
  const out: { label: string; items: MenuItem[] }[] = []
  if (account.length) out.push({ label: 'Account', items: account })
  if (help.length) out.push({ label: 'Help', items: help })
  if (danger.length) out.push({ label: 'Danger zone', items: danger })
  return out
}

const hubShellInnerSx = {
  maxWidth: { xs: 'none', sm: 680, md: 720 },
  width: 1,
} as const

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
  const menuGroups = useMemo(() => buildMenuGroups(visibleMenu), [visibleMenu])
  const menuRowCount = useMemo(() => menuGroups.reduce((n, g) => n + g.items.length, 0), [menuGroups])

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
      setProfileMsg({ text: 'Saved.', severity: 'success' })
      await refresh()
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setProfileMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSavingProfile(false)
    }
  }

  function renderMenuCard() {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider', overflow: 'hidden' }}>
        {menuGroups.map((group, gi) => (
          <Fragment key={group.label}>
            {gi > 0 ? <Divider /> : null}
            <Box sx={{ px: 2, pt: 1.75, pb: 0.5 }}>
              <Typography
                variant="overline"
                sx={{ fontWeight: 800, letterSpacing: '0.1em', color: 'text.secondary', fontSize: '0.68rem' }}
              >
                {group.label}
              </Typography>
            </Box>
            <List disablePadding>
              {group.items.map((item, j) => {
                const flatIndex = menuGroups.slice(0, gi).reduce((acc, g) => acc + g.items.length, 0) + j
                const isDelete = item.to === 'delete-account'
                return (
                  <ListItemButton
                    key={item.to}
                    component={RouterLink}
                    to={`${base}/${item.to}`}
                    sx={{
                      py: 1.5,
                      px: 2,
                      borderBottom: flatIndex < menuRowCount - 1 ? 1 : 0,
                      borderColor: 'divider',
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 52 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isDelete ? 'error.main' : 'text.secondary',
                        }}
                      >
                        {item.icon}
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      secondary={item.description}
                      primaryTypographyProps={{
                        fontWeight: 600,
                        color: isDelete ? 'error.main' : 'text.primary',
                      }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { mt: 0.25 } }}
                    />
                    <ChevronRightIcon color="action" />
                  </ListItemButton>
                )
              })}
            </List>
          </Fragment>
        ))}
      </Card>
    )
  }

  return (
    <ProfilePageShell innerSx={hubShellInnerSx}>
      <WalletSubheader title="Account" sx={{ mb: 1.5 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={36} />
        </Box>
      ) : user ? (
        <>
          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
            <CardContent sx={{ py: 2.5, px: { xs: 2, sm: 2.5 } }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ xs: 'center', sm: 'flex-start' }}
                sx={{ mb: 2 }}
              >
                <Avatar
                  sx={{
                    width: { xs: 72, sm: 80 },
                    height: { xs: 72, sm: 80 },
                    bgcolor: 'primary.main',
                    fontSize: '1.75rem',
                    fontWeight: 800,
                  }}
                >
                  {initial || '?'}
                </Avatar>
                <Stack spacing={0.75} alignItems={{ xs: 'center', sm: 'flex-start' }} sx={{ flex: 1, minWidth: 0, textAlign: { xs: 'center', sm: 'left' } }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'center', sm: 'flex-start' }}>
                    <Typography variant="h6" fontWeight={800} component="p" sx={{ m: 0 }}>
                      {displayName}
                    </Typography>
                    {user.role && user.role !== 'customer' ? (
                      <Chip label={user.role} size="small" sx={{ height: 24, fontWeight: 600, textTransform: 'capitalize' }} />
                    ) : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {user.email}
                  </Typography>
                </Stack>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.75 }}>
                Display name
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
                Shown on orders and receipts.{' '}
                <Link component={RouterLink} to={`${base}/personal`} underline="hover" fontWeight={600}>
                  More in Personal
                </Link>
              </Typography>
              <Stack spacing={2}>
                <TextField label="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth />
                <Button
                  variant="contained"
                  onClick={() => void saveDisplayName()}
                  disabled={savingProfile}
                  sx={{ fontWeight: 700, width: { xs: 1, sm: 'auto' }, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                >
                  {savingProfile ? 'Saving…' : 'Save'}
                </Button>
                {profileMsg ? (
                  <Alert severity={profileMsg.severity} onClose={() => setProfileMsg(null)}>
                    {profileMsg.text}
                  </Alert>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          {renderMenuCard()}

          <Box sx={{ pt: 1, display: 'flex', justifyContent: { xs: 'stretch', sm: 'center' } }}>
            <Button
              variant="outlined"
              color="inherit"
              size="large"
              startIcon={<LogoutOutlinedIcon />}
              disabled={loggingOut}
              onClick={() => void logout()}
              sx={{
                fontWeight: 700,
                width: { xs: 1, sm: 'auto' },
                minWidth: { sm: 240 },
                maxWidth: { sm: 400 },
              }}
            >
              {loggingOut ? 'Signing out…' : 'Log out'}
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Card variant="outlined" sx={{ borderRadius: 3, borderColor: 'divider' }}>
            <CardContent sx={{ py: 3, px: { xs: 2, sm: 2.5 } }}>
              <Stack alignItems="center" spacing={2}>
                <Avatar sx={{ width: 72, height: 72, bgcolor: 'action.hover', color: 'text.secondary' }}>
                  <PersonOutlineIcon sx={{ fontSize: 40 }} />
                </Avatar>
                <Typography variant="h6" fontWeight={800} textAlign="center">
                  Not signed in
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 360, lineHeight: 1.5 }}>
                  Sign in for saved details and account-only options.
                </Typography>
                <Button
                  component={RouterLink}
                  to={onboardingSignInPath}
                  variant="contained"
                  size="large"
                  sx={{ fontWeight: 700, width: { xs: 1, sm: 'auto' }, minWidth: { sm: 200 } }}
                >
                  Sign in
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {renderMenuCard()}
        </>
      )}
    </ProfilePageShell>
  )
}
