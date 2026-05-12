import { Router } from 'express'
import { columnExists } from '../../db/columnExists.js'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'

export const adminDiscountsRouter = Router()
adminDiscountsRouter.use(requireAuth, requireRole('admin', 'ops'))

function noPool(res: import('express').Response) {
  res.status(503).json({ error: 'Database not configured' })
}

/** Map admin API body (pct|flat + single value) to dbo.discount_codes columns. */
function toKindAndAmounts(discountType: unknown, discountValue: unknown): {
  kind: string
  percentBps: number | null
  amountCents: number | null
} {
  const t = String(discountType ?? '').toLowerCase()
  const isPct = t === 'pct' || t === 'percent'
  const val = Number(discountValue)
  if (!Number.isFinite(val) || val <= 0) {
    throw new Error('discount_value must be a positive number')
  }
  if (isPct) {
    return { kind: 'percent', percentBps: Math.floor(val), amountCents: null }
  }
  return { kind: 'fixed', percentBps: null, amountCents: Math.floor(val) }
}

adminDiscountsRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    noPool(res)
    return
  }
  try {
    const hasCreatedAt = await columnExists(pool, 'discount_codes.created_at')
    const createdAtSql = hasCreatedAt
      ? `CONVERT(NVARCHAR(30), created_at, 127) AS created_at`
      : `CAST(NULL AS NVARCHAR(30)) AS created_at`
    const orderSql = hasCreatedAt ? `ORDER BY created_at DESC` : `ORDER BY code DESC`
    const r = await pool.request().query(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, code,
        CAST(NULL AS NVARCHAR(500)) AS description,
        CASE WHEN kind IN (N'percent', N'pct') THEN N'pct' ELSE N'flat' END AS discount_type,
        CASE WHEN kind IN (N'percent', N'pct') THEN ISNULL(percent_bps, 0) ELSE ISNULL(amount_cents, 0) END AS discount_value,
        ISNULL(min_subtotal_cents, 0) AS min_order_cents,
        CAST(NULL AS INT) AS max_discount_cents,
        max_uses,
        ISNULL(total_uses, 0) AS uses_count,
        is_active,
        CONVERT(NVARCHAR(30), starts_at, 127) AS starts_at,
        CONVERT(NVARCHAR(30), ends_at, 127) AS ends_at,
        ${createdAtSql}
      FROM dbo.discount_codes
      ${orderSql}
    `)
    res.json({ items: r.recordset })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminDiscountsRouter.post('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    noPool(res)
    return
  }
  const { code, discount_type, discount_value, min_order_cents, max_uses, starts_at, ends_at, is_active } = req.body as Record<
    string,
    unknown
  >
  if (!code || typeof code !== 'string' || !discount_type || discount_value == null) {
    res.status(400).json({ error: 'code, discount_type, discount_value required' })
    return
  }
  try {
    const { kind, percentBps, amountCents } = toKindAndAmounts(discount_type, discount_value)
    const r = await pool
      .request()
      .input('code', String(code).toUpperCase())
      .input('kind', kind)
      .input('bps', percentBps)
      .input('amt', amountCents)
      .input('min', Number(min_order_cents ?? 0))
      .input('maxUses', max_uses != null ? Number(max_uses) : null)
      .input('startsAt', starts_at ? new Date(String(starts_at)) : null)
      .input('endsAt', ends_at ? new Date(String(ends_at)) : null)
      .input('active', is_active !== false ? 1 : 0)
      .query<{ id: string }>(`
        INSERT INTO dbo.discount_codes (
          code, kind, percent_bps, amount_cents, currency, min_subtotal_cents,
          max_uses, starts_at, ends_at, is_active
        )
        OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
        VALUES (@code, @kind, @bps, @amt, N'NAD', @min, @maxUses, @startsAt, @endsAt, @active)
      `)
    res.status(201).json({ id: r.recordset[0].id })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminDiscountsRouter.patch('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    noPool(res)
    return
  }
  const hasUpdatedAt = await columnExists(pool, 'discount_codes.updated_at')
  const touchUpdated = hasUpdatedAt ? ', updated_at = SYSUTCDATETIME()' : ''
  const { discount_type, discount_value, min_order_cents, max_uses, starts_at, ends_at, is_active } = req.body as Record<
    string,
    unknown
  >
  try {
    const r = await pool
      .request()
      .input('id', req.params.id)
      .input('min', min_order_cents != null ? Number(min_order_cents) : null)
      .input('maxUses', max_uses != null ? Number(max_uses) : null)
      .input('startsAt', starts_at ? new Date(String(starts_at)) : null)
      .input('endsAt', ends_at ? new Date(String(ends_at)) : null)
      .input('active', is_active != null ? (is_active ? 1 : 0) : null)

    if (discount_type != null && discount_value != null) {
      const { kind, percentBps, amountCents } = toKindAndAmounts(discount_type, discount_value)
      await r
        .input('kind', kind)
        .input('bps', percentBps)
        .input('amt', amountCents)
        .query(`
          UPDATE dbo.discount_codes SET
            kind = @kind,
            percent_bps = @bps,
            amount_cents = @amt,
            min_subtotal_cents = COALESCE(@min, min_subtotal_cents),
            max_uses = COALESCE(@maxUses, max_uses),
            starts_at = COALESCE(@startsAt, starts_at),
            ends_at = COALESCE(@endsAt, ends_at),
            is_active = COALESCE(@active, is_active)
            ${touchUpdated}
          WHERE id = @id
        `)
    } else {
      await r.query(`
        UPDATE dbo.discount_codes SET
          min_subtotal_cents = COALESCE(@min, min_subtotal_cents),
          max_uses = COALESCE(@maxUses, max_uses),
          starts_at = COALESCE(@startsAt, starts_at),
          ends_at = COALESCE(@endsAt, ends_at),
          is_active = COALESCE(@active, is_active)
          ${touchUpdated}
        WHERE id = @id
      `)
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminDiscountsRouter.delete('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    noPool(res)
    return
  }
  await pool.request().input('id', req.params.id).query(`DELETE FROM dbo.discount_codes WHERE id = @id`)
  res.json({ ok: true })
})
