import type { ConnectionPool } from 'mssql'

/** COL_LENGTH checks keyed for cache — only whitelisted SQL fragments. */
const COL_LENGTH_SQL = {
  'rbac_roles.description': `SELECT COL_LENGTH(N'dbo.rbac_roles', N'description') AS len`,
  'rbac_permissions.description': `SELECT COL_LENGTH(N'dbo.rbac_permissions', N'description') AS len`,
  'discount_codes.created_at': `SELECT COL_LENGTH(N'dbo.discount_codes', N'created_at') AS len`,
  'discount_codes.updated_at': `SELECT COL_LENGTH(N'dbo.discount_codes', N'updated_at') AS len`,
  'order_payment_plans.instalment_cents': `SELECT COL_LENGTH(N'dbo.order_payment_plans', N'instalment_cents') AS len`,
  'order_payment_plans.created_at': `SELECT COL_LENGTH(N'dbo.order_payment_plans', N'created_at') AS len`,
  'order_payment_plans.updated_at': `SELECT COL_LENGTH(N'dbo.order_payment_plans', N'updated_at') AS len`,
  'order_payment_plans.total_principal_cents': `SELECT COL_LENGTH(N'dbo.order_payment_plans', N'total_principal_cents') AS len`,
  'orders.discount_code_id': `SELECT COL_LENGTH(N'dbo.orders', N'discount_code_id') AS len`,
  'orders.discount_cents': `SELECT COL_LENGTH(N'dbo.orders', N'discount_cents') AS len`,
  'shipping_rates.free_above_cents': `SELECT COL_LENGTH(N'dbo.shipping_rates', N'free_above_cents') AS len`,
  'shipping_rates.home_flat_cents': `SELECT COL_LENGTH(N'dbo.shipping_rates', N'home_flat_cents') AS len`,
  'shipping_rates.yango_courier_cents': `SELECT COL_LENGTH(N'dbo.shipping_rates', N'yango_courier_cents') AS len`,
  'shipping_rates.updated_at': `SELECT COL_LENGTH(N'dbo.shipping_rates', N'updated_at') AS len`,
} as const

export type ColumnExistenceKey = keyof typeof COL_LENGTH_SQL

const cache = new Map<ColumnExistenceKey, boolean>()

/** True when the column exists on the table (COL_LENGTH non-null). */
export async function columnExists(pool: ConnectionPool, key: ColumnExistenceKey): Promise<boolean> {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const r = await pool.request().query<{ len: number | null }>(COL_LENGTH_SQL[key])
  const ok = r.recordset[0]?.len != null
  cache.set(key, ok)
  return ok
}

/** For tests or after migrations. */
export function resetColumnExistenceCache(): void {
  cache.clear()
}
