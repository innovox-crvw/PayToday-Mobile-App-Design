import type { ConnectionPool } from 'mssql'
import { markOrderPaid } from './orderService.js'
import { resolveOrderNotificationTarget } from './orderNotificationEmail.js'
import { enqueueNotification } from './notifications.js'
import { resolveOutboxChannel } from './notificationRouting.js'

export async function capturePaymentRow(pool: ConnectionPool, orderId: string): Promise<void> {
  await pool.request().input('oid', orderId).query(`UPDATE dbo.payments SET status = N'captured' WHERE order_id = @oid`)
}

/**
 * Idempotent: safe to call from webhook and browser return. Confirms payment and sends notification once per transition.
 */
export async function confirmOrderPaid(pool: ConnectionPool, orderId: string): Promise<{ alreadyPaid: boolean }> {
  const before = await pool
    .request()
    .input('oid', orderId)
    .query<{ status: string }>(`SELECT status FROM dbo.orders WHERE id = @oid`)
  const st = before.recordset[0]?.status
  if (st === 'paid' || st === 'shipped' || st === 'delivered' || st === 'cancelled' || st === 'refunded') {
    return { alreadyPaid: true }
  }

  await markOrderPaid(pool, orderId)
  await capturePaymentRow(pool, orderId)

  const target = await resolveOrderNotificationTarget(pool, orderId)
  const channel = await resolveOutboxChannel(pool, target?.userId ?? null, target?.guestEmail ?? null, 'payment_confirmed')
  await enqueueNotification(pool, {
    userId: target?.userId ?? null,
    email: target?.email ?? null,
    channel,
    templateKey: 'payment_confirmed',
    payload: JSON.stringify({ orderId }),
  })

  return { alreadyPaid: false }
}
