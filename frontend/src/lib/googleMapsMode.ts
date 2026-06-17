/** Treat empty, "demo", or "placeholder" as non-live Maps (show static preview instead). */
export function mapsLiveApiKey(raw: string | undefined): string | null {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower === 'demo' || lower === 'placeholder' || lower === 'none') return null
  return t
}
