import { apiFetch, fetchCsrfToken } from '../api/client'

export class LiquorRestrictedError extends Error {
  override readonly name = 'LiquorRestrictedError'
  readonly code = 'liquor_restricted' as const
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

async function postCartItems(variantId: string, quantity: number, fallbackMsg = 'Could not update cart'): Promise<void> {
  await fetchCsrfToken()
  const res = await apiFetch('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantId, quantity }),
  })
  if (!res.ok) {
    const raw = await res.text()
    let msg = raw || fallbackMsg
    let code: string | undefined
    try {
      const j = JSON.parse(raw) as { error?: string; code?: string }
      if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim()
      if (typeof j.code === 'string') code = j.code
    } catch {
      /* plain text */
    }
    if (code === 'liquor_restricted') {
      throw new LiquorRestrictedError(
        msg || 'Sign in and add your date of birth (18+) to add alcohol to your cart.',
      )
    }
    throw new Error(msg)
  }
  window.dispatchEvent(new Event('pt-cart-updated'))
}

/**
 * Add a line item to the cart (guest or signed-in). Dispatches `pt-cart-updated` on success.
 * @throws LiquorRestrictedError when the API rejects alcohol for the current account
 * @throws Error with server message for other failures
 */
export async function addVariantToCart(variantId: string, quantity = 1): Promise<void> {
  await postCartItems(variantId, quantity, 'Could not add to cart')
}

/**
 * Set absolute quantity for a variant line (same as add; server upserts by variantId).
 * @throws LiquorRestrictedError when the API rejects alcohol for the current account
 * @throws Error with server message for other failures
 */
export async function setCartLineQuantity(variantId: string, quantity: number): Promise<void> {
  await postCartItems(variantId, quantity, 'Could not update quantity')
}
