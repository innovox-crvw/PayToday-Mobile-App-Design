import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/apiOrigin'
import { readResponseJson } from '../api/client'

/**
 * Whether the API lets the SPA sign in with a PayToday (Keycloak) account and/or a local store password.
 * The SPA never hits Keycloak directly — both toggle targets POST to `/api/auth/login` with `authSource`.
 */
export type AuthMethodAvailability = {
  paytodaySignInEnabled: boolean
  localPasswordLoginAllowed: boolean
  loaded: boolean
  fetchFailed: boolean
}

export function useAuthMethods(): AuthMethodAvailability {
  const [state, setState] = useState<AuthMethodAvailability>({
    paytodaySignInEnabled: false,
    localPasswordLoginAllowed: true,
    loaded: false,
    fetchFailed: false,
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(apiUrl('/api/auth/keycloak/status'), { credentials: 'include' })
        if (cancelled) return
        if (!res.ok) {
          setState({ paytodaySignInEnabled: false, localPasswordLoginAllowed: true, loaded: true, fetchFailed: true })
          return
        }
        const data = await readResponseJson<{
          paytodaySignInEnabled?: boolean
          localPasswordLoginAllowed?: boolean
        }>(res)
        setState({
          paytodaySignInEnabled: Boolean(data.paytodaySignInEnabled),
          localPasswordLoginAllowed: data.localPasswordLoginAllowed !== false,
          loaded: true,
          fetchFailed: false,
        })
      } catch {
        if (cancelled) return
        setState({ paytodaySignInEnabled: false, localPasswordLoginAllowed: true, loaded: true, fetchFailed: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
