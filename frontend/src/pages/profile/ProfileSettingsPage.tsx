import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { Link as RouterLink } from 'react-router-dom'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { ProfilePageShell } from '../../components/profile/ProfilePageShell'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { APP_DISPLAY_NAME } from '../../theme/branding'
import { useStorePathPrefix } from './profilePaths'
import { useAuthMe, SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import {
  applyStoredAppPreferences,
  type NotifyDeliveryPreference,
  readNotifyDeliveryChannel,
  readReducedMotion,
  readUiLanguage,
  writeNotifyDeliveryChannel,
  writeReducedMotion,
  writeUiLanguage,
} from '../../lib/appPreferences'

function isNotifyDeliveryPreference(v: string): v is NotifyDeliveryPreference {
  return v === 'email' || v === 'in_app' || v === 'both' || v === 'device'
}

function isServerNotifyChannel(v: string): v is 'email' | 'in_app' | 'both' {
  return v === 'email' || v === 'in_app' || v === 'both'
}

export function ProfileSettingsPage() {
  const prefix = useStorePathPrefix()
  const notificationsPath = prefix ? `${prefix}/notifications` : '/notifications'
  const signInPath = `${prefix}/onboarding/login?returnTo=${encodeURIComponent(`${prefix}/profile/settings`)}`
  const { user, loading: authLoading, refresh: refreshAuth } = useAuthMe()

  const [notifyChannel, setNotifyChannel] = useState<NotifyDeliveryPreference>(() => readNotifyDeliveryChannel())
  const [notifyMsg, setNotifyMsg] = useState<{ text: string; severity: 'success' | 'error' } | null>(null)
  const [notifySaving, setNotifySaving] = useState(false)

  const [uiLanguage, setUiLanguage] = useState('en')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null)
  const [uiLocale, setUiLocale] = useState<string>('en-NA')
  const [localeSaving, setLocaleSaving] = useState(false)

  const [publicCfg, setPublicCfg] = useState<{
    publicStoreUrl?: string
    notifyInboxUrl?: string
    paytodayForgotPasswordUrl?: string
  } | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (user?.notificationChannel && isServerNotifyChannel(user.notificationChannel)) {
      const ch = user.notificationChannel as NotifyDeliveryPreference
      setNotifyChannel(ch)
      writeNotifyDeliveryChannel(ch)
      return
    }
    if (!user) {
      setNotifyChannel(readNotifyDeliveryChannel())
      return
    }
    setNotifyChannel(readNotifyDeliveryChannel())
  }, [authLoading, user])

  useEffect(() => {
    setUiLanguage(readUiLanguage() || 'en')
    setReducedMotion(readReducedMotion())
  }, [])

  useEffect(() => {
    if (user && (user as { ui_locale?: string }).ui_locale) {
      setUiLocale((user as { ui_locale?: string }).ui_locale ?? 'en-NA')
    }
  }, [user])

  async function saveUiLocale(locale: string) {
    setUiLocale(locale)
    if (!user) return
    setLocaleSaving(true)
    try {
      await fetchCsrfToken()
      await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiLocale: locale }),
      })
      setPrefsMsg('Language / locale saved to your account.')
      window.setTimeout(() => setPrefsMsg(null), 2500)
    } catch { /* ignore */ } finally { setLocaleSaving(false) }
  }

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

  async function persistNotifyChannel(next: NotifyDeliveryPreference) {
    setNotifyMsg(null)
    setNotifyChannel(next)
    writeNotifyDeliveryChannel(next)
    const forServer: 'email' | 'in_app' | 'both' = next === 'device' ? 'in_app' : next

    if (!user) {
      setNotifyMsg({ text: 'Preference saved on this device. Sign in to sync it to your account.', severity: 'success' })
      window.setTimeout(() => setNotifyMsg(null), 3200)
      return
    }

    setNotifySaving(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationChannel: forServer }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setNotifyMsg({ text: data.error ?? 'Could not save notification channel', severity: 'error' })
        return
      }
      setNotifyMsg({ text: 'Notification channel saved to your account.', severity: 'success' })
      window.setTimeout(() => setNotifyMsg(null), 2800)
      await refreshAuth()
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setNotifyMsg({ text: e instanceof Error ? e.message : 'Save failed', severity: 'error' })
    } finally {
      setNotifySaving(false)
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
      await refreshAuth()
    }
  }

  return (
    <ProfilePageShell>
      <WalletSubheader title="Settings" />
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        Control how we reach you, how the app feels on this device, and quick links when something looks wrong.
      </Typography>

      {!authLoading && !user ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          <strong>In-app history</strong> loads from the server after you sign in with a store account. Channel choices
          below still apply on this device.{' '}
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
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              When you are signed in with a database-backed store account, your <strong>in-app notification list</strong>{' '}
              is stored on the server (order and payment updates, pickup codes, and similar alerts). Open{' '}
              <Link component={RouterLink} to={notificationsPath} fontWeight={700}>
                Notifications
              </Link>{' '}
              in the header to read them.
            </Typography>

            <FormControl disabled={authLoading || notifySaving}>
              <FormLabel id="notify-channel-label" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                Channel
              </FormLabel>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                {user
                  ? `Saved to your ${APP_DISPLAY_NAME} account (email, in-app feed, or both).`
                  : 'Saved on this device only until you sign in.'}{' '}
                Receipt emails may still send where required.
              </Typography>
              <RadioGroup
                aria-labelledby="notify-channel-label"
                value={notifyChannel}
                onChange={(e) => {
                  const v = e.target.value
                  if (isNotifyDeliveryPreference(v)) void persistNotifyChannel(v)
                }}
              >
                <FormControlLabel value="email" control={<Radio />} label="Email only" />
                <FormControlLabel value="in_app" control={<Radio />} label="In-app only" />
                <FormControlLabel value="both" control={<Radio />} label="Email and in-app" />
                <FormControlLabel
                  value="device"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography component="span" fontWeight={600}>
                        App on this device
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Prefer alerts while using this app here. Push to a native app can be wired later; until then this
                        behaves like in-app first.
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            {notifyMsg ? <Alert severity={notifyMsg.severity}>{notifyMsg.text}</Alert> : null}
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
              Saved in this browser only.
            </Typography>

            <TextField
              select
              label="Language (device)"
              value={uiLanguage}
              onChange={(e) => persistUiLanguage(e.target.value)}
              fullWidth
              helperText="Sets page language on this device only. Full translations coming later."
            >
              <MenuItem value="en">English (default)</MenuItem>
              <MenuItem value="en-ZA">English (South Africa)</MenuItem>
              <MenuItem value="af">Afrikaans (label only)</MenuItem>
            </TextField>
            <TextField
              select
              label="Language / locale (account)"
              value={uiLocale}
              onChange={(e) => { void saveUiLocale(e.target.value) }}
              fullWidth
              disabled={localeSaving || !user}
              helperText={user ? 'Saved to your account.' : 'Sign in to save locale to account.'}
            >
              <MenuItem value="en-NA">English (Namibia)</MenuItem>
              <MenuItem value="af-NA">Afrikaans (Namibia)</MenuItem>
              <MenuItem value="en-ZA">English (South Africa)</MenuItem>
              <MenuItem value="en-US">English (US)</MenuItem>
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
              Sign out here. Device settings stay until you clear site data.
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
                  <strong>Forgot password ({APP_DISPLAY_NAME}):</strong>{' '}
                  <Link href={publicCfg.paytodayForgotPasswordUrl} target="_blank" rel="noopener noreferrer">
                    Reset link
                  </Link>
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </ProfilePageShell>
  )
}
