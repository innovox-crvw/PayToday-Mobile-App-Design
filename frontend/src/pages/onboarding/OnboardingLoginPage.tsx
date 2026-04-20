import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { useAuthMethods } from '../../hooks/useAuthMethods'
import { OnboardingShell } from './OnboardingShell'

type Mode = 'signin' | 'register'
type Method = 'local' | 'paytoday'

function safePrefix(pathname: string): string {
  return pathname.startsWith('/embed') ? '/embed' : ''
}

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/shop'
  if (raw.startsWith('/admin')) return '/shop'
  if (raw.startsWith('/onboarding')) return '/shop'
  return raw
}

const TEAL_CTA = {
  borderRadius: 999,
  fontWeight: 900,
  py: 1.25,
  fontSize: '1rem',
  bgcolor: 'rgba(34, 211, 238, 0.95)',
  color: 'rgba(10, 10, 40, 0.92)',
  textTransform: 'none' as const,
  boxShadow: '0 12px 32px rgba(34, 211, 238, 0.22)',
  '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)', boxShadow: '0 12px 32px rgba(34, 211, 238, 0.3)' },
  '&.Mui-disabled': { bgcolor: 'rgba(34, 211, 238, 0.35)', color: 'rgba(10, 10, 40, 0.5)', boxShadow: 'none' },
}

const PILL_FRAME = {
  p: 0.45,
  borderRadius: 999,
  bgcolor: 'rgba(0,0,0,0.2)',
  border: '1px solid rgba(255,255,255,0.1)',
  display: 'flex',
  width: '100%',
} as const

const PILL_BUTTON_BASE = {
  flex: 1,
  borderRadius: 999,
  py: 0.95,
  fontWeight: 800,
  textTransform: 'none' as const,
  fontSize: '0.875rem',
  minHeight: 40,
}

const PILL_SELECTED = {
  ...PILL_BUTTON_BASE,
  bgcolor: 'rgba(34, 211, 238, 0.92)',
  color: 'rgba(10, 10, 40, 0.92)',
  '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
}

const PILL_UNSELECTED = {
  ...PILL_BUTTON_BASE,
  color: 'rgba(255,255,255,0.7)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
  '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' },
}

const INNER_CARD_SX = {
  borderRadius: 2,
  bgcolor: 'rgba(255,255,255,0.045)',
  border: '1px solid rgba(255,255,255,0.12)',
  p: { xs: 2, sm: 2.25, md: 2.5 },
} as const

const FIELD_LABEL_SX = { color: 'rgba(255,255,255,0.78)' }
const FIELD_INPUT_SX = { color: '#fff' }
const UNDERLINE_SX = {
  '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.32)' },
  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottomColor: 'rgba(255,255,255,0.55)' },
  '& .MuiInput-underline:after': { borderBottomColor: 'rgba(34, 211, 238, 0.95)' },
}

const ALERT_ON_GLASS = {
  bgcolor: 'rgba(0,0,0,0.24)',
  color: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 1.5,
  '& .MuiAlert-icon': { color: 'rgba(255,255,255,0.88)' },
} as const

const TEXT_LINK_SX = {
  fontWeight: 700,
  textTransform: 'none' as const,
  color: 'rgba(255,255,255,0.78)',
  '&:hover': { color: 'rgba(255,255,255,0.95)', bgcolor: 'rgba(255,255,255,0.06)' },
}

type ApiError = {
  error?: string
  code?: string
}

