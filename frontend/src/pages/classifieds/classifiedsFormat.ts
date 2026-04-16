import type { ListingType } from './classifiedsModel'

/** Compact NAD display similar to storyboards (e.g. N$3,900). */
export function formatClassifiedPrice(cents: number, listingType: ListingType): string {
  const amount = cents / 100
  const formatted = new Intl.NumberFormat('en-NA', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
  const base = `N$${formatted}`
  return listingType === 'rent' ? `${base} / mo` : base
}
