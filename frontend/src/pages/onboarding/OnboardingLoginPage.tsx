import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined'
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined'
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { AppBrandLogo } from '../../components/brand/AppBrandLogo'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { useAuthMethods } from '../../hooks/useAuthMethods'
import { APP_DISPLAY_NAME, HEADER_APP_GRADIENT, SIGNIN_PAGE_BACKDROP } from '../../theme/branding'
import { parseEmailString, parseOptionalDisplayName } from '../../lib/inputValidators'

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

const PT_PRIMARY = '#5B21D6'
const PT_PRIMARY_HOVER = '#4C1D95'
const PT_PRIMARY_SOFT = '#EEF2FF'

const OUTLINED_FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
    bgcolor: '#FAFAFA',
    '& fieldset': { borderColor: 'rgba(15, 23, 42, 0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(91, 33, 214, 0.35)' },
    '&.Mui-focused fieldset': { borderColor: PT_PRIMARY, borderWidth: 2 },
  },
} as const

const SEGMENT_TRACK = {
  display: 'flex',
  p: 0.5,
  borderRadius: 999,
  bgcolor: 'rgba(15, 23, 42, 0.06)',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  gap: 0.5,
  width: '100%',
} as const

const PRIMARY_CTA = {
  borderRadius: 2,
  fontWeight: 800,
  py: 1.15,
  fontSize: '0.95rem',
  textTransform: 'none' as const,
  bgcolor: PT_PRIMARY,
  color: '#fff',
  boxShadow: '0 8px 24px rgba(91, 33, 214, 0.28)',
  '&:hover': { bgcolor: PT_PRIMARY_HOVER, boxShadow: '0 10px 28px rgba(76, 29, 149, 0.32)' },
  '&.Mui-disabled': { bgcolor: 'rgba(91, 33, 214, 0.35)', color: 'rgba(255,255,255,0.85)', boxShadow: 'none' },
}

const GHOST_BACK = {
  borderRadius: 2,
  fontWeight: 800,
  py: 1.15,
  fontSize: '0.95rem',
  textTransform: 'none' as const,
  borderColor: PT_PRIMARY,
  color: PT_PRIMARY,
  borderWidth: 2,
  '&:hover': { borderColor: PT_PRIMARY_HOVER, bgcolor: PT_PRIMARY_SOFT },
}

type ApiError = {
  error?: string
  code?: string
}

