import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../lib/apiOrigin'
import type { StoreHoursStatus } from '../lib/storeHours'

const OPEN_FALLBACK: StoreHoursStatus = {
  payTodayMerchantId: 991001,
  configured: false,
  openNow: true,
  hoursSummary: '',
  items: [],
  nextOpenLabel: null,
}

export function useStoreHours(pollMs = 60_000) {
  const [status, setStatus] = useState<StoreHoursStatus>(OPEN_FALLBACK)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/storefront/merchant-hours/status'), { credentials: 'include' })
      if (!res.ok) {
        setStatus(OPEN_FALLBACK)
        return
      }
      const data = (await res.json()) as StoreHoursStatus
      setStatus(data)
    } catch {
      setStatus(OPEN_FALLBACK)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(id)
  }, [refresh, pollMs])

  return { status, loading, refresh }
}
