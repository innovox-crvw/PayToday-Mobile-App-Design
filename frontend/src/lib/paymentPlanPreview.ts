/** Match backend splitTotalIntoInstalmentAmounts — last instalment absorbs rounding. */
export function splitTotalIntoInstalmentAmounts(totalCents: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count))
  const total = Math.max(0, Math.floor(totalCents))
  const base = Math.floor(total / n)
  const amounts: number[] = []
  for (let i = 0; i < n; i += 1) {
    amounts.push(i === n - 1 ? total - base * (n - 1) : base)
  }
  return amounts
}