function SegmentOption({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <ButtonBase
      focusRipple
      disabled={disabled}
      onClick={onClick}
      sx={{
        flex: 1,
        py: { xs: 0.85, sm: 1.1 },
        px: 1,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.75,
        fontWeight: 800,
        fontSize: '0.8rem',
        color: active ? PT_PRIMARY : 'text.secondary',
        bgcolor: active ? '#fff' : 'transparent',
        boxShadow: active ? '0 2px 10px rgba(15,23,42,0.08)' : 'none',
        transition: 'background-color 0.15s, color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      {label}
    </ButtonBase>
  )
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
    const prevHtml = document.documentElement.style.overflow
    const prevBody = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
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
    const emailCheck = parseEmailString(email, 'email')
    if (!emailCheck.ok) {
      setError(emailCheck.message)
      return
    }
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const body =
        signInMethod === 'paytoday'
          ? { email: emailCheck.value, password, authSource: 'paytoday' as const }
          : { email: emailCheck.value, password, authSource: 'local' as const }
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
          setNotice(`This email uses a ${APP_DISPLAY_NAME} account — switched to ${APP_DISPLAY_NAME} sign-in.`)
          return
        }
        if (data.code === 'paytoday_login_failed') {
          setError(`${APP_DISPLAY_NAME} sign-in isn't available right now. Try again later or use your store account.`)
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
    const emailCheck = parseEmailString(email, 'email')
    if (!emailCheck.ok) {
      setError(emailCheck.message)
      return
    }
    const fullNameCheck = parseOptionalDisplayName(fullName, 'fullName')
    if (!fullNameCheck.ok) {
      setError(fullNameCheck.message)
      return
    }
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailCheck.value, password, fullName: fullNameCheck.value }),
      })
      const data = await readResponseJson<ApiError & { ok?: boolean }>(res)
      if (!res.ok) {
        if (data.code === 'paytoday_account_exists') {
          setError(
            `This email already has a ${APP_DISPLAY_NAME} account. Switch to sign-in and choose ${APP_DISPLAY_NAME} account.`,
          )
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
        sx={{ color: 'text.secondary' }}
        size="small"
      >
        {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
      </IconButton>
    </InputAdornment>
  )

  const paytodayDisabled = !paytodaySignInEnabled
  const paytodayTabHelper =
    mode === 'signin' && signInMethod === 'paytoday' && paytodayDisabled && methodsLoaded && !methodsFetchFailed
      ? `${APP_DISPLAY_NAME} sign-in isn't available right now. Use your store account below.`
      : null

  const registerBlocked = mode === 'register' && !localPasswordLoginAllowed

  function goBack() {
    navigate(`${prefix}${returnTo}`)
  }

  const linkInlineSx = {
    fontWeight: 800,
    color: PT_PRIMARY,
    textDecoration: 'none',
    display: 'inline' as const,
    '&:hover': { textDecoration: 'underline' },
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        boxSizing: 'border-box',
        background: SIGNIN_PAGE_BACKDROP,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: { xs: 1.5, sm: 2.5 },
        py: { xs: 1, sm: 2 },
        pt: { xs: 'max(8px, env(safe-area-inset-top))', sm: 2 },
        pb: { xs: 'max(8px, env(safe-area-inset-bottom))', sm: 2 },
        overflow: 'hidden',
        zIndex: (t) => t.zIndex.modal,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: { xs: 10, sm: 14 },
          right: { xs: 14, sm: 18 },
          lineHeight: 0,
          userSelect: 'none',
          '& a': { lineHeight: 0 },
        }}
      >
        <AppBrandLogo to={prefix || '/'} compact wordmarkTone="onLight" />
      </Box>

      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 440,
          maxHeight: {
            xs: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 36px)',
            sm: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 56px)',
          },
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.12), 0 4px 16px rgba(91, 33, 214, 0.08)',
          border: '1px solid rgba(15, 23, 42, 0.06)',
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            background: HEADER_APP_GRADIENT,
            px: { xs: 2, sm: 3 },
            pt: { xs: 2, sm: 2.5 },
            pb: { xs: 1.75, sm: 2.25 },
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <PersonAddAltOutlinedIcon sx={{ fontSize: { xs: 34, sm: 40 }, opacity: 0.95, mb: 0.5 }} />
          <Typography
            variant="h5"
            component="h1"
            fontWeight={900}
            letterSpacing={-0.4}
            sx={{ lineHeight: 1.15, fontSize: { xs: '1.15rem', sm: '1.5rem' } }}
          >
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontSize: { xs: '0.8rem', sm: '0.9rem' },
              fontWeight: 500,
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 1.35,
            }}
          >
            {mode === 'register'
              ? 'Set up your store profile to track orders and pay faster.'
              : `Sign in to your ${APP_DISPLAY_NAME} store account`}
          </Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehaviorY: 'contain',
            WebkitOverflowScrolling: 'touch',
            bgcolor: '#fff',
            px: { xs: 2, sm: 2.75 },
            py: { xs: 1.5, sm: 2.25 },
          }}
        >
          <Stack spacing={{ xs: 1.35, sm: 2 }}>
            <Box sx={SEGMENT_TRACK}>
              <SegmentOption
                active={mode === 'signin'}
                onClick={() => navigate(signInHref)}
                icon={<LoginOutlinedIcon sx={{ fontSize: 18, opacity: 0.9 }} />}
                label="Sign in"
              />
              <SegmentOption
                active={mode === 'register'}
                onClick={() => navigate(registerHref)}
                icon={<PersonAddAltOutlinedIcon sx={{ fontSize: 18, opacity: 0.9 }} />}
                label="Register"
              />
            </Box>

            {error ? <Alert severity="error">{error}</Alert> : null}
            {notice ? <Alert severity="info">{notice}</Alert> : null}

            {mode === 'signin' ? (
              <>
                <Stack spacing={0.5} sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" fontWeight={800} sx={{ color: PT_PRIMARY, letterSpacing: -0.3 }}>
                    Sign in
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Enter your credentials to access your account
                  </Typography>
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ color: PT_PRIMARY }}>
                    Choose sign-in method
                  </Typography>
                  <Box sx={SEGMENT_TRACK}>
                    <SegmentOption
                      active={signInMethod === 'local'}
                      onClick={() => {
                        setSignInMethod('local')
                        setError(null)
                        setNotice(null)
                      }}
                      icon={<StorefrontOutlinedIcon sx={{ fontSize: 18 }} />}
                      label="Store"
                    />
                    <SegmentOption
                      active={signInMethod === 'paytoday'}
                      disabled={paytodayDisabled}
                      onClick={() => {
                        setSignInMethod('paytoday')
                        setError(null)
                        setNotice(null)
                      }}
                      icon={<AccountBalanceWalletOutlinedIcon sx={{ fontSize: 18 }} />}
                      label={APP_DISPLAY_NAME}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                    {paytodayTabHelper ??
                      (signInMethod === 'paytoday'
                        ? `Use your ${APP_DISPLAY_NAME} account email and password (same session as the store).`
                        : 'Use your store email and password.')}
                  </Typography>
                </Stack>

                <Box
                  component="form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void submitLogin()
                  }}
                >
                  <Stack spacing={{ xs: 1.35, sm: 2 }}>
                    <TextField
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      fullWidth
                      required
                      size="small"
                      variant="outlined"
                      sx={OUTLINED_FIELD_SX}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <TextField
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      fullWidth
                      required
                      size="small"
                      variant="outlined"
                      sx={OUTLINED_FIELD_SX}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                          </InputAdornment>
                        ),
                        endAdornment: passwordAdornment,
                      }}
                    />
                    <Stack direction="row" spacing={1.5} sx={{ pt: 0.25 }}>
                      <Button type="button" variant="outlined" fullWidth onClick={goBack} sx={GHOST_BACK}>
                        Back
                      </Button>
                      <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={
                          submitting ||
                          !email.trim() ||
                          !password ||
                          (signInMethod === 'paytoday' && paytodayDisabled)
                        }
                        sx={PRIMARY_CTA}
                      >
                        {submitting ? (
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                            <CircularProgress size={20} sx={{ color: '#fff' }} />
                            <span>Signing in…</span>
                          </Stack>
                        ) : (
                          'Continue'
                        )}
                      </Button>
                    </Stack>
                  </Stack>
                </Box>

                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 0.5 }}>
                  <Divider sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    or
                  </Typography>
                  <Divider sx={{ flex: 1 }} />
                </Stack>

                <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ lineHeight: 1.5 }}>
                  Don&apos;t have an account?{' '}
                  <Typography component={RouterLink} to={registerHref} variant="body2" sx={linkInlineSx}>
                    Sign up here
                  </Typography>
                </Typography>

                <Typography variant="body2" textAlign="center">
                  {signInMethod === 'paytoday' && paytodayForgotUrl ? (
                    <Typography variant="body2" component="span" sx={{ lineHeight: 1.6 }}>
                      <strong>Forgot password ({APP_DISPLAY_NAME}):</strong>{' '}
                      <Link href={paytodayForgotUrl} target="_blank" rel="noopener noreferrer" sx={linkInlineSx}>
                        Reset link
                      </Link>
                    </Typography>
                  ) : signInMethod === 'paytoday' ? null : (
                    <Typography component={RouterLink} to={`${prefix}/forgot-password`} variant="body2" sx={linkInlineSx}>
                      Forgot your password?
                    </Typography>
                  )}
                </Typography>
              </>
            ) : (
              <>
                <Stack spacing={0.5} sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" fontWeight={800} sx={{ color: PT_PRIMARY, letterSpacing: -0.3 }}>
                    Register
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Create your store credentials
                  </Typography>
                </Stack>

                {registerBlocked ? (
                  <Alert severity="info">
                    New store accounts aren&apos;t currently allowed. If you have a {APP_DISPLAY_NAME} account,{' '}
                    <Typography component={RouterLink} to={paytodaySignInHref} variant="body2" sx={linkInlineSx}>
                      sign in with {APP_DISPLAY_NAME}
                    </Typography>
                    .
                  </Alert>
                ) : null}

                <Box
                  component="form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (registerBlocked) return
                    void submitRegister()
                  }}
                >
                  <Stack spacing={{ xs: 1.35, sm: 2 }}>
                    <TextField
                      label="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      fullWidth
                      required
                      size="small"
                      variant="outlined"
                      sx={OUTLINED_FIELD_SX}
                      disabled={registerBlocked}
                    />
                    <TextField
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      fullWidth
                      required
                      size="small"
                      variant="outlined"
                      sx={OUTLINED_FIELD_SX}
                      disabled={registerBlocked}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EmailOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <TextField
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      fullWidth
                      required
                      size="small"
                      variant="outlined"
                      sx={OUTLINED_FIELD_SX}
                      disabled={registerBlocked}
                      helperText="At least 8 characters."
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                          </InputAdornment>
                        ),
                        endAdornment: passwordAdornment,
                      }}
                    />
                    <Stack direction="row" spacing={1.5} sx={{ pt: 0.25 }}>
                      <Button type="button" variant="outlined" fullWidth onClick={goBack} sx={GHOST_BACK}>
                        Back
                      </Button>
                      <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        disabled={
                          submitting ||
                          registerBlocked ||
                          !email.trim() ||
                          !password ||
                          fullName.trim().length < 2 ||
                          password.length < 8
                        }
                        sx={PRIMARY_CTA}
                      >
                        {submitting ? (
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                            <CircularProgress size={20} sx={{ color: '#fff' }} />
                            <span>Creating…</span>
                          </Stack>
                        ) : (
                          'Continue'
                        )}
                      </Button>
                    </Stack>
                  </Stack>
                </Box>

                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Divider sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    or
                  </Typography>
                  <Divider sx={{ flex: 1 }} />
                </Stack>

                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Already have an account?{' '}
                  <Typography component={RouterLink} to={signInHref} variant="body2" sx={linkInlineSx}>
                    Sign in here
                  </Typography>
                </Typography>
              </>
            )}

            <Button
              component={RouterLink}
              to={`${prefix}${returnTo}`}
              variant="text"
              fullWidth
              sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'none', mt: 0.5 }}
            >
              Continue as guest
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  )
}
