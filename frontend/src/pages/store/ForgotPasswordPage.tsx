import { useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'

export function ForgotPasswordPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const loginPath = `${pathPrefix}/onboarding/login`

  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [devToken, setDevToken] = useState<string | null>(null)

  async function submit() {
    setMsg(null)
    setDevToken(null)
    setBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = (await res.json()) as { message?: string; devResetToken?: string; devResetHint?: string }
      if (!res.ok) {
        setMsg(data.message ?? 'Request failed')
        return
      }
      setMsg(data.message ?? 'If an account exists for that email, check your inbox for a reset link.')
      if (data.devResetToken) {
        setDevToken(data.devResetToken)
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 420, mx: 'auto', py: 4, px: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Forgot password
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Enter the email for your store password account. If it exists, you can set a new password from the link we send (or use the dev token below when enabled on the server).
      </Typography>
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        fullWidth
        autoComplete="email"
      />
      <Button variant="contained" disabled={busy || !email.trim()} onClick={() => void submit()}>
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
      {msg ? <Alert severity="info">{msg}</Alert> : null}
      {devToken ? (
        <Alert severity="warning">
          Dev only: open{' '}
          <RouterLink to={`${pathPrefix}/reset-password?token=${encodeURIComponent(devToken)}`}>reset password</RouterLink> with this token.
        </Alert>
      ) : null}
      <Button component={RouterLink} to={loginPath} variant="text">
        Back to sign in
      </Button>
    </Stack>
  )
}
