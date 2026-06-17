import { Router } from 'express'
import { columnExists } from '../../db/columnExists.js'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const adminShippingRouter = Router()
adminShippingRouter.use(requireAuth, requireRole('admin', 'ops'))

function noPool(res: import('express').Response) {
  res.status(503).json({ error: 'Database not configured' })
}

/* ── Zones ───────────────────────────────────────── */
adminShippingRouter.get('/zones', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const hasHomeFlat = await columnExists(pool, 'shipping_rates.home_flat_cents')
  const hasYango = await columnExists(pool, 'shipping_rates.yango_courier_cents')
  const hasFreeAbove = await columnExists(pool, 'shipping_rates.free_above_cents')
  const flatSql = hasHomeFlat ? 'ISNULL(sr.home_flat_cents, 0) AS home_flat_cents' : 'CAST(0 AS INT) AS home_flat_cents'
  const yangoSql = hasYango ? 'ISNULL(sr.yango_courier_cents, 0) AS yango_courier_cents' : 'CAST(0 AS INT) AS yango_courier_cents'
  const freeSql = hasFreeAbove ? 'ISNULL(sr.free_above_cents, 0) AS free_above_cents' : 'CAST(0 AS INT) AS free_above_cents'
  const r = await pool.request().query(`
    SELECT CAST(z.id AS NVARCHAR(36)) AS id, z.code, z.display_name, z.sort_order, CAST(z.is_active AS BIT) AS is_active,
      CAST(sr.id AS NVARCHAR(36)) AS rate_id,
      ${flatSql},
      ${yangoSql},
      ${freeSql}
    FROM dbo.shipping_zones z
    LEFT JOIN dbo.shipping_rates sr ON sr.shipping_zone_id = z.id
    ORDER BY z.sort_order
  `)
  res.json({ items: r.recordset })
})

adminShippingRouter.patch('/rates/:rateId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const hasHomeFlat = await columnExists(pool, 'shipping_rates.home_flat_cents')
  const hasYango = await columnExists(pool, 'shipping_rates.yango_courier_cents')
  const hasFreeAbove = await columnExists(pool, 'shipping_rates.free_above_cents')
  const hasUpdatedAt = await columnExists(pool, 'shipping_rates.updated_at')
  const { home_flat_cents, yango_courier_cents, free_above_cents } = req.body as Record<string, unknown>
  try {
    const sets: string[] = []
    const reqB = pool.request().input('id', req.params.rateId)
    if (hasHomeFlat) {
      sets.push('home_flat_cents = COALESCE(@flat, home_flat_cents)')
      reqB.input('flat', home_flat_cents != null ? Number(home_flat_cents) : null)
    }
    if (hasYango) {
      sets.push('yango_courier_cents = COALESCE(@yango, yango_courier_cents)')
      reqB.input('yango', yango_courier_cents != null ? Number(yango_courier_cents) : null)
    }
    if (hasFreeAbove) {
      sets.push('free_above_cents = COALESCE(@free, free_above_cents)')
      reqB.input('free', free_above_cents != null ? Number(free_above_cents) : null)
    }
    if (hasUpdatedAt) {
      sets.push('updated_at = SYSUTCDATETIME()')
    }
    if (sets.length === 0) {
      res.status(503).json({
        error:
          'shipping_rates is missing expected columns (home_flat_cents / yango_courier_cents). Run `npm run db:migrate` (migration 061_shipping_rates_yango_and_flat.sql) or apply that script in SSMS.',
      })
      return
    }
    await reqB.query(`
        UPDATE dbo.shipping_rates SET
          ${sets.join(', ')}
        WHERE id = @id
      `)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

/* ── Home delivery areas ─────────────────────────── */
adminShippingRouter.get('/home-delivery-areas', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const areas = await pool.request().query(`
    SELECT CAST(a.id AS NVARCHAR(36)) AS id, a.code, a.display_name, a.sort_order,
      CAST(a.is_active AS BIT) AS is_active,
      CAST(a.shipping_zone_id AS NVARCHAR(36)) AS shipping_zone_id,
      sz.code AS zone_code
    FROM dbo.home_delivery_areas a
    LEFT JOIN dbo.shipping_zones sz ON sz.id = a.shipping_zone_id
    ORDER BY a.sort_order
  `)
  const presets = await pool.request().query(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, CAST(area_id AS NVARCHAR(36)) AS area_id,
      sort_order, label, start_time_local, end_time_local, days_of_week, iana_tz
    FROM dbo.home_delivery_area_time_presets ORDER BY area_id, sort_order
  `)
  const presetMap = new Map<string, unknown[]>()
  for (const p of presets.recordset) {
    const k = (p as { area_id: string }).area_id
    const arr = presetMap.get(k) ?? []
    arr.push(p)
    presetMap.set(k, arr)
  }
  const items = areas.recordset.map((a) => {
    const row = a as Record<string, unknown>
    return { ...row, presets: presetMap.get(row['id'] as string) ?? [] }
  })
  res.json({ items })
})

adminShippingRouter.patch('/home-delivery-areas/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const { display_name, sort_order, is_active, shipping_zone_id } = req.body as Record<string, unknown>
  try {
    await pool.request()
      .input('id', req.params.id)
      .input('name', display_name ?? null)
      .input('sort', sort_order != null ? Number(sort_order) : null)
      .input('active', is_active != null ? (is_active ? 1 : 0) : null)
      .input('zoneId', shipping_zone_id ?? null)
      .query(`
        UPDATE dbo.home_delivery_areas SET
          display_name = COALESCE(@name, display_name),
          sort_order = COALESCE(@sort, sort_order),
          is_active = COALESCE(@active, is_active),
          shipping_zone_id = COALESCE(@zoneId, shipping_zone_id)
        WHERE id = @id
      `)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})
