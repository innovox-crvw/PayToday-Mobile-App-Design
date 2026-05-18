import { apiUrl, API_BASE_URL } from '../lib/apiOrigin'
import { CSRF_COOKIE_NAME, CSRF_HEADER } from './constants'

let csrfToken: string | null = null

/** Prefer the live cookie value so the `X-CSRF-Token` header always matches what the browser sends. */
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null
  const parts = document.cookie.split(';')
  const prefix = `${CSRF_COOKIE_NAME}=`
  for (const part of parts) {
    const s = part.trim()
    if (s.startsWith(prefix)) {
      try {
        return decodeURIComponent(s.slice(prefix.length))
      } catch {
        return s.slice(prefix.length)
      }
    }
  }
  return null
}

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

function csrfReachabilityHint(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    if (API_BASE_URL) {
      return ` The API at ${API_BASE_URL} returned HTTP ${status} (unreachable or bad gateway). Fix that URL or start the backend there.`
    }
    return ` HTTP ${status} usually means the dev proxy could not reach the Express API on port 4000. From the download folder (where the root package.json lives), run \`npm run dev\` — that starts the API and Vite together. Or in a separate terminal: \`cd PayToday-Mobile-App-Design-main/backend && npm run dev\`. If the API uses another port, set \`DEV_API_PROXY\` in \`PayToday-Mobile-App-Design-main/frontend/.env.local\` (see \`.env.example\`) and restart Vite, or set \`VITE_API_BASE_URL\` to the full API origin.`
  }
  return ''
}

export async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(apiUrl('/api/csrf'), { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`CSRF token request failed: HTTP ${res.status}.${csrfReachabilityHint(res.status)}`)
  }
  const data = await readResponseJson<{ csrfToken: string }>(res)
  const fromCookie = readCsrfCookie()
  csrfToken = fromCookie ?? data.csrfToken
  if (import.meta.env.DEV && typeof document !== 'undefined' && !fromCookie) {
    console.warn(
      '[api] CSRF cookie not visible after GET /api/csrf — sign-in may fail with "CSRF validation failed" (common: SameSite=None+Secure on HTTP, or SPA/API on different hosts). Prefer same-origin /api via Vite proxy, or set COOKIE_SAME_SITE=lax for HTTP dev; add your phone URL to CORS_ORIGINS if using a separate API origin.',
    )
  }
  return csrfToken
}

async function ensureCsrfForMutation(method: string): Promise<void> {
  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD') return
  const fromCookie = readCsrfCookie()
  if (fromCookie) {
    csrfToken = fromCookie
    return
  }
  if (!csrfToken) {
    await fetchCsrfToken()
  }
}

export async function apiFetch(path: string, init: RequestInit = {}, allowRefreshRetry = true): Promise<Response> {
  const method = init.method ?? 'GET'
  await ensureCsrfForMutation(method)
  const headers = new Headers(init.headers)
  if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
    const headerToken = readCsrfCookie() ?? csrfToken
    if (headerToken) {
      headers.set(CSRF_HEADER, headerToken)
    }
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
    const refresh = await apiFetch('/api/auth/refresh', { method: 'POST' }, false)
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
