/** Session key for POST /api/checkout Idempotency-Key — must reset after a successful order or retries reuse the first attempt only. */
export const CHECKOUT_IDEMPOTENCY_STORAGE_KEY = 'pt_checkout_idempotency'

export function clearCheckoutIdempotencyKey(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY)
  } catch {
    /* private mode / quota */
  }
}
