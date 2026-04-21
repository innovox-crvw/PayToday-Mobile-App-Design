import { apiUrl } from './apiOrigin'

/** Turn stored `/api/...` paths into a browser-usable URL (Vite proxy or `VITE_API_BASE_URL`). */
export function resolveAdminMediaUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim()
  if (!t) return ''
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('/api/')) return apiUrl(t)
  return t
}
