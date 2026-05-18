import type { ConnectionPool } from 'mssql'
import { columnExists } from '../db/columnExists.js'

export interface DiscountApplyResult {
  discountCents: number
  discountCodeId: string
  code: string
}

/** Row shape after SELECT normalisation (matches dbo.discount_codes kind / percent_bps / amount_cents). */
type DiscountRow = {
  id: string
  discount_type: 'pct' | 'flat'
  discount_value: number
  min_order_cents: number
  max_discount_cents: number | null
  max_uses: number | null
  uses_count: number
  is_active: boolean
}

const DISCOUNT_SELECT = `
  SELECT CAST(id AS NVARCHAR(36)) AS id,
    CASE WHEN kind IN (N'percent', N'pct') THEN N'pct' ELSE N'flat' END AS discount_type,
    CASE WHEN kind IN (N'percent', N'pct') THEN ISNULL(percent_bps, 0) ELSE ISNULL(amount_cents, 0) END AS discount_value,
    ISNULL(min_subtotal_cents, 0) AS min_order_cents,
    CAST(NULL AS INT) AS max_discount_cents,
    max_uses,
    ISNULL(total_uses, 0) AS uses_count,
    is_active
  FROM dbo.discount_codes
`

export async function previewDiscountCode(
  pool: ConnectionPool,
  code: string,
  subtotalCents: number,
): Promise<DiscountApplyResult | { error: string }> {
  const r = await pool
    .request()
    .input('code', code.trim().toUpperCase())
    .input('now', new Date())
    .query<DiscountRow>(`
      ${DISCOUNT_SELECT}
      WHERE UPPER(code) = UPPER(@code)
        AND (starts_at IS NULL OR starts_at <= @now)
        AND (ends_at IS NULL OR ends_at >= @now)
    `)
  const row = r.recordset[0]
  if (!row) return { error: 'Promo code not found or expired.' }
  if (!row.is_active) return { error: 'This promo code is not active.' }
  if (row.max_uses != null && row.uses_count >= row.max_uses) return { error: 'This promo code has reached its usage limit.' }
  if (subtotalCents < row.min_order_cents) {
    const minNad = (row.min_order_cents / 100).toFixed(2)
    return { error: `Minimum order of N$ ${minNad} required for this promo code.` }
  }
  let discountCents = 0
  if (row.discount_type === 'pct') {
    discountCents = Math.floor((subtotalCents * row.discount_value) / 10_000)
  } else {
    discountCents = row.discount_value
  }
  if (row.max_discount_cents != null) {
    discountCents = Math.min(discountCents, row.max_discount_cents)
  }
  discountCents = Math.min(discountCents, subtotalCents)
  return { discountCents, discountCodeId: row.id, code: code.trim().toUpperCase() }
}

export async function redeemDiscountCode(pool: ConnectionPool, discountCodeId: string): Promise<void> {
  const hasUpdatedAt = await columnExists(pool, 'discount_codes.updated_at')
  const setSql = hasUpdatedAt
    ? `SET total_uses = ISNULL(total_uses, 0) + 1, updated_at = SYSUTCDATETIME()`
    : `SET total_uses = ISNULL(total_uses, 0) + 1`
  await pool.request().input('id', discountCodeId).query(`UPDATE dbo.discount_codes ${setSql} WHERE id = @id`)
}
