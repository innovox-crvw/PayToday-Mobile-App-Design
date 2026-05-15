import type { YangoDemoSlot, YangoDemoZone } from './yangoDeliveryDemo'
import { YANGO_DEMO_ZONES } from './yangoDeliveryDemo'
import { apiUrl } from './apiOrigin'

const FALLBACK_ZONE_COLORS = ['#1976d2', '#00897b', '#6a1b9a', '#e65100', '#5e35b1', '#c62828', '#2e7d32']

function syntheticBounds(index: number, total: number): YangoDemoZone['bounds'] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)))
  const row = Math.floor(index / cols)
  const col = index % cols
  const span = 0.035
  const centerLat = -22.5609 + (row - (cols - 1) / 2) * span * 0.9
  const centerLng = 17.0658 + (col - (cols - 1) / 2) * span * 0.95
  const half = span / 2
  return { south: centerLat - half, north: centerLat + half, west: centerLng - half, east: centerLng + half }
}

function presetsSummary(presets: ApiHomeDeliveryPreset[]): string {
  if (!presets.length) return 'Times confirmed at checkout'
  const p0 = presets.slice().sort((a, b) => a.sort_order - b.sort_order)[0]
  return presets.length > 1 ? `${p0.label} (+${presets.length - 1} more)` : p0.label
}

export type ApiHomeDeliveryPreset = {
  id: string
  sort_order: number
  label: string
  start_time_local: string
  end_time_local: string
  days_of_week: string
  iana_tz: string
}

export type ApiHomeDeliveryArea = {
  id: string
  code: string
  display_name: string
  sort_order?: number
  yango_courier_cents: number
  home_flat_cents: number
  presets: ApiHomeDeliveryPreset[]
}

export function apiPresetsToSlots(presets: ApiHomeDeliveryPreset[]): YangoDemoSlot[] {
  return presets
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => {
      const [shRaw, smRaw] = p.start_time_local.split(':').map((x) => Number(x.trim()))
      const [ehRaw, emRaw] = p.end_time_local.split(':').map((x) => Number(x.trim()))
      return {
        id: p.id,
        label: p.label,
        startHour: Number.isFinite(shRaw) ? shRaw : 8,
        startMinute: Number.isFinite(smRaw) ? smRaw : 0,
        endHour: Number.isFinite(ehRaw) ? ehRaw : 17,
        endMinute: Number.isFinite(emRaw) ? emRaw : 0,
      }
    })
}

/**
 * One map zone per active DB row (`home_delivery_areas`), ordered by `sort_order`.
 * Bounds/colours reuse the built-in Windhoek demo when `code` matches; otherwise synthetic tiles.
 * Built-in zones whose `id` is not in the API response are appended so Windhoek demos stay on the map for testing.
 */
export function mergeApiAreasIntoZones(apiAreas: ApiHomeDeliveryArea[], baseZones: YangoDemoZone[]): YangoDemoZone[] {
  if (!apiAreas.length) return baseZones
  const sorted = [...apiAreas].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const merged = sorted.map((a, i) => {
    const base = baseZones.find((z) => z.id === a.code)
    const slots =
      a.presets.length > 0 ? apiPresetsToSlots(a.presets) : base?.slots ?? [{ id: 'flex', label: 'Standard window', startHour: 9, endHour: 17 }]
    const courier = a.yango_courier_cents > 0 ? a.yango_courier_cents : base?.courierEstimateCents ?? 0
    return {
      id: a.code,
      homeDeliveryAreaId: a.id,
      name: a.display_name,
      description: base?.description ?? `Home delivery area: ${a.display_name}.`,
      courierEstimateCents: courier,
      bounds: base?.bounds ?? syntheticBounds(i, sorted.length),
      fillColor: base?.fillColor ?? FALLBACK_ZONE_COLORS[i % FALLBACK_ZONE_COLORS.length],
      serviceDaysLabel: base?.serviceDaysLabel ?? presetsSummary(a.presets),
      slots,
      ...(base?.demoAddress ? { demoAddress: base.demoAddress } : {}),
    }
  })
  const apiCodes = new Set(sorted.map((a) => a.code))
  const extras = baseZones.filter((z) => !apiCodes.has(z.id))
  return [...merged, ...extras]
}

export async function fetchHomeDeliveryZones(): Promise<YangoDemoZone[]> {
  try {
    const res = await fetch(apiUrl('/api/storefront/home-delivery'), { credentials: 'include' })
    if (!res.ok) return YANGO_DEMO_ZONES
    const d = (await res.json()) as { areas?: ApiHomeDeliveryArea[] }
    if (d.areas?.length) return mergeApiAreasIntoZones(d.areas, YANGO_DEMO_ZONES)
  } catch {
    /* ignore */
  }
  return YANGO_DEMO_ZONES
}
