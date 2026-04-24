import type { HubNavigationTileDto } from '../../types/hubNavigation'

const PEOPLE_FIRST = new Set(['businesses', 'contacts'])

/** Same ordering intent as `ShopUtilityHubRow`: people & business first, then the rest. */
export function orderedPaymentHubTiles(tiles: HubNavigationTileDto[]): HubNavigationTileDto[] {
  const people: HubNavigationTileDto[] = []
  const rest: HubNavigationTileDto[] = []
  for (const t of tiles) {
    if (PEOPLE_FIRST.has(t.slug)) people.push(t)
    else rest.push(t)
  }
  return [...people, ...rest]
}
