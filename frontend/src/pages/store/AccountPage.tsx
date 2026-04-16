import { useCallback, useEffect, useState } from 'react'
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { SIGNIN_PAGE_BACKDROP, SURFACE_BORDER } from '../../theme/branding'

type MeUser = {
  sub?: string
  email: string
  role: string
  fullName?: string | null
}

type MessageState = { text: string; severity: 'success' | 'error' | 'info' } | null

export function AccountPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const shopPath = `${pathPrefix}/shop`
  const onboardingLogin = `${pathPrefix}/onboarding/login?returnTo=${encodeURIComponent(`${pathPrefix}/account`)}`

  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState<MessageState>(null)
  const [sessionUser, setSessionUser] = useState<MeUser | null>(null)
  const [sessionBootstrap, setSessionBootstrap] = useState(false)

  const loadSessionFromApi = useCallback(async (): Promise<MeUser | null> => {
    try {
      const res = await apiFetch('/api/auth/me')
      if (!res.ok) return null
      const data = await readResponseJson<{ user: MeUser }>(res)
      return data.user
    } catch {
      return null
    }
  }, [])

  const applyLoadedSessionUser = useCallback((user: MeUser | null) => {
    if (!user) {
      setSessionUser(null)
      return
    }
    setSessionUser(user)
    if (user.fullName != null) setFullName(user.fullName || '')
  }, [])

  const refreshSession = useCallback(async () => {
    applyLoadedSessionUser(await loadSessionFromApi())
  }, [applyLoadedSessionUser, loadSessionFromApi])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const user = await loadSessionFromApi()
        if (cancelled) return
        applyLoadedSessionUser(user)
      } finally {
        if (!cancelled) setSessionBootstrap(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyLoadedSessionUser, loadSessionFromApi])

  async function logout() {
    setMessage(null)
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
      setMessage({ text: 'You have been signed out.', severity: 'info' })
      setSessionUser(null)
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Sign out failed', severity: 'error' })
    }
  }

  async function saveProfile() {
    setMessage(null)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Could not save profile', severity: 'error' })
        return
      }
      setMessage({ text: 'Profile updated.', severity: 'success' })
      await refreshSession()
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    }
  }

  const initial =
    sessionUser?.fullName?.trim()?.charAt(0)?.toUpperCase() ??
    sessionUser?.email?.charAt(0)?.toUpperCase() ??
    '?'

  const cardSx = {
    maxWidth: 400,
    width: '100%',
    mx: 'auto',
    p: { xs: 3, sm: 3.5 },
    borderRadius: 3,
    border: '1px solid',
    borderColor: SURFACE_BORDER,
    boxShadow: '0 18px 46px rgba(15, 23, 42, 0.08)',
    bgcolor: 'background.paper',
  }

  if (!sessionBootstrap) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!sessionUser) {
    return <Navigate to={onboardingLogin} replace />
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        width: 1,
        background: SIGNIN_PAGE_BACKDROP,
        py: { xs: 4, sm: 7 },
        px: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Stack spacing={2.5} alignItems="center" sx={{ width: 1, maxWidth: 480 }}>
        <Stack spacing={0.75} alignItems="center" textAlign="center" sx={{ maxWidth: 420, px: 1 }}>
          <Typography variant="h5" component="h1" fontWeight={750} letterSpacing={-0.25} color="text.primary">
            Account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65, fontSize: '0.9rem' }}>
            Manage your profile and sign out. To sign in, use the PayToday login experience.
          </Typography>
        </Stack>

        <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 440 }}>
          <Paper elevation={0} sx={cardSx}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar
                  sx={{
                    width: 56,
                    height: 56,
                    bgcolor: 'primary.main',
                    fontSize: '1.35rem',
                    fontWeight: 700,
                  }}
                >
                  {initial}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700} noWrap title={sessionUser.email}>
                    {sessionUser.fullName?.trim() || sessionUser.email}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap title={sessionUser.email}>
                    {sessionUser.email}
                  </Typography>
                  {sessionUser.role !== 'customer' ? (
                    <Chip
                      label={sessionUser.role}
                      size="small"
                      sx={{ mt: 1, height: 24, fontWeight: 600, textTransform: 'capitalize' }}
                    />
                  ) : null}
                </Box>
              </Stack>
              <Button variant="outlined" color="inherit" onClick={() => void logout()} fullWidth sx={{ fontWeight: 600 }}>
                Sign out
              </Button>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={cardSx}>
            <Typography variant="subtitle2" color="text.secondary" fontWeight={600} sx={{ mb: 1.5 }}>
              Quick links
            </Typography>
            <Stack direction="row" gap={1} flexWrap="wrap">
              <Button component={RouterLink} to={`${pathPrefix}/orders`} variant="outlined" size="small">
                My orders
              </Button>
              <Button component={RouterLink} to={`${pathPrefix}/orders/track`} variant="outlined" size="small">
                Track order
              </Button>
              <Button component={RouterLink} to={`${pathPrefix}/profile`} variant="outlined" size="small">
                Profile hub
              </Button>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={cardSx}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
              Profile & notifications
            </Typography>
            <Stack spacing={2}>
              <TextField label="Display name" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth />
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Order and payment updates are emailed to you. Other store alerts appear in{' '}
                <RouterLink to={`${pathPrefix}/notifications`}>Notifications</RouterLink> in the app.
              </Alert>
              <Button variant="contained" onClick={() => void saveProfile()} sx={{ alignSelf: 'flex-start', fontWeight: 600 }}>
                Save changes
              </Button>
            </Stack>
          </Paper>
        </Stack>

        {message ? (
          <Alert severity={message.severity} sx={{ maxWidth: 440, width: '100%' }} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        ) : null}

        <Button component={RouterLink} to={shopPath} startIcon={<StorefrontOutlinedIcon />} color="inherit" sx={{ fontWeight: 600 }}>
          Continue shopping
        </Button>
      </Stack>
    </Box>
  )
}
