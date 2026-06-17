import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const adminPromotionsRouter = Router()
adminPromotionsRouter.use(requireAuth, requireRole('admin', 'ops'))

function noPool(res: import('express').Response) {
  res.status(503).json({ error: 'Database not configured' })
}

adminPromotionsRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    const r = await pool.request().query(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, slug, title, subtitle, image_url, link_path,
        sort_order, CAST(is_active AS BIT) AS is_active, deposit_box_copy,
        CONVERT(NVARCHAR(30), starts_at, 127) AS starts_at,
        CONVERT(NVARCHAR(30), ends_at, 127) AS ends_at,
        CONVERT(NVARCHAR(30), created_at, 127) AS created_at
      FROM dbo.store_promotions ORDER BY sort_order, title
    `)
    res.json({ items: r.recordset })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminPromotionsRouter.post('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const { slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at, deposit_box_copy } = req.body as Record<string, unknown>
  if (!slug || !title) { res.status(400).json({ error: 'slug and title required' }); return }
  try {
    const r = await pool.request()
      .input('slug', String(slug))
      .input('title', String(title))
      .input('subtitle', subtitle ?? null)
      .input('imageUrl', image_url ?? null)
      .input('linkPath', link_path ?? null)
      .input('sort', Number(sort_order ?? 0))
      .input('active', is_active !== false ? 1 : 0)
      .input('startsAt', starts_at ? new Date(String(starts_at)) : null)
      .input('endsAt', ends_at ? new Date(String(ends_at)) : null)
      .input('copy', deposit_box_copy ?? null)
      .query<{ id: string }>(`
        INSERT INTO dbo.store_promotions (slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at, deposit_box_copy)
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@slug, @title, @subtitle, @imageUrl, @linkPath, @sort, @active, @startsAt, @endsAt, @copy)
      `)
    res.status(201).json({ id: r.recordset[0].id })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminPromotionsRouter.patch('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const { title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at, deposit_box_copy } = req.body as Record<string, unknown>
  try {
    await pool.request()
      .input('id', req.params.id)
      .input('title', title ?? null)
      .input('subtitle', subtitle ?? null)
      .input('imageUrl', image_url ?? null)
      .input('linkPath', link_path ?? null)
      .input('sort', sort_order != null ? Number(sort_order) : null)
      .input('active', is_active != null ? (is_active ? 1 : 0) : null)
      .input('startsAt', starts_at ? new Date(String(starts_at)) : null)
      .input('endsAt', ends_at ? new Date(String(ends_at)) : null)
      .input('copy', deposit_box_copy !== undefined ? (deposit_box_copy ?? null) : undefined)
      .query(`
        UPDATE dbo.store_promotions SET
          title = COALESCE(@title, title),
          subtitle = COALESCE(@subtitle, subtitle),
          image_url = COALESCE(@imageUrl, image_url),
          link_path = COALESCE(@linkPath, link_path),
          sort_order = COALESCE(@sort, sort_order),
          is_active = COALESCE(@active, is_active),
          starts_at = COALESCE(@startsAt, starts_at),
          ends_at = COALESCE(@endsAt, ends_at),
          deposit_box_copy = COALESCE(@copy, deposit_box_copy),
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminPromotionsRouter.delete('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  await pool.request().input('id', req.params.id).query(`DELETE FROM dbo.store_promotions WHERE id = @id`)
  res.json({ ok: true })
})
