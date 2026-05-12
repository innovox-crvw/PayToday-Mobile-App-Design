import type { YangoDemoSlot, YangoDemoZone } from './yangoDeliveryDemo'
import { YANGO_DEMO_ZONES } from './yangoDeliveryDemo'
import { apiUrl } from './apiOrigin'

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

export function mergeApiAreasIntoZones(apiAreas: ApiHomeDeliveryArea[], baseZones: YangoDemoZone[]): YangoDemoZone[] {
  return baseZones.map((z, i) => {
    const api = apiAreas.find((a) => a.code === z.id) ?? apiAreas[i]
    if (!api) return z
    const slots = api.presets.length > 0 ? apiPresetsToSlots(api.presets) : z.slots
    return {
      ...z,
      homeDeliveryAreaId: api.id,
      name: api.display_name,
      courierEstimateCents: api.yango_courier_cents > 0 ? api.yango_courier_cents : z.courierEstimateCents,
      slots,
    }
  })
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
