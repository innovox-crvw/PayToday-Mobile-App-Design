import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Stack, Typography } from '@mui/material'
import { apiFetch, fetchCsrfToken, readResponseJson } from '../../api/client'
import { PKCE_VERIFIER_STORAGE_KEY } from '../../lib/oauthPkce'
import { SESSION_CHANGED_EVENT } from '../../hooks/useAuthMe'

export function KeycloakCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathPrefix = pathname.startsWith('/embed') ? '/embed' : ''
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const err = searchParams.get('error_description') ?? searchParams.get('error')
    if (err) {
      setMsg(typeof err === 'string' ? err : 'Sign-in was cancelled or failed.')
      return
    }
    if (!code || !state) {
      setMsg('Missing authorization code. Start sign-in again from the login page.')
      return
    }
    const redirectUri = `${window.location.origin}${pathname}`
    let verifier: string | null = null
    try {
      verifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    if (!verifier) {
      setMsg('Missing PKCE verifier (session). Start sign-in again.')
      return
    }

    void (async () => {
      try {
        await fetchCsrfToken()
        const res = await apiFetch('/api/auth/keycloak/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state, redirect_uri: redirectUri, code_verifier: verifier }),
        })
        const data = await readResponseJson<{ ok?: boolean; error?: string; next?: string }>(res)
        try {
          sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY)
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          setMsg(data.error ?? 'Keycloak sign-in failed')
          return
        }
        const defaultNext = pathname.includes('/onboarding/keycloak/callback')
          ? `${pathPrefix}/onboarding/complete-profile`
          : '/account'
        let next =
          typeof data.next === 'string' && data.next.startsWith('/') && !data.next.startsWith('//')
            ? data.next
            : defaultNext
        if (pathname.includes('/admin/')) {
          next = next.startsWith('/admin') ? next : '/admin'
        }
        window.dispatchEvent(new Event('pt-cart-updated'))
        window.dispatchEvent(new Event(SESSION_CHANGED_EVENT))
        navigate(`${pathPrefix}${next}`, { replace: true })
      } catch (e) {
        setMsg(e instanceof Error ? e.message : 'Keycloak sign-in failed')
      }
    })()
  }, [navigate, pathname, pathPrefix, searchParams])

  if (msg) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', py: 4, px: 2 }}>
        <Typography variant="h5" fontWeight={800}>
          Sign in
        </Typography>
        <Alert severity="error">{msg}</Alert>
      </Stack>
    )
  }

  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
      <Typography color="text.secondary">Completing sign-in…</Typography>
    </Stack>
  )
}
