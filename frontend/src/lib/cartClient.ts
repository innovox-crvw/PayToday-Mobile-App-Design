import { apiFetch, fetchCsrfToken } from '../api/client'

/**
 * Add a line item to the cart (guest or signed-in). Dispatches `pt-cart-updated` on success.
 * @throws Error with server message when the request fails
 */
export async function addVariantToCart(variantId: string, quantity = 1): Promise<void> {
  await fetchCsrfToken()
  const res = await apiFetch('/api/cart/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variantId, quantity }),
  })
  if (!res.ok) {
    const raw = await res.text()
    let msg = raw || 'Could not add to cart'
    try {
      const j = JSON.parse(raw) as { error?: string }
      if (typeof j.error === 'string' && j.error.trim()) msg = j.error.trim()
    } catch {
      /* plain text */
    }
    throw new Error(msg)
  }
  window.dispatchEvent(new Event('pt-cart-updated'))
}
