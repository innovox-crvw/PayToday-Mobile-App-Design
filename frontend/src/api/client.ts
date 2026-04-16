import { apiUrl } from '../lib/apiOrigin'
import { CSRF_HEADER } from './constants'

let csrfToken: string | null = null

/**
 * Parse a fetch `Response` as JSON. If the body is HTML (common when `/api` hits the SPA or a proxy error),
 * throw a message that points to API / Vite setup instead of `Unexpected token '<'`.
 */
export async function readResponseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  const head = text.trimStart().slice(0, 12).toLowerCase()
  if (head.startsWith('<!doctype') || head.startsWith('<html')) {
    throw new Error(
      'The server returned HTML instead of JSON. Start the API on port 4000 (`npm run dev` runs it with Vite), or set VITE_API_BASE_URL in the project root .env to your API (e.g. http://127.0.0.1:4000) and restart Vite.',
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text.trim().slice(0, 280) || `Invalid JSON (HTTP ${res.status})`)
  }
}

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(apiUrl('/api/csrf'), { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`CSRF failed: ${res.status}`)
  }
  const data = await readResponseJson<{ csrfToken: string }>(res)
  csrfToken = data.csrfToken
  return csrfToken
}

async function ensureCsrfForMutation(method: string): Promise<void> {
  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD') return
  if (!csrfToken) {
    await fetchCsrfToken()
  }
}

export async function apiFetch(path: string, init: RequestInit = {}, allowRefreshRetry = true): Promise<Response> {
  const method = init.method ?? 'GET'
  await ensureCsrfForMutation(method)
  const headers = new Headers(init.headers)
  if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD' && csrfToken) {
    headers.set(CSRF_HEADER, csrfToken)
  }
  const url = path.startsWith('http://') || path.startsWith('https://') ? path : apiUrl(path)
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  })
  if (
    res.status === 401 &&
    allowRefreshRetry &&
    path !== '/api/auth/refresh' &&
    !path.startsWith('/api/auth/login') &&
    !path.startsWith('/api/auth/register')
  ) {
    const refresh = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', credentials: 'include' })
    if (refresh.ok) {
      return apiFetch(path, init, false)
    }
  }
  return res
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await readResponseJson<T>(res)
  if (!res.ok) {
    const err = (body as { error?: string }).error
    if (typeof err === 'string' && err.trim()) throw new Error(err.trim())
    throw new Error(`Request failed: ${res.status}`)
  }
  return body
}
