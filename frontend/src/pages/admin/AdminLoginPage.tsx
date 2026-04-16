import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { createPkcePair, PKCE_VERIFIER_STORAGE_KEY } from '../../lib/oauthPkce'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/admin')) return '/admin'
  if (raw.startsWith('/admin/login')) return '/admin'
  return raw
}

function isStaffRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'ops' || role === 'fulfillment'
}

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])
  const needStaff = searchParams.get('needStaff') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [keycloakEnabled, setKeycloakEnabled] = useState(false)
  const [keycloakOnlyMode, setKeycloakOnlyMode] = useState(false)
  const [ropcLoginEnabled, setRopcLoginEnabled] = useState(false)
  const [localPasswordLoginAllowed, setLocalPasswordLoginAllowed] = useState(true)
  const [signInMethod, setSignInMethod] = useState<'local' | 'paytoday'>('local')
  const [paytodayForgotUrl, setPaytodayForgotUrl] = useState<string | null>(null)
  const [keycloakStatusLoaded, setKeycloakStatusLoaded] = useState(false)
  const [keycloakStatusFetchFailed, setKeycloakStatusFetchFailed] = useState(false)

  useEffect(() => {
    void (async () => {
      setKeycloakStatusLoaded(false)
      setKeycloakStatusFetchFailed(false)
      try {
        const res = await fetch(apiUrl('/api/auth/keycloak/status'), { credentials: 'include' })
        setKeycloakStatusLoaded(true)
        if (!res.ok) {
          setKeycloakStatusFetchFailed(true)
          setKeycloakEnabled(false)
          setKeycloakOnlyMode(false)
          return
        }
        const data = (await res.json()) as {
          enabled?: boolean
          keycloakOnly?: boolean
          ropcLoginEnabled?: boolean
          localPasswordLoginAllowed?: boolean
        }
        setKeycloakEnabled(Boolean(data.enabled))
        setKeycloakOnlyMode(Boolean(data.keycloakOnly))
        setRopcLoginEnabled(Boolean(data.ropcLoginEnabled))
        setLocalPasswordLoginAllowed(data.localPasswordLoginAllowed !== false)
      } catch {
        setKeycloakStatusLoaded(true)
        setKeycloakStatusFetchFailed(true)
        setKeycloakEnabled(false)
        setKeycloakOnlyMode(false)
        setRopcLoginEnabled(false)
        setLocalPasswordLoginAllowed(true)
      }
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/auth/public-config'), { credentials: 'include' })
        if (!res.ok) return
        const data = (await res.json()) as { paytodayForgotPasswordUrl?: string }
        if (data.paytodayForgotPasswordUrl) setPaytodayForgotUrl(data.paytodayForgotPasswordUrl)
      } catch {
        /* optional */
      }
    })()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (cancelled || !res.ok) return
        const data = (await res.json()) as { user?: { role?: string } }
        if (isStaffRole(data.user?.role)) {
          navigate(returnTo, { replace: true })
        }
      } catch {
        /* stay on login */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, returnTo])

  async function startKeycloakAdminSignIn() {
    setError(null)
    try {
      const { codeVerifier, codeChallenge } = await createPkcePair()
      sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, codeVerifier)
      const redirectUri = `${window.location.origin}/admin/login/keycloak/callback`
      const q = new URLSearchParams({
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        after_login: returnTo,
      })
      const res = await fetch(apiUrl(`/api/auth/keycloak/start?${q.toString()}`), { credentials: 'include' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Could not start Keycloak sign-in')
        return
      }
      if (data.url) window.location.href = data.url
      else setError('Keycloak did not return a redirect URL.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Keycloak sign-in failed')
    }
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const body =
        signInMethod === 'paytoday'
          ? { email, password, authSource: 'paytoday' as const }
          : { email, password }
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        user?: { role?: string }
      }
      if (!res.ok) {
        setError(data.error ?? 'Sign in failed')
        return
      }
      const role = data.user?.role
      if (!isStaffRole(role)) {
        try {
          await fetchCsrfToken()
          await apiFetch('/api/auth/logout', { method: 'POST' })
        } catch {
          /* ignore */
        }
        setError('This account is not authorized for admin. Use an admin, operations, or fulfillment login.')
        window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
        return
      }
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      navigate(returnTo, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  const keycloakMisconfigured = keycloakOnlyMode && !keycloakEnabled && !localPasswordLoginAllowed
  const keycloakExclusiveUi = keycloakOnlyMode && keycloakEnabled && !localPasswordLoginAllowed

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 420,
          width: '100%',
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
        }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LockOutlinedIcon color="primary" />
            <Typography variant="h5" fontWeight={800} letterSpacing={-0.3}>
              Admin sign in
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {keycloakExclusiveUi ? (
              <>
                Operations portal — sign in with Keycloak. Staff roles are taken from realm roles when{' '}
                <code>KEYCLOAK_REALM_ROLE_*</code> matches your Keycloak configuration. Customer accounts cannot access
                this area.
              </>
            ) : (
              <>
                Operations portal — use credentials for an <strong>admin</strong>, <strong>ops</strong>, or{' '}
                <strong>fulfillment</strong> user in your database. Customer storefront accounts cannot access this area.
              </>
            )}
          </Typography>

          {keycloakMisconfigured ? (
            <Alert severity="error">
              Keycloak-only mode is on but Keycloak is not configured on the API, and local password login is not
              allowed. Fix <code>KEYCLOAK_ISSUER</code> and <code>KEYCLOAK_CLIENT_ID</code>, set{' '}
              <code>KEYCLOAK_SIGN_IN_ONLY=false</code>, or set <code>KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN=true</code> for dual
              sign-in while you finish Keycloak setup.
            </Alert>
          ) : null}

          {keycloakOnlyMode && !keycloakEnabled && localPasswordLoginAllowed ? (
            <Alert severity="warning">
              Keycloak OIDC is not fully configured; you can still use a database staff password if the API allows it.
              Finish Keycloak env for “Continue with Keycloak” and optional PayToday password grant.
            </Alert>
          ) : null}

          {needStaff ? (
            <Alert severity="warning">
              Sign in with a staff account to open that page. Customer sessions are not allowed here.
            </Alert>
          ) : null}

          {error ? (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          ) : null}

          {!keycloakExclusiveUi ? (
            <Stack spacing={1.25}>
              <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
                Organization sign-in (Keycloak)
              </Typography>
              <Button
                type="button"
                variant="contained"
                size="large"
                fullWidth
                sx={{ py: 1.25, fontWeight: 700 }}
                disabled={!keycloakEnabled}
                onClick={() => void startKeycloakAdminSignIn()}
              >
                Continue with Keycloak
              </Button>
              {!keycloakStatusLoaded ? (
                <Typography variant="caption" color="text.secondary">
                  Checking Keycloak status from the API…
                </Typography>
              ) : null}
              {keycloakStatusFetchFailed ? (
                <Alert severity="warning">
                  Could not load Keycloak status. Check the API is running and <code>VITE_API_BASE_URL</code> / CORS.
                </Alert>
              ) : null}
              {keycloakStatusLoaded && !keycloakStatusFetchFailed && !keycloakEnabled ? (
                <Alert severity="info">
                  Keycloak is not configured on the API yet. Add <code>KEYCLOAK_ISSUER</code> (or{' '}
                  <code>KEYCLOAK_TOKEN_URL</code>) and <code>KEYCLOAK_CLIENT_ID</code> to the API <code>.env</code>,
                  restart the API, then this button will activate. See <code>.env.example</code>.
                </Alert>
              ) : null}
              {keycloakEnabled ? (
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  Staff roles map from realm roles when <code>KEYCLOAK_REALM_ROLE_*</code> matches your Keycloak realm.
                </Typography>
              ) : null}
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                Or use a database staff password
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <Button
                type="button"
                variant="contained"
                size="large"
                fullWidth
                sx={{ py: 1.25, fontWeight: 700 }}
                onClick={() => void startKeycloakAdminSignIn()}
              >
                Continue with Keycloak
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5, display: 'block' }}>
                Staff roles are mapped from Keycloak realm roles when <code>KEYCLOAK_REALM_ROLE_*</code> env vars match
                your realm configuration.
              </Typography>
            </Stack>
          )}

          {!keycloakExclusiveUi ? (
            <Stack spacing={2} component="form" onSubmit={(e) => { e.preventDefault(); void submit() }}>
              {localPasswordLoginAllowed ? (
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={signInMethod}
                  onChange={(_, v) => {
                    if (v) setSignInMethod(v)
                    setError(null)
                  }}
                  sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600 } }}
                >
                  <ToggleButton value="local">Database staff</ToggleButton>
                  <ToggleButton value="paytoday" disabled={!ropcLoginEnabled}>
                    PayToday (Keycloak password)
                  </ToggleButton>
                </ToggleButtonGroup>
              ) : null}
              {signInMethod === 'paytoday' && !ropcLoginEnabled ? (
                <Alert severity="info">
                  PayToday password grant is not enabled or env is incomplete on the API. Use “Continue with Keycloak” or
                  set <code>KEYCLOAK_ROPC_LOGIN_ENABLED</code> and ROPC client variables (see <code>.env.example</code>).
                </Alert>
              ) : null}
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
                autoComplete="username"
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                required
                autoComplete="current-password"
              />
              {signInMethod === 'paytoday' && paytodayForgotUrl ? (
                <Typography variant="caption">
                  <Button
                    component="a"
                    href={paytodayForgotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 600 }}
                  >
                    Forgot password (PayToday)
                  </Button>
                </Typography>
              ) : null}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting || (signInMethod === 'paytoday' && !ropcLoginEnabled)}
                sx={{ py: 1.25, fontWeight: 700 }}
              >
                {submitting
                  ? signInMethod === 'paytoday'
                    ? 'Authenticating with PayToday…'
                    : 'Signing in…'
                  : 'Sign in to admin'}
              </Button>
            </Stack>
          ) : null}

          <Button component={RouterLink} to="/" variant="text" color="inherit" sx={{ fontWeight: 600 }}>
            ← Back to storefront
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
