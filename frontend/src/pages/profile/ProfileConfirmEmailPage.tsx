import { useEffect, useState } from 'react'
import { useSearchParams, Link as RouterLink } from 'react-router-dom'
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { WalletSubheader } from '../wallet/WalletSubheader'
import { useStorePathPrefix } from './profilePaths'
import { apiFetch } from '../../api/client'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'

export function ProfileConfirmEmailPage() {
  const prefix = useStorePathPrefix()
  const profilePath = prefix ? `${prefix}/profile/personal` : '/profile/personal'
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('err')
      setMessage('Missing verification token. Open the link from your email, or paste the full URL including ?token=…')
      return
    }
    let cancelled = false
    void (async () => {
      setStatus('loading')
      try {
        const res = await apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
        const data = (await res.json()) as { error?: string; message?: string }
        if (cancelled) return
        if (!res.ok) {
          setStatus('err')
          setMessage(data.error ?? 'Verification failed')
          return
        }
        setStatus('ok')
        setMessage(data.message ?? 'Your email is verified.')
        window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      } catch (e) {
        if (!cancelled) {
          setStatus('err')
          setMessage(e instanceof Error ? e.message : 'Request failed')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', pb: 4 }}>
      <WalletSubheader title="Confirm email" />
      {status === 'loading' ? (
        <Stack alignItems="center" py={4}>
          <CircularProgress size={36} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Verifying…
          </Typography>
        </Stack>
      ) : null}
      {status === 'ok' ? (
        <Alert severity="success">
          {message}
          <Button component={RouterLink} to={profilePath} sx={{ mt: 1, display: 'block' }} variant="text">
            Back to personal details
          </Button>
        </Alert>
      ) : null}
      {status === 'err' && message ? <Alert severity="error">{message}</Alert> : null}
      {status === 'idle' && !token ? <Typography color="text.secondary">No token in this link.</Typography> : null}
    </Stack>
  )
}
