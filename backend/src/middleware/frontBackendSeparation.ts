import type { RequestHandler } from 'express'

function normalizePath(reqPath: string): string {
  return reqPath.startsWith('/') ? reqPath : `/${reqPath}`
}

/** True when the request targets the JSON / webhook API surface. */
export function isApiPath(reqPath: string): boolean {
  return normalizePath(reqPath).startsWith('/api')
}

/**
 * Defense-in-depth gate: this Express process serves the JSON API only.
 *
 * - Requests under `/api` continue to the Express stack (webhooks, JSON body, `apiRouter`).
 * - `GET /` redirects to `/api/health` for ad-hoc curls from the VM.
 * - Any other path returns a JSON 404 — no HTML, no static assets, no SPA fallback.
 *
 * The SPA is served by Nginx from `/var/www/avotoday-frontend/current/dist`. Nginx proxies
 * `/api/*` to the backend on `127.0.0.1:4000`; the backend never serves the SPA itself.
 *
 * Dev: Vite (`frontend/vite.config.ts`) proxies `/api/*` from the SPA dev server (5173) to this
 * process (4000). This middleware is still active and returns the JSON 404 for non-/api hits.
 */
export function gatewaySeparateApiLayer(): RequestHandler {
  return (req, res, next) => {
    const p = normalizePath(req.path)

    if (p.startsWith('/api')) return next()

    if (req.method === 'OPTIONS') return next()

    if (p === '/' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, '/api/health')
      return
    }

    res.status(404).type('application/json').send(
      JSON.stringify({
        error: 'NOT_FOUND',
        message:
          'This host serves the PayToday HTTP API under /api only. The SPA is served separately by Nginx from the frontend release tree.',
      }),
    )
  }
}
