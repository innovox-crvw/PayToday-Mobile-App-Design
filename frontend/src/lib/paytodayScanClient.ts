/**
 * Browser-side PayToday scan/pay API base URL. When unset, flows stay in placeholder mode.
 * Mirror server `PAYTODAY_SCAN_API_BASE_URL` if you add a BFF later.
 */
const raw = import.meta.env.VITE_PAYTODAY_SCAN_API_BASE_URL as string | undefined

export const paytodayScanApiBaseUrl = (raw ?? '').replace(/\/$/u, '')

export function isScanApiConfigured(): boolean {
  return paytodayScanApiBaseUrl.length > 0
}

export async function scanApiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!isScanApiConfigured()) {
    throw new Error('PayToday scan API base URL is not configured (set VITE_PAYTODAY_SCAN_API_BASE_URL).')
  }
  const p = path.startsWith('/') ? path : `/${path}`
  return fetch(`${paytodayScanApiBaseUrl}${p}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  })
}
