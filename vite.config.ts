import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = __dirname
const frontendRoot = path.join(repoRoot, 'frontend')

/**
 * Dev: browser talks only to Vite (e.g. :5173); `/api/*` is proxied to the Express API (:4000).
 * Production option: build the SPA (`npm run build`), set `SPA_STATIC_ROOT=dist`, run `npm run start:api`
 * so the API process serves `dist` and keeps JSON under `/api` (see `frontBackendSeparation` middleware).
 */
const apiProxy = {
  '/api': {
    /** Align with `wait-on http://127.0.0.1:4000` in npm `dev` — avoids some localhost/IPv6 mismatch edge cases on Windows. */
    target: 'http://127.0.0.1:4000',
    changeOrigin: true,
  },
} as const

export default defineConfig({
  root: frontendRoot,
  /** Load `.env` / `.env.local` from repo root (same folder as this file) so `VITE_*` lives next to the API `.env`. */
  envDir: repoRoot,
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
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
  },
})
