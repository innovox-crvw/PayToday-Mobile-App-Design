export function computeRoundUpCents(orderCents: number, incrementCents: number): { chargeCents: number; spareCents: number } {
  if (orderCents <= 0 || incrementCents <= 0) return { chargeCents: orderCents, spareCents: 0 }
  const chargeCents = Math.ceil(orderCents / incrementCents) * incrementCents
  return { chargeCents, spareCents: Math.max(0, chargeCents - orderCents) }
}

export const ROUND_UP_INCREMENT_OPTIONS = [
  { cents: 100, label: 'Nearest N$1' },
  { cents: 500, label: 'Nearest N$5' },
  { cents: 1000, label: 'Nearest N$10' },
] as const
