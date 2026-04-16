import type { ConnectionPool } from 'mssql'

export interface OrderNotificationTarget {
  /** `guest_email` if set, else account email for `user_id`. */
  email: string | null
  userId: string | null
  guestEmail: string | null
}

/** One round-trip: guest checkout uses `guest_email`; signed-in orders fall back to `users.email`. */
export async function resolveOrderNotificationTarget(
  pool: ConnectionPool,
  orderId: string,
): Promise<OrderNotificationTarget | null> {
  const r = await pool
    .request()
    .input('oid', orderId)
    .query<{ guest_email: string | null; user_email: string | null; user_id: string | null }>(`
      SELECT o.guest_email, u.email AS user_email, CAST(o.user_id AS NVARCHAR(36)) AS user_id
      FROM dbo.orders o
      LEFT JOIN dbo.users u ON u.id = o.user_id
      WHERE o.id = @oid
    `)
  const row = r.recordset[0]
  if (!row) return null
  const guest = row.guest_email?.trim() || null
  const userMail = row.user_email?.trim() || null
  return {
    email: guest || userMail,
    userId: row.user_id,
    guestEmail: row.guest_email,
  }
}
