import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { apiUrl } from '../../lib/apiOrigin'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'
import { useAuthMethods } from '../../hooks/useAuthMethods'
import { SIGNIN_PAGE_BACKDROP, SURFACE_SHADOW } from '../../theme/branding'

type Method = 'local' | 'paytoday'

function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/admin')) return '/admin'
  if (raw.startsWith('/admin/login')) return '/admin'
  return raw
}

function isStaffRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'ops' || role === 'fulfillment'
}

type ApiError = {
  error?: string
  code?: string
}

export function AdminLoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])
  const needStaff = searchParams.get('needStaff') === '1'

  const { paytodaySignInEnabled, loaded: methodsLoaded } = useAuthMethods()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [signInMethod, setSignInMethod] = useState<Method>('local')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [paytodayForgotUrl, setPaytodayForgotUrl] = useState<string | null>(null)

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

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (cancelled || !res.ok) return
        const data = await readResponseJson<{ user?: { role?: string } }>(res)
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

  async function submit() {
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
      const data = await readResponseJson<ApiError & { ok?: boolean; user?: { role?: string } }>(res)
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
          setError("PayToday sign-in isn't available right now. Try again later or use your staff password.")
          return
        }
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

  const paytodayDisabled = !paytodaySignInEnabled
  const paytodayHint =
    signInMethod === 'paytoday' && methodsLoaded && paytodayDisabled
      ? "PayToday sign-in isn't available right now. Use your staff password instead."
      : null

  const passwordAdornment = (
    <InputAdornment position="end">
      <IconButton
        edge="end"
        onClick={() => setShowPassword((v) => !v)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        size="small"
      >
        {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
      </IconButton>
    </InputAdornment>
  )

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: SIGNIN_PAGE_BACKDROP,
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
          boxShadow: SURFACE_SHADOW,
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
            Operations portal — sign in with an <strong>admin</strong>, <strong>ops</strong>, or{' '}
            <strong>fulfillment</strong> account. Customer storefront accounts cannot access this area.
          </Typography>

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
          {notice ? (
            <Alert severity="info" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          ) : null}

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={signInMethod}
              onChange={(_, v: Method) => {
                setSignInMethod(v)
                setError(null)
                setNotice(null)
              }}
              variant="fullWidth"
            >
              <Tab value="local" label="Staff password" />
              <Tab
                value="paytoday"
                disabled={paytodayDisabled}
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
                    <span>PayToday staff</span>
                    {methodsLoaded && paytodayDisabled ? (
                      <Chip label="Unavailable" size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                    ) : null}
                  </Stack>
                }
              />
            </Tabs>
          </Box>

          {paytodayHint ? <Alert severity="info">{paytodayHint}</Alert> : null}

          <Stack
            component="form"
            spacing={2}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <TextField
              label="Work email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
              autoComplete="username"
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
              autoComplete="current-password"
              InputProps={{ endAdornment: passwordAdornment }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting || (signInMethod === 'paytoday' && paytodayDisabled)}
              sx={{ py: 1.25, fontWeight: 700 }}
            >
              {submitting ? (
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                  <CircularProgress size={18} thickness={5} sx={{ color: 'common.white' }} />
                  <span>{signInMethod === 'paytoday' ? 'Verifying with PayToday…' : 'Signing in…'}</span>
                </Stack>
              ) : (
                'Sign in to admin'
              )}
            </Button>

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              {signInMethod === 'paytoday' && paytodayForgotUrl ? (
                <Button
                  component="a"
                  href={paytodayForgotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="small"
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Forgot password (PayToday)
                </Button>
              ) : signInMethod === 'local' ? (
                <Button
                  component={RouterLink}
                  to="/forgot-password"
                  size="small"
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Forgot password
                </Button>
              ) : (
                <Box />
              )}
              <Button component={RouterLink} to="/" variant="text" color="inherit" size="small" sx={{ fontWeight: 600 }}>
                ← Back to storefront
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  )
}
