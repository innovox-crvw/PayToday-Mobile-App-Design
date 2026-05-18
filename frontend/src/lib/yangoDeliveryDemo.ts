/**
 * Demo-only Yango-style zones for checkout (Windhoek–centric).
 * Zone `id` values match `home_delivery_areas.code` / `shipping_zones.code` for API merge.
 * Optional `demoAddress` is the canonical demo postal row for that code (checkout presets are built from it).
 * Billing amounts come from the cart API + DB; courier figures here are UI fallbacks.
 */

export type YangoDemoSlot = {
  id: string
  label: string
  /** Local hour 0–23 (Africa/Windhoek-style “shop” demo). */
  startHour: number
  endHour: number
  /** Optional minute offsets (0–59); default 0. Used for DB-driven presets. */
  startMinute?: number
  endMinute?: number
}

/** Example postal rows for checkout / map demos; `presetTitle` is the short toggle label. */
export type YangoDemoZoneDemoAddress = {
  presetTitle: string
  line1: string
  line2?: string
  suburb: string
  city: string
  region?: string
  postalCode?: string
  country?: string
  blurb: string
}

export type YangoDemoZone = {
  id: string
  /** When zones are merged from `/api/storefront/home-delivery`, set to the DB row id for area-based shipping. */
  homeDeliveryAreaId?: string
  name: string
  description: string
  /** NAD cents — shown as “Yango courier estimate (demo)”. */
  courierEstimateCents: number
  /** Rectangle bounds (decimal degrees). */
  bounds: { south: number; west: number; north: number; east: number }
  fillColor: string
  /** Shown under the map. */
  serviceDaysLabel: string
  slots: YangoDemoSlot[]
  /** Present on built-in Windhoek demos — same `id` as `home_delivery_areas.code` / `shipping_zones.code`. */
  demoAddress?: YangoDemoZoneDemoAddress
}

/** Stable codes shared with SQL seeds (`shipping_zones.code`). */
export const YANGO_DEMO_ZONES: YangoDemoZone[] = [
  {
    id: 'whk_south_central',
    name: 'Klein Windhoek · CBD · Academia',
    description: 'Suburbs: Klein Windhoek, City centre, Academia, Suiderhof — lowest delivery band.',
    courierEstimateCents: 6_500,
    bounds: { south: -22.59, west: 17.03, north: -22.54, east: 17.09 },
    fillColor: '#1976d2',
    serviceDaysLabel: 'Mon–Sat · 08:00–20:00',
    slots: [
      { id: 'whk-sc-mid', label: 'Morning 09:00–12:00', startHour: 9, endHour: 12 },
      { id: 'whk-sc-aft', label: 'Afternoon 14:00–17:00', startHour: 14, endHour: 17 },
      { id: 'whk-sc-eve', label: 'Evening 17:00–20:00', startHour: 17, endHour: 20 },
    ],
    demoAddress: {
      presetTitle: 'CBD / Klein Windhoek',
      line1: '123 Independence Avenue',
      line2: 'Unit 4B',
      suburb: 'Klein Windhoek',
      city: 'Windhoek',
      region: 'Khomas',
      postalCode: '10021',
      country: 'NA',
      blurb:
        'Area code whk_south_central — south / central band (CBD, Klein Windhoek, Academia). Checkout demo address; not a real customer.',
    },
  },
  {
    id: 'whk_katutura_khomasdal',
    name: 'Katutura · Khomasdal',
    description: 'Suburbs: Katutura, Khomasdal, Okuryangava — mid delivery band.',
    courierEstimateCents: 8_800,
    bounds: { south: -22.54, west: 17.04, north: -22.48, east: 17.12 },
    fillColor: '#00897b',
    serviceDaysLabel: 'Mon–Sat · 09:00–19:00',
    slots: [
      { id: 'whk-kk-mid', label: 'Late morning 10:00–13:00', startHour: 10, endHour: 13 },
      { id: 'whk-kk-aft', label: 'Afternoon 15:00–18:00', startHour: 15, endHour: 18 },
    ],
    demoAddress: {
      presetTitle: 'Katutura',
      line1: '45 Ngoma Street',
      line2: 'House',
      suburb: 'Katutura',
      city: 'Windhoek',
      region: 'Khomas',
      postalCode: '10028',
      country: 'NA',
      blurb:
        'Area code whk_katutura_khomasdal — Katutura / Khomasdal band. Checkout demo address; not a real customer.',
    },
  },
  {
    id: 'whk_north_east',
    name: 'Olympia · Eros · Pioneers Park',
    description: 'Suburbs: Olympia, Eros, Pioneers Park, Ludwigsdorf — highest delivery band.',
    courierEstimateCents: 10_500,
    bounds: { south: -22.68, west: 17.0, north: -22.58, east: 17.08 },
    fillColor: '#6a1b9a',
    serviceDaysLabel: 'Mon–Fri · 08:00–17:00',
    slots: [
      { id: 'whk-ne-early', label: 'Early 08:00–11:00', startHour: 8, endHour: 11 },
      { id: 'whk-ne-mid', label: 'Midday 11:00–14:00', startHour: 11, endHour: 14 },
    ],
    demoAddress: {
      presetTitle: 'Olympia',
      line1: '7 Mokuti Street',
      suburb: 'Olympia',
      city: 'Windhoek',
      region: 'Khomas',
      postalCode: '10024',
      country: 'NA',
      blurb:
        'Area code whk_north_east — north-east band (Olympia, Eros). Checkout demo address; not a real customer.',
    },
  },
]

