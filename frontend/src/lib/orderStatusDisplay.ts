/** Maps persisted `orders.status` values to short customer-facing labels (scope-style wording). */
const LABELS: Record<string, string> = {
  pending_payment: 'Pending payment',
  paid: 'Paid',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export function formatOrderStatusLabel(status: string | null | undefined): string {
  const s = status ?? ''
  if (LABELS[s]) return LABELS[s]
  return s
    .split(/_/u)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
