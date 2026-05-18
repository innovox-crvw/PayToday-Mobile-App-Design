import { useCallback, useEffect, useState } from 'react'
import { apiFetch, readResponseJson } from '../api/client'

/** Dispatched after login, register, logout, or profile save so Profile (and others) can refresh. */
export const SESSION_CHANGED_EVENT = 'pt-session-changed'

export type AuthMeStore = {
  id: string
  slug: string
  name: string
}

export type AuthMeMerchant = {
  payTodayMerchantId: number
  name: string
  slug: string | null
  isPrimary: boolean
}

export type AuthMeUser = {
  sub?: string
  email: string
  role: string
  storeId?: string | null
  store?: AuthMeStore | null
  fullName?: string | null
  notificationChannel?: string
  emailVerified?: boolean
  /** Present when `/api/auth/me` merged a SQL row: local bcrypt vs PayToday (Keycloak-linked). */
  accountKind?: 'local' | 'paytoday'
  dateOfBirth?: string | null
  /** Derived server-side from `dateOfBirth` when liquor gating is enabled. */
  isAdult?: boolean
  /** Linked PayToday merchants (migration 022); empty when none or legacy schema. */
  merchants?: AuthMeMerchant[]
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
