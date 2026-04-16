import type { ConnectionPool } from 'mssql'
import { formatSqlDriverError, sqlErrorMentionsInvalidColumn, sqlServerErrorNumber } from '../db/sqlDriverError.js'

export type HubPaymentCategoryItemDto = {
  id: string
  categorySlug: string
  itemKind: 'business' | 'contact'
  displayName: string
  initials: string | null
  sortOrder: number
  /** Typical methods: Wallet, card, USSD, meter ref — from `hub_payment_category_items.payment_method`. */
  paymentMethod?: string | null
}

type Row = {
  id: string
  category_slug: string
  item_kind: string
  display_name: string
  initials: string | null
  sort_order: number
  payment_method?: string | null
}

function mapRows(rows: Row[]): HubPaymentCategoryItemDto[] {
  return rows.map((row) => ({
    id: row.id,
    categorySlug: row.category_slug,
    itemKind: row.item_kind === 'contact' ? 'contact' : 'business',
    displayName: row.display_name,
    initials: row.initials?.trim() || null,
    sortOrder: row.sort_order,
    paymentMethod:
      row.payment_method != null && String(row.payment_method).trim() ? String(row.payment_method).trim() : null,
  }))
}

function isMissingPaymentMethodColumn(err: unknown): boolean {
  if (sqlErrorMentionsInvalidColumn(err, 'payment_method')) return true
  const m = formatSqlDriverError(err).toLowerCase()
  return sqlServerErrorNumber(err) === 207 && m.includes('payment_method')
}

export async function listHubPaymentCategoryItems(
  pool: ConnectionPool,
  categorySlug: string,
): Promise<HubPaymentCategoryItemDto[]> {
  const slug = categorySlug.trim()
  if (!slug) return []

  const sqlWith = `
    SELECT CAST(id AS NVARCHAR(36)) AS id,
           category_slug,
           item_kind,
           display_name,
           initials,
           sort_order,
           payment_method
    FROM dbo.hub_payment_category_items
    WHERE category_slug = @slug AND is_active = 1
    ORDER BY sort_order, display_name`

  const sqlWithout = `
    SELECT CAST(id AS NVARCHAR(36)) AS id,
           category_slug,
           item_kind,
           display_name,
           initials,
           sort_order
    FROM dbo.hub_payment_category_items
    WHERE category_slug = @slug AND is_active = 1
    ORDER BY sort_order, display_name`

  try {
    const r = await pool.request().input('slug', slug).query<Row>(sqlWith)
    return mapRows(r.recordset)
  } catch (e) {
    if (!isMissingPaymentMethodColumn(e)) throw e
    const r = await pool.request().input('slug', slug).query<Row>(sqlWithout)
    return mapRows(r.recordset.map((row) => ({ ...row, payment_method: null })))
  }
}
