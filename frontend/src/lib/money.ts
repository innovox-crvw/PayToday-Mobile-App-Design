function formatNadFromCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents) / 100
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return negative ? `-N$ ${s}` : `N$ ${s}`
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