export function OnboardingLoginPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefix = safePrefix(pathname)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])
  const mode: Mode = searchParams.get('mode') === 'register' ? 'register' : 'signin'

  const { paytodaySignInEnabled, localPasswordLoginAllowed, loaded: methodsLoaded, fetchFailed: methodsFetchFailed } =
    useAuthMethods()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signInMethod, setSignInMethod] = useState<Method>('local')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [paytodayForgotUrl, setPaytodayForgotUrl] = useState<string | null>(null)

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
        const res = await fetch(apiUrl('/api/auth/public-config'), { credentials: 'include' })
        if (!res.ok) return
        const data = await readResponseJson<{ paytodayForgotPasswordUrl?: string }>(res)
        if (data.paytodayForgotPasswordUrl) setPaytodayForgotUrl(data.paytodayForgotPasswordUrl)
      } catch {
        /* optional */
      }
    })()
  }, [])

  const loginQuery = `returnTo=${encodeURIComponent(returnTo)}`
  const registerHref = `${prefix}/onboarding/login?mode=register&${loginQuery}`
  const signInHref = `${prefix}/onboarding/login?${loginQuery}`
  const paytodaySignInHref = `${signInHref}&method=paytoday`

  useEffect(() => {
    const methodParam = searchParams.get('method')
    if (mode === 'signin' && methodParam === 'paytoday' && paytodaySignInEnabled) {
      setSignInMethod('paytoday')
    }
  }, [mode, searchParams, paytodaySignInEnabled])

  async function submitLogin() {
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const body =
        signInMethod === 'paytoday'
          ? { email, password, authSource: 'paytoday' as const }
          : { email, password, authSource: 'local' as const }
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readResponseJson<ApiError & { ok?: boolean }>(res)
      if (!res.ok) {
        if (data.code === 'account_locked') {
          setError(
            data.error ?? 'Account temporarily locked due to failed sign-in attempts. Try again later.',
          )
          return
        }
        if (data.code === 'use_paytoday_account') {
          setSignInMethod('paytoday')
          setNotice('This email uses a PayToday account — switched to PayToday sign-in.')
          return
        }
        if (data.code === 'paytoday_login_failed') {
          setError("PayToday sign-in isn't available right now. Try again later or use your store account.")
          return
        }
        setError(data.error ?? 'Sign in failed')
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
    setNotice(null)
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      })
      const data = await readResponseJson<ApiError & { ok?: boolean }>(res)
      if (!res.ok) {
        if (data.code === 'paytoday_account_exists') {
          setError('This email already has a PayToday account. Switch to sign-in and choose PayToday account.')
          return
        }
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

  const paytodayDisabled = !paytodaySignInEnabled
  const paytodayTabHelper =
    mode === 'signin' && signInMethod === 'paytoday' && paytodayDisabled && methodsLoaded && !methodsFetchFailed
      ? "PayToday sign-in isn't available right now. Use your store account below."
      : null

  const registerBlocked = mode === 'register' && !localPasswordLoginAllowed

  return (
    <OnboardingShell
      title={mode === 'register' ? 'Create your account' : 'Welcome back'}
      subtitle={
        mode === 'register'
          ? 'Create a store account to track orders, save addresses, and pay faster.'
          : 'Sign in with your store account or your PayToday account — same secure session.'
      }
    >
      <Stack spacing={{ xs: 2, md: 2.5 }} sx={{ width: '100%', maxWidth: { sm: 460, md: 480 }, mx: 'auto' }}>
        <Box sx={PILL_FRAME}>
          <Button
            component={RouterLink}
            to={signInHref}
            disableElevation
            sx={mode === 'signin' ? PILL_SELECTED : PILL_UNSELECTED}
          >
            Sign in
          </Button>
          <Button
            component={RouterLink}
            to={registerHref}
            disableElevation
            sx={mode === 'register' ? PILL_SELECTED : PILL_UNSELECTED}
          >
            Register
          </Button>
        </Box>

        {error ? (
          <Alert severity="error" role="alert" sx={ALERT_ON_GLASS}>
            {error}
          </Alert>
        ) : null}
        {notice ? (
          <Alert severity="info" role="status" sx={ALERT_ON_GLASS}>
            {notice}
          </Alert>
        ) : null}

        {mode === 'signin' ? (
          <Stack spacing={{ xs: 2, md: 2.25 }}>
            <Box sx={PILL_FRAME}>
              <Button
                type="button"
                onClick={() => {
                  setSignInMethod('local')
                  setError(null)
                  setNotice(null)
                }}
                disableElevation
                sx={signInMethod === 'local' ? PILL_SELECTED : PILL_UNSELECTED}
              >
                Store account
              </Button>
              <Button
                type="button"
                disabled={paytodayDisabled}
                onClick={() => {
                  setSignInMethod('paytoday')
                  setError(null)
                  setNotice(null)
                }}
                disableElevation
                sx={signInMethod === 'paytoday' ? PILL_SELECTED : PILL_UNSELECTED}
              >
                PayToday account
              </Button>
            </Box>

            {paytodayTabHelper ? (
              <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
                {paytodayTabHelper}
              </Typography>
            ) : null}

            <Box
              component="form"
              sx={INNER_CARD_SX}
              onSubmit={(e) => {
                e.preventDefault()
                void submitLogin()
              }}
            >
              <Stack spacing={1.75}>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  fullWidth
                  size="medium"
                  variant="standard"
                  InputLabelProps={{ sx: FIELD_LABEL_SX }}
                  InputProps={{ sx: FIELD_INPUT_SX }}
                  sx={UNDERLINE_SX}
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
                  InputLabelProps={{ sx: FIELD_LABEL_SX }}
                  InputProps={{ sx: FIELD_INPUT_SX, endAdornment: passwordAdornment }}
                  sx={UNDERLINE_SX}
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={
                    submitting ||
                    !email.trim() ||
                    !password ||
                    (signInMethod === 'paytoday' && paytodayDisabled)
                  }
                  sx={{ ...TEAL_CTA, mt: 0.5 }}
                >
                  {submitting ? (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                      <CircularProgress size={18} sx={{ color: 'rgba(10, 10, 40, 0.85)' }} />
                      <span>Signing in…</span>
                    </Stack>
                  ) : (
                    'Log in'
                  )}
                </Button>
              </Stack>
            </Box>

            <Stack alignItems="center" spacing={0.25}>
              {signInMethod === 'paytoday' ? (
                paytodayForgotUrl ? (
                  <Button
                    component="a"
                    href={paytodayForgotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="text"
                    size="small"
                    sx={TEXT_LINK_SX}
                  >
                    Forgot password (PayToday)
                  </Button>
                ) : null
              ) : (
                <Button
                  component={RouterLink}
                  to={`${prefix}/forgot-password`}
                  variant="text"
                  size="small"
                  sx={TEXT_LINK_SX}
                >
                  Forgot password
                </Button>
              )}
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={{ xs: 2, md: 2.25 }}>
            {registerBlocked ? (
              <Alert severity="info" sx={ALERT_ON_GLASS}>
                New store accounts aren't currently allowed. If you have a PayToday account,{' '}
                <RouterLink to={paytodaySignInHref} style={{ color: 'rgba(34, 211, 238, 0.95)', fontWeight: 700 }}>
                  sign in with PayToday
                </RouterLink>
                .
              </Alert>
            ) : null}
            <Box
              component="form"
              sx={INNER_CARD_SX}
              onSubmit={(e) => {
                e.preventDefault()
                if (registerBlocked) return
                void submitRegister()
              }}
            >
              <Stack spacing={1.75}>
                <TextField
                  label="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  fullWidth
                  size="medium"
                  variant="standard"
                  InputLabelProps={{ sx: FIELD_LABEL_SX }}
                  InputProps={{ sx: FIELD_INPUT_SX }}
                  sx={UNDERLINE_SX}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  fullWidth
                  size="medium"
                  variant="standard"
                  InputLabelProps={{ sx: FIELD_LABEL_SX }}
                  InputProps={{ sx: FIELD_INPUT_SX }}
                  sx={UNDERLINE_SX}
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
                  FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.5)', mx: 0 } }}
                  InputLabelProps={{ sx: FIELD_LABEL_SX }}
                  InputProps={{ sx: FIELD_INPUT_SX, endAdornment: passwordAdornment }}
                  sx={UNDERLINE_SX}
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={
                    submitting ||
                    registerBlocked ||
                    !email.trim() ||
                    !password ||
                    fullName.trim().length < 2 ||
                    password.length < 8
                  }
                  sx={{ ...TEAL_CTA, mt: 0.5 }}
                >
                  {submitting ? (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                      <CircularProgress size={18} sx={{ color: 'rgba(10, 10, 40, 0.85)' }} />
                      <span>Creating…</span>
                    </Stack>
                  ) : (
                    'Create account'
                  )}
                </Button>
              </Stack>
            </Box>
            <Typography sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
              Already have a PayToday account?{' '}
              <RouterLink to={paytodaySignInHref} style={{ color: 'rgba(34, 211, 238, 0.95)', fontWeight: 700 }}>
                Sign in with PayToday
              </RouterLink>
              .
            </Typography>
          </Stack>
        )}

        <Box sx={{ textAlign: 'center', pt: { xs: 0.25, md: 0.5 } }}>
          <Button component={RouterLink} to={`${prefix}${returnTo}`} variant="text" size="medium" sx={TEXT_LINK_SX}>
            Continue as guest
          </Button>
        </Box>
      </Stack>
    </OnboardingShell>
  )
}
