function parseDate(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatHomeDeliveryWindow(startIso: string, endIso: string, label?: string | null): string {
  const labelText = label?.trim()
  if (labelText) return labelText

  const start = parseDate(startIso)
  const end = parseDate(endIso)
  if (!start || !end) return 'Scheduled delivery window'

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (isSameDay(start, end)) {
    return `${dateFmt.format(start)} ${timeFmt.format(start)} - ${timeFmt.format(end)}`
  }
  return `${dateFmt.format(start)} ${timeFmt.format(start)} - ${dateFmt.format(end)} ${timeFmt.format(end)}`
}
