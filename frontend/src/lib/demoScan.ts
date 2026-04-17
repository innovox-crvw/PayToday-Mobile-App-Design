/**
 * Client-side payloads for in-app scan / QR (no PayToday backend).
 * Payer flow: Scan "Pay by Code" reads these strings from QR or manual entry.
 */

export const DEMO_PAYTO_PREFIX = 'PT-PAYTO|'

const KNOWN: Record<
  string,
  { merchantName: string; detail: string; suggestedAmountCents: number }
> = {
  'PT-RETAIL-MAERUA': {
    merchantName: 'Maerua Quickshop',
    detail: 'Checkout lane 4',
    suggestedAmountCents: 4_500,
  },
  'PT-PARKING-001': {
    merchantName: 'City Parking Windhoek',
    detail: 'Exit gate · Zone A',
    suggestedAmountCents: 1_200,
  },
  'PT-FUEL-SHELL-KH': {
    merchantName: 'Shell Klein Windhoek',
    detail: 'Pump pre-auth',
    suggestedAmountCents: 8_000,
  },
}

export type DemoScanInterpretation = {
  merchantName: string
  detail: string
  suggestedAmountCents: number | null
  reference: string
}

export function interpretDemoScan(raw: string): DemoScanInterpretation {
  const t = raw.trim()
  const ref = t.length > 120 ? `${t.slice(0, 117)}…` : t
  if (!t) {
    return {
      merchantName: 'Empty code',
      detail: 'Enter or scan a payment code.',
      suggestedAmountCents: null,
      reference: ref,
    }
  }

  const paytoIdx = t.toUpperCase().indexOf(DEMO_PAYTO_PREFIX.toUpperCase())
  if (paytoIdx >= 0) {
    const payload = t.slice(paytoIdx + DEMO_PAYTO_PREFIX.length).trim()
    const parts = payload.split('|').map((s) => s.trim())
    const handle = parts[0] || 'recipient'
    const cents = parts[1] && /^\d+$/u.test(parts[1]) ? Number.parseInt(parts[1], 10) : null
    return {
      merchantName: handle.includes('@') ? `Pay ${handle}` : `Pay to: ${handle}`,
      detail: 'Receive-money request',
      suggestedAmountCents: cents != null && cents > 0 ? cents : null,
      reference: ref,
    }
  }

  const upper = t.toUpperCase()
  if (KNOWN[upper]) {
    const k = KNOWN[upper]
    return {
      merchantName: k.merchantName,
      detail: k.detail,
      suggestedAmountCents: k.suggestedAmountCents,
      reference: upper,
    }
  }

  try {
    const u = new URL(t)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return {
        merchantName: 'Web payment link',
        detail: `${u.hostname}${u.pathname}`.slice(0, 80),
        suggestedAmountCents: 5_000,
        reference: ref,
      }
    }
  } catch {
    /* not a URL */
  }

  return {
    merchantName: 'Scanned merchant',
    detail: t.length > 72 ? `${t.slice(0, 69)}…` : t,
    suggestedAmountCents: 5_000,
    reference: ref,
  }
}

export function buildReceiveDemoPayload(email: string, amountCents: number | null): string {
  const e = email.trim() || 'guest@example.com'
  if (amountCents != null && amountCents > 0) {
    return `${DEMO_PAYTO_PREFIX}${e}|${amountCents}`
  }
  return `${DEMO_PAYTO_PREFIX}${e}`
}
