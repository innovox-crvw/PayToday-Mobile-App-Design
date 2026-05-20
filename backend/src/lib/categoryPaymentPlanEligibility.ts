import type { CategoryRow } from '../repos/categoriesRepo.js'

const PAYMENT_PLAN_MIN_SUBTOTAL_CENTS = 500_000

/**
 * True when the category for `categorySlug` or any ancestor has `paymentPlanEligible`.
 */
export function categorySlugEligibleForPaymentPlan(categorySlug: string, categories: CategoryRow[]): boolean {
  if (!categorySlug.trim() || categories.length === 0) return false
  const slugLower = categorySlug.trim().toLowerCase()
  const cat = categories.find((c) => c.slug.trim().toLowerCase() === slugLower)
  if (!cat) return false
  const byId = new Map(categories.map((c) => [c.id, c]))
  let cur: CategoryRow | undefined = cat
  let d = 0
  while (cur && d < 64) {
    if (cur.paymentPlanEligible) return true
    const pid = cur.parentId?.trim()
    if (!pid) break
    cur = byId.get(pid)
    d += 1
  }
  return false
}

export type CartPaymentPlanEligibility = {
  eligible: boolean
  minSubtotalCents: number
  /** Present when `eligible` is false. */
  reason?: string
}

export function evaluateCartPaymentPlanEligibility(
  lines: { categorySlug: string | null | undefined }[],
  categories: CategoryRow[],
  subtotalCents: number,
): CartPaymentPlanEligibility {
  const minSubtotalCents = PAYMENT_PLAN_MIN_SUBTOTAL_CENTS
  if (subtotalCents < minSubtotalCents) {
    return {
      eligible: false,
      minSubtotalCents,
      reason: 'Payment plans require a cart subtotal of N$5,000 or more.',
    }
  }
  if (lines.length === 0) {
    return { eligible: false, minSubtotalCents, reason: 'Cart is empty.' }
  }
  const ineligible = lines.filter((l) => {
    const slug = l.categorySlug?.trim()
    if (!slug) return true
    return !categorySlugEligibleForPaymentPlan(slug, categories)
  })
  if (ineligible.length > 0) {
    return {
      eligible: false,
      minSubtotalCents,
      reason:
        'Your cart includes items from categories that are not eligible for payment plans. Remove those items or choose another payment method.',
    }
  }
  return { eligible: true, minSubtotalCents }
}
