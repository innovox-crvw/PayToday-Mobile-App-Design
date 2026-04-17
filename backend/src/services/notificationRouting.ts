import type { ConnectionPool } from 'mssql'

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
])

export function isEmailWorthyTemplate(templateKey: string): boolean {
  return EMAIL_WORTHY_TEMPLATE_KEYS.has(templateKey)
}

/**
 * Outbox channel: email | in_app | both
 * - Orders and payments: email (guests) or both (signed-in: email + in-app).
 * - Other templates: in-app only for accounts; guests fall back to email when no user id.
 */
export async function resolveOutboxChannel(
  pool: ConnectionPool | null,
  userId: string | null | undefined,
  _guestEmail: string | null | undefined,
  templateKey: string,
): Promise<'email' | 'in_app' | 'both'> {
  const important = isEmailWorthyTemplate(templateKey)

  if (!userId || !pool) {
    return 'email'
  }

  if (important) {
    return 'both'
  }

  return 'in_app'
}
