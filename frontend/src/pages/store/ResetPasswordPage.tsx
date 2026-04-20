import { useState } from 'react'
import { Link as RouterLink, useLocation, useSearchParams } from 'react-router-dom'
import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken } from '../../api/client'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'

export function ResetPasswordPage() {
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const loginPath = `${pathPrefix}/onboarding/login`
  const [searchParams] = useSearchParams()
  const tokenFromUrl = searchParams.get('token')?.trim() ?? ''

  const [token, setToken] = useState(tokenFromUrl)
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function submit() {
    setMsg(null)
    setBusy(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), newPassword, confirmNewPassword: confirm }),
      })
      const data = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) {
        setMsg({ text: data.error ?? 'Reset failed', ok: false })
        return
      }
      setMsg({ text: 'Password updated. You are signed in on this device.', ok: true })
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Failed', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 420, mx: 'auto', py: 4, px: 2 }}>
      <Typography variant="h5" fontWeight={800}>
        Set a new password
      </Typography>
      <TextField label="Reset token" value={token} onChange={(e) => setToken(e.target.value)} fullWidth helperText="Paste the token from your email link." />
      <TextField
        label="New password"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        fullWidth
        autoComplete="new-password"
      />
      <TextField
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        fullWidth
        autoComplete="new-password"
      />
      <Button variant="contained" disabled={busy || !token.trim() || newPassword.length < 8 || newPassword !== confirm} onClick={() => void submit()}>
        {busy ? 'Saving…' : 'Update password'}
      </Button>
      {msg ? <Alert severity={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <Button component={RouterLink} to={loginPath} variant="text">
        Sign in
      </Button>
    </Stack>
  )
}
