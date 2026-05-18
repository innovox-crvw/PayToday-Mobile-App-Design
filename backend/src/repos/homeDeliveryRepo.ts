import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import { columnExists } from '../db/columnExists.js'

export interface HomeDeliveryAreaPreset {
  id: string
  sort_order: number
  label: string
  start_time_local: string
  end_time_local: string
  days_of_week: string
  iana_tz: string
}

export interface HomeDeliveryArea {
  id: string
  code: string
  display_name: string
  sort_order: number
  is_active: boolean
  home_flat_cents: number
  yango_courier_cents: number
  free_above_cents: number
  shipping_zone_id: string | null
  shipping_zone_code: string | null
  presets: HomeDeliveryAreaPreset[]
}

/** When DB `shipping_rates.home_flat_cents` is 0, these Windhoek demo bands still get distinct fees for QA/checkout demos. */
const DEMO_HOME_DELIVERY_FLAT_FALLBACK_CENTS: Readonly<Record<string, number>> = {
  whk_south_central: 6_500,
  whk_katutura_khomasdal: 8_800,
  whk_north_east: 10_500,
}

/** Fixed UUIDs from `047_home_delivery_preferred_times.sql` — used when DB has no row but cart sends area `code` or seed id. */
const DEMO_HOME_AREA_SEED_UUID_BY_CODE: Readonly<Record<string, string>> = {
  whk_south_central: 'A0000001-0001-4000-8000-000000000001',
  whk_katutura_khomasdal: 'A0000001-0002-4000-8000-000000000002',
  whk_north_east: 'A0000001-0003-4000-8000-000000000003',
}

const DEMO_HOME_AREA_DISPLAY_NAME: Readonly<Record<string, string>> = {
  whk_south_central: 'Klein Windhoek · CBD · Academia',
  whk_katutura_khomasdal: 'Katutura · Khomasdal',
  whk_north_east: 'Olympia · Eros · Pioneers Park',
}

function normUuid(s: string): string {
  return s.trim().replace(/[{}]/g, '').toLowerCase()
}

function demoHomeCodeFromRef(ref: string): string | undefined {
  const t = ref.trim()
  if (t in DEMO_HOME_DELIVERY_FLAT_FALLBACK_CENTS) return t
  const n = normUuid(t)
  for (const [code, seed] of Object.entries(DEMO_HOME_AREA_SEED_UUID_BY_CODE)) {
    if (normUuid(seed) === n) return code
  }
  return undefined
}

/**
 * When the DB has no `home_delivery_areas` row (or SQL is unavailable), still resolve the three Windhoek demo bands
 * by `code` or by the migration seed UUID so cart preview and checkout can price home delivery.
 */
export function syntheticDemoHomeAreaFromRef(ref: string): HomeDeliveryArea | null {
  const code = demoHomeCodeFromRef(ref)
  if (!code) return null
  const id = DEMO_HOME_AREA_SEED_UUID_BY_CODE[code]!
  const courier = DEMO_HOME_DELIVERY_FLAT_FALLBACK_CENTS[code] ?? 0
  return {
    id,
    code,
    display_name: DEMO_HOME_AREA_DISPLAY_NAME[code] ?? code,
    sort_order: 0,
    is_active: true,
    home_flat_cents: 0,
    yango_courier_cents: courier,
    free_above_cents: 0,
    shipping_zone_id: null,
    shipping_zone_code: code,
    presets: [],
  }
}

/** Home shipping cents from an already-resolved area (no DB). */
export function homeDeliveryShippingCentsForSubtotal(area: HomeDeliveryArea, subtotalCents: number): number {
  if (area.free_above_cents > 0 && subtotalCents >= area.free_above_cents) return 0
  return homeDeliveryFlatFeeCents(area)
}

/**
 * Listed home delivery fee (cents) before free-shipping rules.
 * Uses DB `home_flat_cents` when set; otherwise demo fallbacks for known `code`s, then `SHIPPING_FLAT_CENTS`.
 */
export function homeDeliveryFlatFeeCents(area: HomeDeliveryArea): number {
  if (area.home_flat_cents > 0) return area.home_flat_cents
  const demo = DEMO_HOME_DELIVERY_FLAT_FALLBACK_CENTS[area.code]
  if (demo != null) return demo
  return env.shippingFlatCents
}

