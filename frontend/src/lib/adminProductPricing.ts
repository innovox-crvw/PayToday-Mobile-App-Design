import { centsToNadInputString } from './money'
import { parseNadInputToCents } from './inputValidators'

export type AdminDiscountMode = 'none' | 'amount' | 'percent'

export type AdminPricingFields = {
  listPriceNad: string
  discountMode: AdminDiscountMode
  discountValue: string
}

export function emptyAdminPricingFields(listPriceNad = ''): AdminPricingFields {
  return { listPriceNad, discountMode: 'none', discountValue: '' }
}

/** Map stored variant prices into admin pricing fields (infers amount vs % when discounted). */
export function variantToAdminPricingFields(v: {
  priceCents: number
  compareAtPriceCents: number | null
}): AdminPricingFields {
  const hasDiscount =
    v.compareAtPriceCents != null && v.compareAtPriceCents > v.priceCents
  const listCents = hasDiscount ? v.compareAtPriceCents! : v.priceCents
  const listPriceNad = centsToNadInputString(listCents)
  if (!hasDiscount) {
    return { listPriceNad, discountMode: 'none', discountValue: '' }
  }
  const savings = v.compareAtPriceCents! - v.priceCents
  const pct = Math.round((savings / v.compareAtPriceCents!) * 100)
  const amountFromPct = Math.round((v.compareAtPriceCents! * pct) / 100)
  if (pct > 0 && pct < 100 && amountFromPct === savings) {
    return { listPriceNad, discountMode: 'percent', discountValue: String(pct) }
  }
  return {
    listPriceNad,
    discountMode: 'amount',
    discountValue: centsToNadInputString(savings),
  }
}

export function computeSaleCentsFromAdminPricing(
  listCents: number,
  mode: AdminDiscountMode,
  valueStr: string,
): { saleCents: number } | { error: string } {
  if (mode === 'none') return { saleCents: listCents }
  const trimmed = valueStr.trim()
  if (!trimmed) return { error: 'Enter a discount value.' }
  if (mode === 'amount') {
    const n = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      return { error: 'Discount amount must be greater than zero.' }
    }
    const discountCents = Math.round(n * 100)
    if (discountCents >= listCents) {
      return { error: 'Discount amount must be less than the regular price.' }
    }
    return { saleCents: listCents - discountCents }
  }
  const pct = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
    return { error: 'Discount percent must be between 1 and 99.' }
  }
  const saleCents = Math.round(listCents * (1 - pct / 100))
  if (saleCents <= 0 || saleCents >= listCents) {
    return { error: 'Discount percent must leave a sale price below the regular price.' }
  }
  return { saleCents }
}

export function resolveAdminPricingToCents(
  fields: AdminPricingFields,
): { ok: true; priceCents: number; compareAtPriceCents: number | null } | { ok: false; message: string } {
  const listR = parseNadInputToCents(fields.listPriceNad, 'listPrice')
  if (!listR.ok) return { ok: false, message: listR.message }
  const saleR = computeSaleCentsFromAdminPricing(listR.value, fields.discountMode, fields.discountValue)
  if ('error' in saleR) return { ok: false, message: saleR.error }
  if (fields.discountMode === 'none') {
    return { ok: true, priceCents: listR.value, compareAtPriceCents: null }
  }
  return {
    ok: true,
    priceCents: saleR.saleCents,
    compareAtPriceCents: listR.value,
  }
}

export function previewAdminPricing(
  fields: AdminPricingFields,
  currency: string,
): {
  priceCents: number
  compareAtPriceCents: number
  pct: number
  currency: string
} | null {
  const resolved = resolveAdminPricingToCents(fields)
  if (!resolved.ok || resolved.compareAtPriceCents == null) return null
  const pct = Math.round(((resolved.compareAtPriceCents - resolved.priceCents) / resolved.compareAtPriceCents) * 100)
  if (!(pct > 0)) return null
  return {
    priceCents: resolved.priceCents,
    compareAtPriceCents: resolved.compareAtPriceCents,
    pct: Math.min(99, pct),
    currency,
  }
}
