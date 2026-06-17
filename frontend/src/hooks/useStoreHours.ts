import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../lib/apiOrigin'
import type { StoreHoursStatus } from '../lib/storeHours'

function openFallback(merchantId: number): StoreHoursStatus {
  return {
    payTodayMerchantId: merchantId,
    configured: false,
    openNow: true,
    hoursSummary: '',
    items: [],
    nextOpenLabel: null,
    liquorItems: [],
    liquorConfigured: false,
    liquorOpenNow: true,
    liquorHoursSummary: '',
  }
}

export function useStoreHours(merchantId?: number | null, pollMs = 60_000) {
  const mid = merchantId != null && Number.isFinite(merchantId) && merchantId > 0 ? merchantId : null
  const [status, setStatus] = useState<StoreHoursStatus>(() => openFallback(mid ?? 0))
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const q = mid != null ? `?merchantId=${encodeURIComponent(String(mid))}` : ''
      const res = await fetch(apiUrl(`/api/storefront/merchant-hours/status${q}`), { credentials: 'include' })
      if (!res.ok) {
        setStatus(openFallback(mid ?? 0))
        return
      }
      const data = (await res.json()) as StoreHoursStatus
      setStatus(data)
    } catch {
      setStatus(openFallback(mid ?? 0))
    } finally {
      setLoading(false)
    }
  }, [mid])

  useEffect(() => {
    setLoading(true)
    void refresh()
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(id)
  }, [refresh, pollMs])

  return { status, loading, refresh }
}
