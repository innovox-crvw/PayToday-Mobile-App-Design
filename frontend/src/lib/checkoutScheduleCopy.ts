/** Copy when alcohol orders are placed outside permitted selling / store hours. */

export function alcoholOutsideHoursMessage(mode: 'pickup' | 'delivery'): string {
  if (mode === 'pickup') {
    return 'Your cart includes alcohol. This order is being placed outside store hours, so please choose a preferred pickup time below. The store will use this window to prepare your order; it must fall within permitted alcohol sale times.'
  }
  return 'Your cart includes alcohol. This order is being placed outside store hours, so please choose a preferred delivery time below. The store will use this window to prepare your order; it must fall within permitted alcohol sale times.'
}

export function availableTimeTitle(mode: 'pickup' | 'delivery'): string {
  return mode === 'pickup' ? 'Available pickup time' : 'Available delivery time'
}
