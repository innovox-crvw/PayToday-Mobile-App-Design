import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
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

type MeUser = { email: string; fullName?: string | null }

export function OnboardingCompleteProfilePage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefix = safePrefix(pathname)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])

  const [sessionUser, setSessionUser] = useState<MeUser | null>(null)
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/auth/me')
        if (cancelled) return
        if (!res.ok) {
          navigate(`${prefix}/onboarding/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
          return
        }
        const data = await readResponseJson<{ user: MeUser }>(res)
        setSessionUser(data.user)
        setFullName((data.user.fullName ?? '').toString())
      } catch {
        navigate(`${prefix}/onboarding/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, prefix, returnTo])

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      await fetchCsrfToken()
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName }),
      })
      const data = await readResponseJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok) {
        setError(data.error ?? 'Could not save profile')
        return
      }
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
      navigate(`${prefix}/onboarding/permissions?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingShell title="Let’s complete your profile" subtitle="Update your details to continue.">
      {error ? (
        <Alert
          severity="error"
          role="alert"
          sx={{
            bgcolor: 'rgba(0,0,0,0.22)',
            color: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(255,255,255,0.16)',
            '& .MuiAlert-icon': { color: 'rgba(255,255,255,0.88)' },
          }}
        >
          {error}
        </Alert>
      ) : null}

      <Stack spacing={1.75} sx={{ mt: 0.5 }}>
        <TextField
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          fullWidth
          variant="standard"
          InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.78)' } }}
          InputProps={{ sx: { color: '#fff' } }}
          sx={{ '& .MuiInput-underline:before': { borderBottomColor: 'rgba(255,255,255,0.35)' } }}
        />
        <TextField
          label="Email address"
          value={sessionUser?.email ?? ''}
          fullWidth
          disabled
          variant="standard"
          InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.78)' } }}
          InputProps={{ sx: { color: 'rgba(255,255,255,0.92)' } }}
          sx={{
            '& .MuiInputBase-root:before': { borderBottomColor: 'rgba(255,255,255,0.22)' },
            '& .MuiInputBase-root.Mui-disabled:before': { borderBottomStyle: 'solid' },
          }}
        />
      </Stack>

      <Button
        variant="contained"
        size="large"
        onClick={submit}
        disabled={submitting || !fullName.trim()}
        sx={{
          borderRadius: 999,
          fontWeight: 900,
          py: 1.15,
          mt: 1,
          bgcolor: 'rgba(34, 211, 238, 0.95)',
          color: 'rgba(10, 10, 40, 0.92)',
          '&:hover': { bgcolor: 'rgba(34, 211, 238, 1)' },
        }}
      >
        Update
      </Button>

      <Button
        variant="text"
        onClick={() => navigate(`${prefix}${returnTo}`, { replace: true })}
        sx={{ fontWeight: 850, color: 'rgba(255,255,255,0.78)', alignSelf: 'center', mt: 0.5 }}
      >
        Do this later
      </Button>
    </OnboardingShell>
  )
}

