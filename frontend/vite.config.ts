import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Dev: browser talks only to Vite (e.g. :5173); `/api/*` is proxied to the Express API (:4000).
 * Production: `npm run build` produces `dist/`. Nginx serves it directly and proxies `/api/*` to the
 * Node backend on `127.0.0.1:4000` (see `deploy/nginx/avotoday-split.conf`). The backend never serves
 * the SPA; `frontBackendSeparation` middleware returns JSON 404 for non-/api requests as defense in depth.
 */
const apiProxy = {
  '/api': {
    /** Align with `wait-on http://127.0.0.1:4000` — avoids some localhost/IPv6 mismatch edge cases on Windows. */
    target: 'http://127.0.0.1:4000',
    changeOrigin: true,
  },
} as const

export default defineConfig({
  root: __dirname,
  /** Load `.env` / `.env.local` from this folder so `VITE_*` lives next to the frontend package.json. */
  envDir: __dirname,
  plugins: [react()],
  server: {
    /** Prefer 5173; if busy, Vite uses the next free port — use the exact URL Vite prints in the terminal. */
    port: Number(process.env.VITE_DEV_PORT ?? 5173) || 5173,
    strictPort: false,
    proxy: { ...apiProxy },
  },
  preview: {
    proxy: { ...apiProxy },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
