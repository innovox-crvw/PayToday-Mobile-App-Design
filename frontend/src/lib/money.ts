function formatNadFromCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents) / 100
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return negative ? `-N$ ${s}` : `N$ ${s}`
}

/** Admin / form fields: convert stored cents to a decimal rand string (e.g. 19900 → "199.00"). */
export function centsToNadInputString(cents: number): string {
  if (!Number.isFinite(cents)) return ''
  return (Math.round(cents) / 100).toFixed(2)
}

export function formatMoney(cents: number, currency: string): string {
  const ccy = currency.trim().toUpperCase()
  if (ccy === 'NAD') return formatNadFromCents(cents)

  const amount = cents / 100
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(amount)
  } catch {
    return `${ccy} ${amount.toFixed(2)}`
  }
}
