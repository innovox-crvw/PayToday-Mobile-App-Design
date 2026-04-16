import type { HubNavigationTileDto } from './hubNavigation'

export type HubNavigationTilesSource = 'database' | 'off' | 'error'

export type HubNavigationTilesResponse = {
  source: HubNavigationTilesSource
  items: HubNavigationTileDto[]
  detail?: string
}
