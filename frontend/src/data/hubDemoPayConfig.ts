/** Preset amounts (cents) for the client demo pay flow, keyed by payments category or services slug. */
export function demoPresetAmountsCents(categoryKey: string | null | undefined): number[] {
  const k = (categoryKey ?? '').trim().toLowerCase()
  if (k === 'airtime') return [1000, 2500, 5000, 10000, 20000]
  if (k === 'electricity' || k === 'water') return [5000, 10000, 20000, 50000, 100000]
  if (k === 'bills') return [20000, 50000, 100000, 250000]
  if (k === 'food' || k === 'fuel') return [5000, 10000, 25000, 50000]
  if (k === 'parking') return [500, 1000, 2000, 5000]
  if (k === 'vouchers') return [5000, 10000, 25000, 50000]
  if (k === 'stay') return [50000, 150000, 350000, 800000]
  if (k === 'insurance') return [15000, 35000, 75000, 150000]
  if (k === 'contacts') return [10000, 25000, 50000, 100000]
  if (k === 'businesses' || k === 'services') return [5000, 15000, 50000, 150000]
  return [1000, 5000, 10000, 25000, 50000]
}

export function formatNadFromCents(cents: number): string {
  const n = cents / 100
  const sign = n < 0 ? '-' : ''
  return `${sign}N$ ${Math.abs(n).toFixed(2)}`
}
