function formatInstant(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Human-readable home delivery window from API ISO timestamps and optional label. */
export function formatHomeDeliveryWindow(start: string, end: string, label: string | null): string {
  const range = `${formatInstant(start)} – ${formatInstant(end)}`
  const trimmed = label?.trim()
  return trimmed ? `${trimmed}: ${range}` : range
}
