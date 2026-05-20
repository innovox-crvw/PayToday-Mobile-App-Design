import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/apiOrigin'
import type { HubNavigationTileDto } from '../types/hubNavigation'
import type { HubNavigationTilesResponse } from '../types/hubNavigationTilesApi'

export type HubNavigationKind = 'payments' | 'services'

/** Hub tiles removed from the product UI (may still exist in SQL seed data). */
const HIDDEN_HUB_SLUGS = new Set(['vouchers', 'cashout'])

function visibleHubTiles(items: HubNavigationTileDto[]): HubNavigationTileDto[] {
  return items.filter((t) => !HIDDEN_HUB_SLUGS.has(t.slug))
}

export type HubNavigationTilesState = {
  loading: boolean
  /** When true, `items` came from SQL and should be shown as-is (may be empty). */
  fromDatabase: boolean
  items: HubNavigationTileDto[]
  detail?: string
}

/**
 * Loads hub grid tiles from GET /api/hub/navigation-tiles?kind=…
 * When SQL is off or the request fails, fromDatabase is false — callers should fall back to static tiles.
 */
export function useHubNavigationTiles(kind: HubNavigationKind): HubNavigationTilesState {
  const [state, setState] = useState<HubNavigationTilesState>({
    loading: true,
    fromDatabase: false,
    items: [],
  })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/hub/navigation-tiles?kind=${encodeURIComponent(kind)}`))
        const data = (await res.json()) as HubNavigationTilesResponse
        if (cancelled) return
        const items = visibleHubTiles(Array.isArray(data.items) ? data.items : [])
        const fromDatabase = data.source === 'database'
        setState({
          loading: false,
          fromDatabase,
          items,
          detail: typeof data.detail === 'string' ? data.detail : undefined,
        })
      } catch {
        if (!cancelled) {
          setState({ loading: false, fromDatabase: false, items: [] })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [kind])

  return state
}
