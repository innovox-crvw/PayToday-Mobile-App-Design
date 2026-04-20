import { useCallback, useEffect, useState } from 'react'
import { apiFetch, readResponseJson } from '../api/client'

/** Dispatched after login, register, logout, or profile save so Profile (and others) can refresh. */
export const SESSION_CHANGED_EVENT = 'pt-session-changed'

export type AuthMeUser = {
  sub?: string
  email: string
  role: string
  fullName?: string | null
  notificationChannel?: string
  emailVerified?: boolean
}

export function useAuthMe() {
  const [user, setUser] = useState<AuthMeUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/me')
      if (!res.ok) {
        setUser(null)
        return
      }
      const data = await readResponseJson<{ user?: AuthMeUser }>(res)
      setUser(data.user ?? null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onSession = () => void refresh()
    window.addEventListener(SESSION_CHANGED_EVENT, onSession)
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, onSession)
  }, [refresh])

  return { user, loading, refresh }
}
