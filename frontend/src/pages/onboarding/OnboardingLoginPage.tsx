import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { createPkcePair, PKCE_VERIFIER_STORAGE_KEY } from '../../lib/oauthPkce'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { OnboardingShell } from './OnboardingShell'

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/shop'
  if (raw.startsWith('/admin')) return '/shop'
  if (raw.startsWith('/onboarding')) return '/shop'
  return raw
}

const LOGIN_SECTION_SX = {
  borderRadius: 2,
  bgcolor: 'rgba(255,255,255,0.045)',
  border: '1px solid rgba(255,255,255,0.1)',
  p: { xs: 2, sm: 2.25, md: 2.75 },
} as const

const BTN_TEAL = {
  borderRadius: 2,
  fontWeight: 900,
  py: 1.2,
  px: 2,
  bgcolor: 'rgba(34, 211, 238, 0.95)',
  color: 'rgba(10, 10, 40, 0.92)',
  '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
  '&:disabled': { bgcolor: 'rgba(34, 211, 238, 0.35)', color: 'rgba(10, 10, 40, 0.5)' },
} as const

const BTN_KEYCLOAK_OUTLINE = {
  borderRadius: 2,
  fontWeight: 800,
  py: 1.15,
  borderColor: 'rgba(255,255,255,0.42)',
  color: '#fff',
  '&:hover': { borderColor: 'rgba(255,255,255,0.72)', bgcolor: 'rgba(255,255,255,0.07)' },
  '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.35)' },
} as const

function OrDivider() {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.5 }}>
      <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 1 }} />
      <Typography
        variant="overline"
        sx={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', fontWeight: 700, fontSize: 10 }}
      >
        or
      </Typography>
      <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 1 }} />
    </Stack>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: 'block',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.1em',
        fontWeight: 800,
        fontSize: { xs: 10, md: 11 },
        mb: 0.25,
      }}
    >
      {children}
    </Typography>
  )
}

