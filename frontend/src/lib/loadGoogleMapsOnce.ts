/** Loads Maps JavaScript API once (classic script + global callback). */

let inflight: Promise<void> | null = null

export function loadGoogleMapsOnce(apiKey: string): Promise<void> {
  const w = window as unknown as { google?: { maps?: unknown } }
  if (w.google?.maps) return Promise.resolve()
  if (inflight) return inflight
  inflight = new Promise((resolve, reject) => {
    const cbName = `__paytodayGmapsInit_${Date.now()}`
    ;(window as unknown as Record<string, unknown>)[cbName] = () => {
      resolve()
      delete (window as unknown as Record<string, unknown>)[cbName]
    }
    const s = document.createElement('script')
    s.async = true
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${cbName}`
    s.onerror = () => {
      inflight = null
      reject(new Error('Could not load Google Maps'))
    }
    document.head.appendChild(s)
  })
  return inflight
}
