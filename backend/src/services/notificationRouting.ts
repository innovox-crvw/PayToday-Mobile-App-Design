import type { ConnectionPool } from 'mssql'
import { getUserNotificationChannel } from '../repos/usersRepo.js'

/** Order / payment / pickup — emailed (and in-app when the user has an account). */
const EMAIL_WORTHY_TEMPLATE_KEYS = new Set([
  'checkout_pending_payment',
  'payment_confirmed',
  'pickup_code_ready',
  /** Fulfillment desk moved the order (admin / ops / fulfillment). */
  'fulfillment_stage_updated',
  /** Hub Payments / Services client demo — mirrors store “pending gateway” + “confirmed” notifications. */
  'hub_demo_pending_payment',
  'hub_demo_payment_completed',
  /** Post-delivery return workflow status updates. */
  'return_case_status',
  /** Customer opened an order dispute. */
  'order_dispute_submitted',
])

export function isEmailWorthyTemplate(templateKey: string): boolean {
  return EMAIL_WORTHY_TEMPLATE_KEYS.has(templateKey)
}

/**
 * Outbox channel: email | in_app | both
 * - Guests (no user id): always email.
 * - Signed-in users: `dbo.users.notification_channel` (profile Settings).
 * - If the user chose **email only**, we still use **both** for order/checkout/hub templates so the
 *   in-app feed and badge stay useful (email is sent when notify/SMTP is configured).
 */
export async function resolveOutboxChannel(
  pool: ConnectionPool | null,
  userId: string | null | undefined,
  _guestEmail: string | null | undefined,
  templateKey: string,
): Promise<'email' | 'in_app' | 'both'> {
  const uid = userId?.trim()
  if (!uid || !pool) {
    return 'email'
  }

  const pref = await getUserNotificationChannel(pool, uid)
  if (pref === 'email' && isEmailWorthyTemplate(templateKey)) {
    return 'both'
  }
  return pref
}
