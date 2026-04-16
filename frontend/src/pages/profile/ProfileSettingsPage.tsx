import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Link as RouterLink } from 'react-router-dom'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl, readApiError } from '../../lib/apiOrigin'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import {
  applyStoredAppPreferences,
  readReducedMotion,
  readUiLanguage,
  writeReducedMotion,
  writeUiLanguage,
} from '../../lib/appPreferences'

type HealthDatabase = 'off' | 'connected' | 'unreachable'

type HealthBody = {
  ok: true
  service: string
  database: HealthDatabase
  databaseError?: string
  sqlHints?: string[]
}

type NotifyChannel = 'email' | 'in_app' | 'both'

function isNotifyChannel(v: string | undefined): v is NotifyChannel {
  return v === 'email' || v === 'in_app' || v === 'both'
}

export function ProfileSettingsPage() {
  const prefix = useStorePathPrefix()
  const signInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile/settings`)}`
  const { user, loading: authLoading, refresh: refreshAuth } = useAuthMe()

  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>('email')
  const [notifyDirty, setNotifyDirty] = useState(false)
  const [savingNotify, setSavingNotify] = useState(false)
  const [notifyMsg, setNotifyMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)

  const [uiLanguage, setUiLanguage] = useState('en')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null)

  const [healthLoading, setHealthLoading] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthBody | null>(null)

  const [publicCfg, setPublicCfg] = useState<{
    publicStoreUrl?: string
    notifyInboxUrl?: string
    paytodayForgotPasswordUrl?: string
  } | null>(null)

  useEffect(() => {
    const ch = user?.notificationChannel
    setNotifyChannel(isNotifyChannel(ch) ? ch : 'email')
    setNotifyDirty(false)
  }, [user?.notificationChannel])

  useEffect(() => {
    setUiLanguage(readUiLanguage() || 'en')
    setReducedMotion(readReducedMotion())
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/auth/public-config'), { credentials: 'include' })
        if (!res.ok) return
        const data = await readResponseJson<{
          publicStoreUrl?: string
          notifyInboxUrl?: string
          paytodayForgotPasswordUrl?: string
        }>(res)
        setPublicCfg(data)
      } catch {
        /* optional */
      }
    })()
  }, [])

  const testDatabase = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(null)
    setHealth(null)
    try {
      const res = await fetch(apiUrl('/api/health'))
      if (!res.ok) {
        setHealthError(await readApiError(res))
        return
      }
      const body = await readResponseJson<HealthBody>(res)
      if (body?.ok !== true || !body.database) {
        setHealthError('Unexpected response from server.')
        return
      }
      setHealth(body)
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      setHealthLoading(false)
    }
  }, [])

  async function saveNotifications() {
    if (!user) return
    setNotifyMsg(null)
    setSavingNotify(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationChannel: notifyChannel }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setNotifyMsg({ text: data.error ?? 'Could not save settings', severity: 'error' })
        return
      }
      setNotifyMsg({ text: 'Notification preference saved.', severity: 'success' })
      setNotifyDirty(false)
      await refreshAuth()
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setNotifyMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setSavingNotify(false)
    }
  }

  function persistUiLanguage(code: string) {
    setUiLanguage(code)
    writeUiLanguage(code === 'en' ? '' : code)
    applyStoredAppPreferences()
    setPrefsMsg('Language preference saved on this device.')
    window.setTimeout(() => setPrefsMsg(null), 2500)
  }

  function persistReducedMotion(on: boolean) {
    setReducedMotion(on)
    writeReducedMotion(on)
    setPrefsMsg(on ? 'Reduced motion is on for this device.' : 'Reduced motion is off.')
    window.setTimeout(() => setPrefsMsg(null), 2500)
  }

  async function signOut() {
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/logout', { method: 'POST' })
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      await refreshAuth()
    } catch {
      /* still refresh */
      await refreshAuth()
    }
  }

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 560, mx: 'auto', pb: 3 }}>
      <WalletSubheader title="Settings" />
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        Control how we reach you, how the app feels on this device, and run quick checks when something looks wrong.
      </Typography>

      {!authLoading && !user ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          Sign in to save notification preferences to your account.{' '}
          <Link component={RouterLink} to={signInPath} fontWeight={700}>
            Sign in
          </Link>
        </Alert>
      ) : null}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <NotificationsActiveOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>
                Notifications
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Stored on your PayToday profile when you are signed in with a database-backed account. In-app messages still
              appear under Notifications in the header.
            </Typography>

            <FormControl disabled={!user || authLoading}>
              <FormLabel id="notify-channel-label" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                Channel
              </FormLabel>
              <RadioGroup
                aria-labelledby="notify-channel-label"
                value={notifyChannel}
                onChange={(e) => {
                  const v = e.target.value
                  if (isNotifyChannel(v)) {
                    setNotifyChannel(v)
                    setNotifyDirty(true)
                    setNotifyMsg(null)
                  }
                }}
              >
                <FormControlLabel value="email" control={<Radio />} label="Email only" />
                <FormControlLabel value="in_app" control={<Radio />} label="In-app only" />
                <FormControlLabel value="both" control={<Radio />} label="Email and in-app" />
              </RadioGroup>
            </FormControl>

            {notifyMsg ? <Alert severity={notifyMsg.severity}>{notifyMsg.text}</Alert> : null}

            <Button
              variant="contained"
              disabled={!user || !notifyDirty || savingNotify}
              onClick={() => void saveNotifications()}
              sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
              startIcon={savingNotify ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {savingNotify ? 'Saving…' : 'Save notification preference'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <TuneOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>
                App on this device
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              These options are saved in your browser only (they follow this device, not your PayToday account).
            </Typography>

            <TextField
              select
              label="Interface language"
              value={uiLanguage}
              onChange={(e) => persistUiLanguage(e.target.value)}
              fullWidth
              helperText="Sets the HTML lang attribute for accessibility. Full translations are not wired yet."
            >
              <MenuItem value="en">English (default)</MenuItem>
              <MenuItem value="en-ZA">English (South Africa)</MenuItem>
              <MenuItem value="af">Afrikaans (label only)</MenuItem>
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={reducedMotion}
                  onChange={(_, on) => persistReducedMotion(on)}
                  inputProps={{ 'aria-label': 'Reduce motion' }}
                />
              }
              label={
                <Box>
                  <Typography fontWeight={700}>Reduce motion</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Shortens animations and transitions on this device.
                  </Typography>
                </Box>
              }
            />

            {prefsMsg ? (
              <Alert severity="success" onClose={() => setPrefsMsg(null)}>
                {prefsMsg}
              </Alert>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <LogoutOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>
                Session
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Sign out on this browser. Your saved device settings above stay until you clear site data.
            </Typography>
            <Button
              variant="outlined"
              color="inherit"
              disabled={!user}
              onClick={() => void signOut()}
              sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
            >
              Sign out
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <InfoOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>
                About & links
              </Typography>
            </Stack>
            <Stack spacing={1}>
              {publicCfg?.publicStoreUrl ? (
                <Typography variant="body2">
                  <strong>Store URL:</strong>{' '}
                  <Link href={publicCfg.publicStoreUrl} target="_blank" rel="noopener noreferrer">
                    {publicCfg.publicStoreUrl}
                  </Link>
                </Typography>
              ) : null}
              {publicCfg?.notifyInboxUrl ? (
                <Typography variant="body2">
                  <strong>Notify inbox:</strong>{' '}
                  <Link href={publicCfg.notifyInboxUrl} target="_blank" rel="noopener noreferrer">
                    Open inbox
                  </Link>
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Notify inbox URL is not configured on the API.
                </Typography>
              )}
              {publicCfg?.paytodayForgotPasswordUrl ? (
                <Typography variant="body2">
                  <strong>Forgot password (PayToday):</strong>{' '}
                  <Link href={publicCfg.paytodayForgotPasswordUrl} target="_blank" rel="noopener noreferrer">
                    Reset link
                  </Link>
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <StorageOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>
                Diagnostics
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Checks whether the PayToday API can reach Microsoft SQL Server ({' '}
              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                GET /api/health
              </Box>
              ).
            </Typography>
            <Button
              variant="contained"
              onClick={testDatabase}
              disabled={healthLoading}
              sx={{ alignSelf: 'flex-start', fontWeight: 700 }}
              startIcon={healthLoading ? <CircularProgress size={18} color="inherit" /> : undefined}
            >
              {healthLoading ? 'Checking…' : 'Test database connection'}
            </Button>

            {healthError ? <Alert severity="error">{healthError}</Alert> : null}

            {health ? (
              <Stack spacing={1.5}>
                {health.database === 'connected' ? (
                  <Alert severity="success">
                    <strong>MS SQL is connected.</strong> The API is using the database.
                  </Alert>
                ) : null}
                {health.database === 'off' ? (
                  <Alert severity="info">
                    <strong>SQL is not configured</strong> (no connection string in{' '}
                    <Box component="span" sx={{ fontFamily: 'monospace' }}>
                      .env
                    </Box>
                    ). The store runs on in-memory demo data.
                  </Alert>
                ) : null}
                {health.database === 'unreachable' ? (
                  <Alert severity="warning">
                    <strong>SQL is configured but the API cannot connect.</strong>
                    {health.databaseError ? (
                      <Typography variant="body2" component="span" display="block" sx={{ mt: 1, fontFamily: 'monospace' }}>
                        {health.databaseError}
                      </Typography>
                    ) : null}
                  </Alert>
                ) : null}

                {health.sqlHints?.length ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 0.5 }}>
                      Hints (development)
                    </Typography>
                    <List dense disablePadding sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 1, py: 0.5 }}>
                      {health.sqlHints.map((hint) => (
                        <ListItem key={hint} disableGutters sx={{ py: 0.5 }}>
                          <ListItemText primary={hint} primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }} />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