const DEFAULT_CENTER = { lat: -22.5609, lng: 17.0658 }

export function defaultYangoDemoPin(): { lat: number; lng: number } {
  return { ...DEFAULT_CENTER }
}

export function zoneCenter(z: YangoDemoZone): { lat: number; lng: number } {
  const { south, west, north, east } = z.bounds
  return { lat: (south + north) / 2, lng: (west + east) / 2 }
}

export function findYangoDemoZoneById(id: string, zones?: YangoDemoZone[]): YangoDemoZone | undefined {
  const list = zones ?? YANGO_DEMO_ZONES
  return list.find((z) => z.id === id)
}

/** Demo postal row for a zone / `home_delivery_areas.code`, if defined on the zone. */
export function getYangoDemoAddressForAreaCode(areaCode: string, zones?: YangoDemoZone[]): YangoDemoZoneDemoAddress | undefined {
  return findYangoDemoZoneById(areaCode, zones)?.demoAddress
}

/**
 * Rough map hint from typed suburb / address (saved or new). Used when the address has no lat/lng.
 * Order: more specific suburbs first so “Olympia” does not fall through to central Windhoek.
 */
export function approxDemoPinForAddressParts(parts: {
  suburb?: string | null
  line1?: string | null
  city?: string | null
}): { lat: number; lng: number } | null {
  const blob = [parts.suburb, parts.line1, parts.city].filter(Boolean).join(' ').toLowerCase()
  if (!blob.trim()) return null

  const matchZone = (zoneId: string): { lat: number; lng: number } | null => {
    const z = findYangoDemoZoneById(zoneId)
    return z ? zoneCenter(z) : null
  }

  const olympiaBand = [
    'olympia',
    'eros',
    'pioneers park',
    'pioneerspark',
    'pionierspark',
    'ludwigsdorf',
    'kleine kuppe',
    'hage heights',
    'luxury hill',
  ]
  for (const k of olympiaBand) {
    if (blob.includes(k)) return matchZone('whk_north_east')
  }

  const katuturaBand = ['katutura', 'khomasdal', 'okuryangava', 'ombili', 'hochland park', 'hochlandpark']
  for (const k of katuturaBand) {
    if (blob.includes(k)) return matchZone('whk_katutura_khomasdal')
  }

  const centralBand = [
    'klein windhoek',
    'cbd',
    'city centre',
    'city center',
    'suiderhof',
    'academia',
    'ausspanplatz',
    'lafrenz',
    'professor',
    'profs',
    'central windhoek',
  ]
  for (const k of centralBand) {
    if (blob.includes(k)) return matchZone('whk_south_central')
  }

  if (blob.includes('windhoek')) return matchZone('whk_south_central')

  return null
}

export function findYangoDemoZoneForPin(lat: number, lng: number, zones?: YangoDemoZone[]): YangoDemoZone | null {
  const list = zones ?? YANGO_DEMO_ZONES
  for (const z of list) {
    const { south, west, north, east } = z.bounds
    if (lat >= south && lat <= north && lng >= west && lng <= east) return z
  }
  return null
}

/** Next N calendar dates as `YYYY-MM-DD` in local timezone. */
export function nextLocalDates(count: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < count; i += 1) {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    const y = x.getFullYear()
    const m = String(x.getMonth() + 1).padStart(2, '0')
    const day = String(x.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

/** Build ISO strings for checkout `deliveryScheduledFor` / `homeDeliveryWindow` from local date + slot hours. */
export function buildCheckoutWindowFromSlot(
  dateYmd: string,
  slot: YangoDemoSlot,
  zoneName: string,
): { deliveryScheduledFor: string; homeWinStart: string; homeWinEnd: string; homeWinLabel: string } {
  const [y, mo, d] = dateYmd.split('-').map(Number) as [number, number, number]
  const sm = slot.startMinute ?? 0
  const em = slot.endMinute ?? 0
  const start = new Date(y, mo - 1, d, slot.startHour, sm, 0, 0)
  const end = new Date(y, mo - 1, d, slot.endHour, em, 0, 0)
  const label = `Yango (demo) · ${zoneName} · ${slot.label}`
  return {
    deliveryScheduledFor: start.toISOString(),
    homeWinStart: start.toISOString(),
    homeWinEnd: end.toISOString(),
    homeWinLabel: label,
  }
}