export async function listHomeDeliveryAreas(pool: ConnectionPool): Promise<HomeDeliveryArea[]> {
  const hasHomeFlat = await columnExists(pool, 'shipping_rates.home_flat_cents')
  const hasYango = await columnExists(pool, 'shipping_rates.yango_courier_cents')
  const hasFreeAbove = await columnExists(pool, 'shipping_rates.free_above_cents')
  const flatSql = hasHomeFlat ? 'ISNULL(sr.home_flat_cents, 0) AS home_flat_cents' : 'CAST(0 AS INT) AS home_flat_cents'
  const yangoSql = hasYango ? 'ISNULL(sr.yango_courier_cents, 0) AS yango_courier_cents' : 'CAST(0 AS INT) AS yango_courier_cents'
  const freeSql = hasFreeAbove ? 'ISNULL(sr.free_above_cents, 0) AS free_above_cents' : 'CAST(0 AS INT) AS free_above_cents'
  const areasR = await pool.request().query<{
    id: string
    code: string
    display_name: string
    sort_order: number
    is_active: boolean
    home_flat_cents: number | null
    yango_courier_cents: number | null
    free_above_cents: number | null
    shipping_zone_id: string | null
    shipping_zone_code: string | null
  }>(`
    SELECT
      CAST(a.id AS NVARCHAR(36)) AS id,
      a.code,
      a.display_name,
      a.sort_order,
      CAST(a.is_active AS BIT) AS is_active,
      ${flatSql},
      ${yangoSql},
      ${freeSql},
      CAST(a.shipping_zone_id AS NVARCHAR(36)) AS shipping_zone_id,
      sz.code AS shipping_zone_code
    FROM dbo.home_delivery_areas a
    LEFT JOIN dbo.shipping_zones sz ON sz.id = a.shipping_zone_id
    LEFT JOIN dbo.shipping_rates sr ON sr.shipping_zone_id = a.shipping_zone_id
    WHERE a.is_active = 1
    ORDER BY a.sort_order
  `)

  const presetsR = await pool.request().query<HomeDeliveryAreaPreset & { area_id: string }>(`
    SELECT
      CAST(id AS NVARCHAR(36)) AS id,
      CAST(area_id AS NVARCHAR(36)) AS area_id,
      sort_order,
      label,
      start_time_local,
      end_time_local,
      days_of_week,
      iana_tz
    FROM dbo.home_delivery_area_time_presets
    ORDER BY area_id, sort_order
  `)

  const presetsByArea = new Map<string, HomeDeliveryAreaPreset[]>()
  for (const p of presetsR.recordset) {
    const list = presetsByArea.get(p.area_id) ?? []
    list.push({ id: p.id, sort_order: p.sort_order, label: p.label, start_time_local: p.start_time_local, end_time_local: p.end_time_local, days_of_week: p.days_of_week, iana_tz: p.iana_tz })
    presetsByArea.set(p.area_id, list)
  }

  return areasR.recordset.map((a) => ({
    ...a,
    home_flat_cents: a.home_flat_cents ?? 0,
    yango_courier_cents: a.yango_courier_cents ?? 0,
    free_above_cents: a.free_above_cents ?? 0,
    presets: presetsByArea.get(a.id) ?? [],
  }))
}

export async function getHomeDeliveryAreaById(pool: ConnectionPool, areaRef: string): Promise<HomeDeliveryArea | null> {
  const t = areaRef.trim()
  if (!t) return null
  try {
    const areas = await listHomeDeliveryAreas(pool)
    const byId = areas.find((a) => normUuid(a.id) === normUuid(t))
    if (byId) return byId
    const byCode = areas.find((a) => a.code === t)
    if (byCode) return byCode
  } catch {
    /* missing migrations / DB offline — fall through to synthetic demos */
  }
  return syntheticDemoHomeAreaFromRef(t)
}

/**
 * Resolve home delivery fee (cents) for a given area.
 * Uses {@link homeDeliveryFlatFeeCents} when the order is not eligible for area free shipping.
 */
export async function shippingCentsForArea(
  pool: ConnectionPool,
  subtotalCents: number,
  areaId: string,
): Promise<number> {
  const area = await getHomeDeliveryAreaById(pool, areaId)
  if (!area) return 0
  return homeDeliveryShippingCentsForSubtotal(area, subtotalCents)
}
