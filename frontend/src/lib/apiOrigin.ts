/**
 * Base URL for the Express API (no trailing slash).
 * - Unset in dev: use relative `/api/*` so Vite’s dev server proxies to port 4000 (normal Chrome + `npm run dev`).
 * - Set `VITE_API_BASE_URL=http://localhost:4000` when the SPA is opened **without** that proxy (e.g. Cursor/VS Code
 *   Simple Browser, static preview, or LAN device) so every `fetch(apiUrl(...))` hits the API and the server logs requests.
 */
const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
export const API_BASE_URL = (raw ?? '').replace(/\/$/u, '')

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}${p}` : p
}

/** Parse JSON `{ error }` or plain text from a failed API response. */
export async function readApiError(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const j = JSON.parse(text) as { error?: string; message?: string }
    if (typeof j.error === 'string') return j.error
    if (typeof j.message === 'string') return j.message
  } catch {
    /* ignore */
  }
  return text.trim() || `Request failed (${res.status})`
}
