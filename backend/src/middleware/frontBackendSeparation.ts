import type { RequestHandler } from 'express'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

export type FrontBackendSeparationOptions = {
  /**
   * Absolute path to the Vite `dist` folder (must contain `index.html`).
   * When set, non-`/api` HTTP requests can serve the SPA + static assets from this host.
   */
  spaDistAbsolute?: string | undefined
}

function normalizePath(reqPath: string): string {
  return reqPath.startsWith('/') ? reqPath : `/${reqPath}`
}

/** True when the request targets the JSON / webhook API surface (not the browser SPA). */
export function isApiPath(reqPath: string): boolean {
  return normalizePath(reqPath).startsWith('/api')
}

/**
 * Separates the JSON API from everything else on this process:
 * - Routes under `/api` continue to the Express stack (webhooks, JSON body, `apiRouter`).
 * - When no SPA dist is configured: any other path returns a JSON 404; `GET /` redirects to `/api/health`.
 * - When `spaDistAbsolute` is set and contains `index.html`: non-`/api` requests fall through to
 *   static asset + SPA fallback middleware (registered after `/api` in `app.ts`).
 *
 * Dev: run Vite on :5173 with `vite.config.ts` proxying `/api` → Express (:4000); this middleware
 * is still active on the API process (API-only unless `SPA_STATIC_ROOT` points at `dist`).
 */
export function gatewaySeparateApiLayer(opts: FrontBackendSeparationOptions = {}): RequestHandler {
  const spaAbs = opts.spaDistAbsolute?.trim()
  const spaReady = Boolean(spaAbs && fs.existsSync(path.join(spaAbs, 'index.html')))

  return (req, res, next) => {
    const p = normalizePath(req.path)

    if (p.startsWith('/api')) return next()

    if (req.method === 'OPTIONS') return next()

    if (spaReady) return next()

    if (p === '/' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      res.redirect(302, '/api/health')
      return
    }

    res.status(404).type('application/json').send(
      JSON.stringify({
        error: 'NOT_FOUND',
        message:
          'This host serves the PayToday HTTP API under /api only. Run the storefront with Vite (npm run dev), or set SPA_STATIC_ROOT to your Vite build output (dist) to serve the SPA from this process.',
      }),
    )
  }
}

/** Serves `js`, `css`, `index.html` assets from the Vite build. Use after `/api` routes. */
export function spaStaticAssets(distAbs: string): RequestHandler {
  return express.static(distAbs, { index: false, fallthrough: true })
}

/** History-SPA fallback: GET/HEAD outside `/api` → `index.html`. */
export function spaHistoryFallback(distAbs: string): RequestHandler {
  const indexHtml = path.join(distAbs, 'index.html')
  return (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (!fs.existsSync(indexHtml)) return next()
    res.sendFile(indexHtml)
  }
}
