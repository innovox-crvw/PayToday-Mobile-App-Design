/** My Orders list buckets (customer-facing). */
export type OrderListCategory =
  | 'to_pay'
  | 'to_deliver'
  | 'delivered'
  | 'to_review'
  | 'returns'

/** Orders the shopper marked “complete” so they move from Delivered → To review. */
const STORAGE_KEY = 'paytoday:store-order-ready-for-review-ids'
import { apiFetch, readResponseJson } from '../api/client'
import { apiUrl } from './apiOrigin'

/** Legacy key (inverted semantics); migrated once then ignored. */
const LEGACY_REVIEWED_KEY = 'paytoday:store-order-reviewed-ids'

function migrateLegacyIfNeeded(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return
    const raw = localStorage.getItem(LEGACY_REVIEWED_KEY)
    if (!raw) return
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return
    /* Old: “reviewed” meant show under Delivered. New: we don’t map 1:1; clear legacy to avoid wrong tabs. */
    localStorage.removeItem(LEGACY_REVIEWED_KEY)
  } catch {
    /* ignore */
  }
}

/** IDs for orders that should appear under To review (after user tapped “Mark complete” on Delivered). */
export function getReadyForReviewOrderIds(): Set<string> {
  migrateLegacyIfNeeded()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function markOrderReadyForReview(orderId: string): void {
  const next = getReadyForReviewOrderIds()
  next.add(orderId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  window.dispatchEvent(new CustomEvent('paytoday-store-review-updated'))
}

/** Remove from the To review queue (e.g. after submitting a review). */
export function removeOrderFromReviewQueue(orderId: string): void {
  const next = getReadyForReviewOrderIds()
  if (!next.delete(orderId)) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  window.dispatchEvent(new CustomEvent('paytoday-store-review-updated'))
}

const REVIEW_PAYLOADS_KEY = 'paytoday:store-order-review-payloads'

export type StoredOrderReview = {
  rating: number
  comment: string
  submittedAt: string
}

function readReviewPayloads(): Record<string, StoredOrderReview> {
  try {
    const raw = localStorage.getItem(REVIEW_PAYLOADS_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return {}
    return p as Record<string, StoredOrderReview>
  } catch {
    return {}
  }
}

export function getOrderReview(orderId: string): StoredOrderReview | null {
  const r = readReviewPayloads()[orderId]
  if (!r || typeof r.rating !== 'number') return null
  return r
}

/** Loads a persisted review from the API (cross-device). Guest checkout must pass `guestEmail`. */
export async function fetchOrderReviewFromApi(
  orderId: string,
  opts?: { guestEmail?: string },
): Promise<StoredOrderReview | null> {
  const em = opts?.guestEmail?.trim()
  const q = em ? `?email=${encodeURIComponent(em)}` : ''
  const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderId)}/review${q}`), {
    credentials: 'include',
  })
  if (!res.ok) return null
  const data = await readResponseJson<{ review: StoredOrderReview | null }>(res)
  const r = data.review
  if (!r || typeof r.rating !== 'number') return null
  return {
    rating: r.rating,
    comment: typeof r.comment === 'string' ? r.comment : '',
    submittedAt: typeof r.submittedAt === 'string' ? r.submittedAt : new Date().toISOString(),
  }
}

function persistReviewMirrorLocal(orderId: string, payload: StoredOrderReview): void {
  const map = readReviewPayloads()
  map[orderId] = payload
  localStorage.setItem(REVIEW_PAYLOADS_KEY, JSON.stringify(map))
}

/**
 * Saves star rating + optional comment on the server, mirrors locally for offline display,
 * removes the order from **To review**, and moves it back to **Delivered** on My orders.
 */
export async function submitOrderReview(
  orderId: string,
  input: { rating: number; comment: string },
  opts?: { guestEmail?: string },
): Promise<void> {
  const rating = Math.round(Number(input.rating))
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Choose a rating from 1 to 5.')
  }
  let comment = typeof input.comment === 'string' ? input.comment.trim() : ''
  if (comment.length > 2000) comment = comment.slice(0, 2000)

  const body: Record<string, unknown> = { rating, comment }
  const em = opts?.guestEmail?.trim()
  if (em) body.email = em

  const res = await apiFetch(`/api/orders/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await readResponseJson<{ ok?: boolean; review?: StoredOrderReview; error?: string }>(res)
  if (!res.ok) {
    throw new Error(data.error ?? `Could not save review (${res.status})`)
  }
  const submitted =
    data.review?.submittedAt && typeof data.review.rating === 'number'
      ? {
          rating: data.review.rating,
          comment: typeof data.review.comment === 'string' ? data.review.comment : comment,
          submittedAt: data.review.submittedAt,
        }
      : { rating, comment, submittedAt: new Date().toISOString() }
  persistReviewMirrorLocal(orderId, submitted)
  removeOrderFromReviewQueue(orderId)
}

export function assignOrderListCategory(
  status: string,
  orderId: string,
  readyForReviewIds: ReadonlySet<string>,
): OrderListCategory {
  const s = status ?? ''
  if (s === 'refunded' || s === 'cancelled') return 'returns'
  if (s === 'pending_payment' || s === 'draft') return 'to_pay'
  if (s === 'paid' || s === 'processing' || s === 'shipped') return 'to_deliver'
  if (s === 'delivered') {
    return readyForReviewIds.has(orderId) ? 'to_review' : 'delivered'
  }
  /* Unknown statuses — show under To deliver so they stay visible */
  return 'to_deliver'
}

export const ORDER_LIST_TABS: ReadonlyArray<{ id: OrderListCategory; label: string }> = [
  { id: 'to_pay', label: 'To pay' },
  { id: 'to_deliver', label: 'To deliver' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'to_review', label: 'To review' },
  { id: 'returns', label: 'Returns' },
]
