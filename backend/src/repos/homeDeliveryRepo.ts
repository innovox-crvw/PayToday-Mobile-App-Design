import type { ConnectionPool } from 'mssql'
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

export async function getHomeDeliveryAreaById(pool: ConnectionPool, areaId: string): Promise<HomeDeliveryArea | null> {
  const areas = await listHomeDeliveryAreas(pool)
  return areas.find((a) => a.id === areaId) ?? null
}

/** Resolve home shipping cents for a given area (falls back to 0 when area unknown). */
export async function shippingCentsForArea(
  pool: ConnectionPool,
  subtotalCents: number,
  areaId: string,
): Promise<number> {
  const area = await getHomeDeliveryAreaById(pool, areaId)
  if (!area) return 0
  if (area.free_above_cents > 0 && subtotalCents >= area.free_above_cents) return 0
  return area.home_flat_cents
}
