import type { HubNavigationTileDto } from '../types/hubNavigation'

/** User-visible tab labels — change `essentials` here to switch “Essential top-up” ↔ “Daily essentials”. */
export const SERVICES_HUB_TAB_LABELS = {
  essentials: 'Prepaid services',
  insurance: 'Banking Products',
} as const

const ESSENTIAL_SLUGS = new Set(['airtime', 'water', 'electricity'])
const INSURANCE_SLUGS = new Set(['insurance'])

export type ServicesHubPartition = {
  essentials: HubNavigationTileDto[]
  insurance: HubNavigationTileDto[]
  more: HubNavigationTileDto[]
}

/** Buckets tiles by slug; unknown slugs go to `more`. Preserves input order within each bucket. */
export function partitionServicesHubTiles(tiles: readonly HubNavigationTileDto[]): ServicesHubPartition {
  const essentials: HubNavigationTileDto[] = []
  const insurance: HubNavigationTileDto[] = []
  const more: HubNavigationTileDto[] = []
  for (const t of tiles) {
    const s = t.slug.trim().toLowerCase()
    if (ESSENTIAL_SLUGS.has(s)) essentials.push(t)
    else if (INSURANCE_SLUGS.has(s)) insurance.push(t)
  }
  return { essentials, insurance, more }
}

export const SERVICES_HUB_EMPTY_HINTS = {
  essentials: 'No essential top-up services are available right now.',
  insurance: 'No insurance option is listed yet.',
  more: 'No additional services in this list yet.',
} as const

/** Short labels for bottom navigation (narrow slots). */
export const SERVICES_HUB_NAV_SHORT_LABELS = {
  essentials: 'Top-up',
  insurance: 'Insurance',
} as const

const SERVICE_LEAF_ESSENTIALS = new Set(['airtime', 'water', 'electricity'])

function storeBasePath(pathname: string): string {
  const p = pathname.replace(/^\/embed/, '') || '/'
  return p === '' ? '/' : p
}

/** Storefront paths for services hub nav (include `/embed` when `pathPrefix` is `/embed`). */
export function servicesEssentialsHref(pathPrefix: string): string {
  const p = pathPrefix.replace(/\/$/, '')
  return p ? `${p}/services/essentials` : '/services/essentials'
}

export function servicesInsuranceHref(pathPrefix: string): string {
  const p = pathPrefix.replace(/\/$/, '')
  return p ? `${p}/services/insurance` : '/services/insurance'
}

/** Hub payment demo “back” target when returning to the prepaid services hub. */
export function servicesDemoFlowBackHref(pathPrefix: string): string {
  return servicesEssentialsHref(pathPrefix)
}

/**
 * Which compact bottom-nav slot (4 = essentials, 5 = insurance) is active for a pathname, or null.
 */
export function servicesCompactNavSlot(pathname: string): 4 | 5 | null {
  const p = storeBasePath(pathname)
  if (!p.startsWith('/services')) return null
  if (p === '/services' || p.startsWith('/services/essentials')) return 4
  if (p.startsWith('/services/insurance')) return 5
  const seg = p.slice('/services/'.length).split('/').filter(Boolean)[0] ?? ''
  if (SERVICE_LEAF_ESSENTIALS.has(seg)) return 4
  return null
}