export function OnboardingLoginPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefix = safePrefix(pathname)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])
  const mode = searchParams.get('mode') === 'register' ? 'register' : 'signin'

  const afterKeycloakLogin = `${prefix}/onboarding/complete-profile?returnTo=${encodeURIComponent(returnTo)}`

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [keycloakEnabled, setKeycloakEnabled] = useState(false)
  const [keycloakOnlyMode, setKeycloakOnlyMode] = useState(false)
  const [ropcLoginEnabled, setRopcLoginEnabled] = useState(false)
  const [localPasswordLoginAllowed, setLocalPasswordLoginAllowed] = useState(true)
  const [paytodayForgotUrl, setPaytodayForgotUrl] = useState<string | null>(null)
  const [signInMethod, setSignInMethod] = useState<'local' | 'paytoday'>('local')
  const [keycloakStatusLoaded, setKeycloakStatusLoaded] = useState(false)
  const [keycloakStatusFetchFailed, setKeycloakStatusFetchFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (cancelled || !res.ok) return
        navigate(`${prefix}/onboarding/complete-profile?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
      } catch {
        /* stay */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, prefix, returnTo])

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/auth/keycloak/status'), { credentials: 'include' })
        setKeycloakStatusLoaded(true)
        if (!res.ok) {
          setKeycloakStatusFetchFailed(true)
          setKeycloakEnabled(false)
          setKeycloakOnlyMode(false)
          return
        }
        const data = await readResponseJson<{
          enabled?: boolean
          keycloakOnly?: boolean
          ropcLoginEnabled?: boolean
          localPasswordLoginAllowed?: boolean
        }>(res)
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
        const data = await readResponseJson<{ paytodayForgotPasswordUrl?: string }>(res)
        if (data.paytodayForgotPasswordUrl) setPaytodayForgotUrl(data.paytodayForgotPasswordUrl)
      } catch {
        /* optional */
      }
    })()
  }, [])

  const keycloakMisconfigured = keycloakOnlyMode && !keycloakEnabled && !localPasswordLoginAllowed
  const keycloakExclusiveUi = keycloakOnlyMode && keycloakEnabled && !localPasswordLoginAllowed

  async function startKeycloakSignIn() {
    setError(null)
    try {
      const { codeVerifier, codeChallenge } = await createPkcePair()
      sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, codeVerifier)
      const redirectUri = `${window.location.origin}${prefix}/onboarding/keycloak/callback`
      const q = new URLSearchParams({
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        after_login: afterKeycloakLogin,
      })
      const res = await fetch(apiUrl(`/api/auth/keycloak/start?${q.toString()}`), { credentials: 'include' })
      const data = await readResponseJson<{ url?: string; error?: string }>(res)
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

  async function submitLogin() {
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
      const data = await readResponseJson<{ ok?: boolean; error?: string; code?: string }>(res)
      if (!res.ok) {
        const hint =
          data.code === 'paytoday_login_failed'
            ? `${data.error ?? 'Sign in failed'} Try “Continue with Keycloak” or confirm Keycloak ROPC env on the API.`
            : (data.error ?? 'Sign in failed')
        setError(hint)
        return
      }
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      navigate(`${prefix}/onboarding/complete-profile?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitRegister() {
    setError(null)
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setError(data.error ?? 'Registration failed')
        return
      }
      window.dispatchEvent(new Event('pt-cart-updated'))
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      navigate(`${prefix}/onboarding/complete-profile?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  const loginQuery = `returnTo=${encodeURIComponent(returnTo)}`
  const registerHref = `${prefix}/onboarding/login?mode=register&${loginQuery}`
  const signInHref = `${prefix}/onboarding/login?${loginQuery}`

  const fieldLabelSx = { color: 'rgba(255,255,255,0.78)' }
  const fieldInputSx = { color: '#fff' }
  const underlineSx = {
    '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.32)' },
    '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottomColor: 'rgba(255,255,255,0.5)' },
    '& .MuiInput-underline:after': { borderBottomColor: 'rgba(34, 211, 238, 0.85)' },
  }

  const passwordAdornment = (
    <InputAdornment position="end">
      <IconButton
        edge="end"
        onClick={() => setShowPassword((v) => !v)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        sx={{ color: 'rgba(255,255,255,0.75)' }}
        size="small"
      >
        {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
      </IconButton>
    </InputAdornment>
  )

  const alertOnGlass = {
    bgcolor: 'rgba(0,0,0,0.22)',
    color: 'rgba(255,255,255,0.92)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 1.5,
    '& .MuiAlert-icon': { color: 'rgba(255,255,255,0.88)' },
  } as const

  const dualColumnSignIn = mode === 'signin' && localPasswordLoginAllowed && !keycloakExclusiveUi
  const hintAlign = { textAlign: { xs: 'center', md: 'left' } } as const

  return (
    <OnboardingShell
      title={mode === 'register' ? 'Create account' : 'Welcome!'}
      subtitle={
        mode === 'register'
          ? 'Create your store profile in a few steps.'
          : keycloakExclusiveUi
            ? 'Sign in with your organization account (Keycloak).'
            : 'Use Keycloak or your email and password — same secure session as the rest of PayToday.'
      }
    >
      {!keycloakMisconfigured ? (
        <Stack
          direction="row"
          sx={{
            p: 0.45,
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.08)',
            alignSelf: { xs: 'stretch', md: 'center' },
            width: { xs: 1, md: 'min(480px, 100%)' },
            maxWidth: { md: 480 },
          }}
        >
          <Button
            component={RouterLink}
            to={signInHref}
            fullWidth
            disableElevation
            sx={{
              borderRadius: 0,
              py: 1,
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '0.9rem',
              ...(mode === 'signin'
                ? { ...BTN_TEAL, borderRadius: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }
                : { color: 'rgba(255,255,255,0.75)', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }),
            }}
          >
            Sign in
          </Button>
          <Button
            component={RouterLink}
            to={registerHref}
            fullWidth
            disableElevation
            sx={{
              borderRadius: 0,
              py: 1,
              fontWeight: 800,
              textTransform: 'none',
              fontSize: '0.9rem',
              ...(mode === 'register'
                ? { ...BTN_TEAL, borderRadius: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }
                : { color: 'rgba(255,255,255,0.75)', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }),
            }}
          >
            Register
          </Button>
        </Stack>
      ) : null}

      {keycloakMisconfigured ? (
        <Stack spacing={2}>
          <Alert severity="error" sx={alertOnGlass}>
            Keycloak-only sign-in is enabled, but Keycloak is not configured and local password login is not allowed. Fix
            API env (<code>KEYCLOAK_ISSUER</code>, <code>KEYCLOAK_CLIENT_ID</code>) or allow local login while you finish
            setup.
          </Alert>
          <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="text" sx={{ fontWeight: 850, color: 'rgba(255,255,255,0.78)' }}>
            Continue as guest
          </Button>
        </Stack>
      ) : null}

      {!keycloakMisconfigured && error ? (
        <Alert severity="error" role="alert" sx={alertOnGlass}>
          {error}
        </Alert>
      ) : null}

      {!keycloakMisconfigured && keycloakExclusiveUi ? (
        <Box sx={LOGIN_SECTION_SX}>
          <Stack spacing={1.75}>
            <Button type="button" variant="contained" size="large" fullWidth onClick={() => void startKeycloakSignIn()} sx={BTN_TEAL}>
              Continue with Keycloak
            </Button>
            <Typography sx={{ color: 'rgba(255,255,255,0.68)', fontSize: { xs: 13, md: 14 }, lineHeight: 1.55, ...hintAlign }}>
              Your profile is created or linked on first successful Keycloak login.
            </Typography>
            <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="text" sx={{ fontWeight: 800, color: 'rgba(255,255,255,0.78)' }}>
              Continue as guest
            </Button>
          </Stack>
        </Box>
      ) : !keycloakMisconfigured ? (
        <Stack spacing={{ xs: 2, md: 2.5 }}>
          {dualColumnSignIn ? (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 0 }} alignItems="stretch">
              <Box sx={{ flex: 1, minWidth: 0, pr: { md: 3 } }}>
                <Box sx={{ ...LOGIN_SECTION_SX, height: { md: '100%' } }}>
                  <SectionLabel>Organization (Keycloak)</SectionLabel>
                  <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: { xs: 12, md: 13 }, lineHeight: 1.5, mb: 1.5, ...hintAlign }}>
                    Best for work or SSO accounts. Opens your identity provider in the same browser.
                  </Typography>
                  <Stack spacing={1.35}>
                    <Button
                      type="button"
                      variant="outlined"
                      size="large"
                      fullWidth
                      disabled={!keycloakEnabled}
                      onClick={() => void startKeycloakSignIn()}
                      sx={BTN_KEYCLOAK_OUTLINE}
                    >
                      Continue with Keycloak
                    </Button>
                    {!keycloakStatusLoaded ? (
                      <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: { xs: 12, md: 13 }, ...hintAlign }}>
                        Checking Keycloak status…
                      </Typography>
                    ) : null}
                    {keycloakStatusFetchFailed ? (
                      <Typography sx={{ color: 'rgba(255,200,200,0.92)', fontSize: { xs: 12, md: 13 }, lineHeight: 1.45, ...hintAlign }}>
                        Could not load Keycloak status. Confirm the API is running and CORS includes this origin.
                      </Typography>
                    ) : null}
                    {keycloakStatusLoaded && !keycloakStatusFetchFailed && !keycloakEnabled ? (
                      <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: { xs: 12, md: 13 }, lineHeight: 1.45, ...hintAlign }}>
                        Keycloak OIDC is not configured on the API yet. Add KEYCLOAK_ISSUER and KEYCLOAK_CLIENT_ID, then restart
                        the API.
                      </Typography>
                    ) : null}
                  </Stack>
                </Box>
              </Box>

              <Divider
                orientation="vertical"
                flexItem
                sx={{ display: { xs: 'none', md: 'block' }, borderColor: 'rgba(255,255,255,0.14)', alignSelf: 'stretch', my: 0.5 }}
              />

              <Box sx={{ flex: 1, minWidth: 0, pl: { md: 3 } }}>
                <Box
                  component="form"
                  sx={{ ...LOGIN_SECTION_SX, height: { md: '100%' } }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submitLogin()
                  }}
                >
                  <SectionLabel>Email & password</SectionLabel>
                  <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: { xs: 12, md: 13 }, lineHeight: 1.5, mb: 1.5, ...hintAlign }}>
                    Store account or PayToday password when your operator enables it on the API.
                  </Typography>
                  <Stack spacing={2}>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="medium"
                      value={signInMethod}
                      onChange={(_, v) => {
                        if (v) setSignInMethod(v)
                        setError(null)
                      }}
                      sx={{
                        mt: 0.25,
                        borderRadius: 1.5,
                        overflow: 'hidden',
                        '& .MuiToggleButton-root': {
                          borderRadius: 0,
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: { xs: '0.8rem', md: '0.875rem' },
                          color: 'rgba(255,255,255,0.65)',
                          borderColor: 'rgba(255,255,255,0.18)',
                          py: { xs: 1, md: 1.15 },
                        },
                        '& .Mui-selected': {
                          color: 'rgba(10, 10, 40, 0.92) !important',
                          bgcolor: 'rgba(34, 211, 238, 0.88) !important',
                        },
                      }}
                    >
                      <ToggleButton value="local">Store account</ToggleButton>
                      <ToggleButton value="paytoday" disabled={!ropcLoginEnabled}>
                        PayToday password
                      </ToggleButton>
                    </ToggleButtonGroup>

                    {signInMethod === 'paytoday' && !ropcLoginEnabled ? (
                      <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: { xs: 12, md: 13 }, lineHeight: 1.5, ...hintAlign }}>
                        PayToday password sign-in is not enabled on the server. Use Keycloak, or enable ROPC on the API.
                      </Typography>
                    ) : null}

                    <Stack spacing={1.75}>
                      <TextField
                        label="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        fullWidth
                        size="medium"
                        variant="standard"
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx }}
                        sx={underlineSx}
                      />
                      <TextField
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        fullWidth
                        size="medium"
                        variant="standard"
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx, endAdornment: passwordAdornment }}
                        sx={underlineSx}
                      />
                    </Stack>

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={submitting || !email.trim() || !password || (signInMethod === 'paytoday' && !ropcLoginEnabled)}
                      sx={{ ...BTN_TEAL, py: { xs: 1.2, md: 1.35 } }}
                    >
                      {submitting ? (
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                          <CircularProgress size={20} sx={{ color: 'rgba(10, 10, 40, 0.85)' }} />
                          <span>Signing in…</span>
                        </Stack>
                      ) : (
                        'Log in'
                      )}
                    </Button>

                    <Stack alignItems={{ xs: 'center', md: 'flex-start' }} spacing={0.25}>
                      {signInMethod === 'paytoday' && paytodayForgotUrl ? (
                        <Button
                          component="a"
                          href={paytodayForgotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="text"
                          size="small"
                          sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}
                        >
                          Forgot password (PayToday)
                        </Button>
                      ) : signInMethod === 'local' ? (
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600, ...hintAlign }}>
                          Forgot password? Use PayToday reset when PayToday sign-in is enabled, or contact support.
                        </Typography>
                      ) : null}
                    </Stack>
                  </Stack>
                </Box>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Box sx={LOGIN_SECTION_SX}>
                <SectionLabel>Organization (Keycloak)</SectionLabel>
                <Stack spacing={1.25}>
                  <Button
                    type="button"
                    variant="outlined"
                    size="large"
                    fullWidth
                    disabled={!keycloakEnabled}
                    onClick={() => void startKeycloakSignIn()}
                    sx={BTN_KEYCLOAK_OUTLINE}
                  >
                    Continue with Keycloak
                  </Button>
                  {!keycloakStatusLoaded ? (
                    <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center' }}>
                      Checking Keycloak status…
                    </Typography>
                  ) : null}
                  {keycloakStatusFetchFailed ? (
                    <Typography sx={{ color: 'rgba(255,200,200,0.92)', fontSize: 12, lineHeight: 1.45, textAlign: 'center' }}>
                      Could not load Keycloak status. Confirm the API is running and CORS includes this origin.
                    </Typography>
                  ) : null}
                  {keycloakStatusLoaded && !keycloakStatusFetchFailed && !keycloakEnabled ? (
                    <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 1.45, textAlign: 'center' }}>
                      Keycloak OIDC is not configured on the API yet. Add KEYCLOAK_ISSUER and KEYCLOAK_CLIENT_ID, then restart
                      the API.
                    </Typography>
                  ) : null}
                </Stack>
              </Box>

              {mode === 'signin' && localPasswordLoginAllowed ? <OrDivider /> : null}

              {mode === 'signin' && localPasswordLoginAllowed ? (
                <Box
                  component="form"
                  sx={LOGIN_SECTION_SX}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submitLogin()
                  }}
                >
                  <SectionLabel>Email & password</SectionLabel>
                  <Stack spacing={2}>
                    <ToggleButtonGroup
                      exclusive
                      fullWidth
                      size="medium"
                      value={signInMethod}
                      onChange={(_, v) => {
                        if (v) setSignInMethod(v)
                        setError(null)
                      }}
                      sx={{
                        mt: 0.5,
                        borderRadius: 1.5,
                        overflow: 'hidden',
                        '& .MuiToggleButton-root': {
                          borderRadius: 0,
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: { xs: '0.8rem', md: '0.875rem' },
                          color: 'rgba(255,255,255,0.65)',
                          borderColor: 'rgba(255,255,255,0.18)',
                          py: { xs: 1, md: 1.15 },
                        },
                        '& .Mui-selected': {
                          color: 'rgba(10, 10, 40, 0.92) !important',
                          bgcolor: 'rgba(34, 211, 238, 0.88) !important',
                        },
                      }}
                    >
                      <ToggleButton value="local">Store account</ToggleButton>
                      <ToggleButton value="paytoday" disabled={!ropcLoginEnabled}>
                        PayToday password
                      </ToggleButton>
                    </ToggleButtonGroup>

                    {signInMethod === 'paytoday' && !ropcLoginEnabled ? (
                      <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 1.5, textAlign: 'center' }}>
                        PayToday password sign-in is not enabled on the server. Use Keycloak above, or enable ROPC on the API.
                      </Typography>
                    ) : null}

                    <Stack spacing={1.5}>
                      <TextField
                        label="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        fullWidth
                        size="medium"
                        variant="standard"
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx }}
                        sx={underlineSx}
                      />
                      <TextField
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        fullWidth
                        size="medium"
                        variant="standard"
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx, endAdornment: passwordAdornment }}
                        sx={underlineSx}
                      />
                    </Stack>

                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled={submitting || !email.trim() || !password || (signInMethod === 'paytoday' && !ropcLoginEnabled)}
                      sx={{ ...BTN_TEAL, py: { xs: 1.2, md: 1.35 } }}
                    >
                      {submitting ? (
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                          <CircularProgress size={20} sx={{ color: 'rgba(10, 10, 40, 0.85)' }} />
                          <span>Signing in…</span>
                        </Stack>
                      ) : (
                        'Log in'
                      )}
                    </Button>

                    <Stack alignItems="center" spacing={0.25}>
                      {signInMethod === 'paytoday' && paytodayForgotUrl ? (
                        <Button
                          component="a"
                          href={paytodayForgotUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="text"
                          size="small"
                          sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}
                        >
                          Forgot password (PayToday)
                        </Button>
                      ) : signInMethod === 'local' ? (
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 600, textAlign: 'center' }}>
                          Forgot password? Use PayToday reset when PayToday sign-in is enabled, or contact support.
                        </Typography>
                      ) : null}
                    </Stack>
                  </Stack>
                </Box>
              ) : mode === 'register' ? (
                <Box
                  component="form"
                  sx={LOGIN_SECTION_SX}
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submitRegister()
                  }}
                >
                  <SectionLabel>New account</SectionLabel>
                  {keycloakOnlyMode && !localPasswordLoginAllowed ? (
                    <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.55, mt: 1 }}>
                      Registration with email/password is turned off. Use Continue with Keycloak — your account is created on
                      first sign-in.
                    </Typography>
                  ) : (
                    <Stack spacing={1.75} sx={{ mt: 0.5 }}>
                      <TextField
                        label="Full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        fullWidth
                        size="medium"
                        variant="standard"
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx }}
                        sx={underlineSx}
                      />
                      <TextField
                        label="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        fullWidth
                        size="medium"
                        variant="standard"
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx }}
                        sx={underlineSx}
                      />
                      <TextField
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        fullWidth
                        size="medium"
                        variant="standard"
                        helperText="At least 8 characters."
                        FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.45)', mx: 0 } }}
                        InputLabelProps={{ sx: fieldLabelSx }}
                        InputProps={{ sx: fieldInputSx, endAdornment: passwordAdornment }}
                        sx={underlineSx}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        fullWidth
                        disabled={submitting || !email.trim() || !password || fullName.trim().length < 2 || password.length < 8}
                        sx={{ ...BTN_TEAL, py: { xs: 1.2, md: 1.35 } }}
                      >
                        {submitting ? (
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                            <CircularProgress size={20} sx={{ color: 'rgba(10, 10, 40, 0.85)' }} />
                            <span>Creating…</span>
                          </Stack>
                        ) : (
                          'Create account'
                        )}
                      </Button>
                    </Stack>
                  )}
                </Box>
              ) : null}
            </Stack>
          )}

          <Box sx={{ textAlign: 'center', pt: { xs: 0.25, md: 0.5 } }}>
            <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="text" size="medium" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}>
              Continue as guest
            </Button>
          </Box>
        </Stack>
      ) : null}
    </OnboardingShell>
  )
}
