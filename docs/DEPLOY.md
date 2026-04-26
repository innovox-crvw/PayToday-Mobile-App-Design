# PayToday Store — deployment and operations

## Repository layout

The repo is a single-git, **two-package** monorepo (no npm workspaces):

```
backend/    Node + Express + MS SQL API. Independent package.json / lockfile / dist.
frontend/   React + Vite SPA. Independent package.json / lockfile / dist.
deploy/     PowerShell deploy + rollback scripts and Nginx config.
docs/       Documentation. (This file.)
```

The two packages do **not** import from each other. They are built, tested, and deployed independently.

## Production runtime topology

A single VM behind Nginx:

- **Nginx** is the only public entry point on `avotoday.today-ww.net`.
  - Serves the SPA from `/var/www/avotoday-frontend/current/dist/`.
  - Proxies `/api/*` (and `/api/webhooks/*`) to the backend on `127.0.0.1:4000`.
- **Backend** runs as the PM2 app `avotoday-backend` from `/var/www/avotoday-backend/current`.
  - Bound to `127.0.0.1:4000` (loopback only — never reachable from the public internet).
  - All third-party API access (future) terminates at Nginx, not the Node process; rate limits / IP allow-lists / API keys are applied there.
- **Frontend** is plain static files. No PM2.

Deploys are independent:

- `deploy/avotoday-backend-production.ps1` builds `backend/`, tarballs `dist/` + `package*.json` + `migrations/` + a generated `ecosystem.config.cjs`, SCPs to the VM, runs `npm ci --omit=dev` + PM2 restart, then health-checks `http://127.0.0.1:4000/api/health`.
- `deploy/avotoday-frontend-production.ps1` builds `frontend/`, tarballs only `dist/`, SCPs to the VM, atomically swaps `current` → new release. No PM2, no remote `npm ci`.

The full runbook is **[`deploy/avotoday-rollout.md`](../deploy/avotoday-rollout.md)**. The one-shot migration from the old combined deploy is **[`deploy/avotoday-cutover.md`](../deploy/avotoday-cutover.md)**.

## Local development (two terminals)

Terminal 1 — backend:

```bash
cd backend
docker compose up -d            # MS SQL Server 2022 on :1433 (uses backend/docker-compose.yml)
cp .env.example .env            # set SQL_CONNECTION_STRING + JWT_SECRET
npm install
npm run db:demo-setup           # demo schema + products + users + migrations
npm run dev                     # tsx watcher; binds 0.0.0.0:4000 in dev
```

Terminal 2 — frontend:

```bash
cd frontend
cp .env.example .env            # usually fine as-is for local
npm install
npm run dev                     # Vite, default :5173, proxies /api/* -> 127.0.0.1:4000
```

The Vite dev server proxies `/api/*` to the local backend (see `frontend/vite.config.ts`), so the SPA hits relative `/api/...` URLs in dev exactly like in prod. CORS / cookies behave the same as same-origin.

`BIND_HOST` defaults to `0.0.0.0` in dev so phones / LAN devices on the same network can also hit the API directly. In production it defaults to `127.0.0.1`.

## Local SQL Server (no Docker)

1. Install [SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) (Express/Developer is fine) or use an existing instance.
2. Ensure database **`paytoday`** exists: keep `Database=paytoday` in `backend/.env` and run **`cd backend && npm run db:prepare`** (connects to `master` and creates the DB when your login allows it), or create the database manually in SSMS.
3. Set **`SQL_CONNECTION_STRING`** in **`backend/.env`** to your instance (see `backend/.env.example`). For local dev, `Encrypt=true;TrustServerCertificate=true` is typical.
4. Apply schema: `cd backend && npm run db:migrate`.
5. `cd backend && npm run dev` — the API logs whether MS SQL connected.

## Environment variables

Backend variables live in `backend/.env` (local) or `/var/www/avotoday-backend/shared/.env` (server). Frontend `VITE_*` values live in `frontend/.env` (local) or `frontend/.env.production` on the build machine — they are baked into the static bundle at build time.

### Backend (server-only)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 4000) |
| `BIND_HOST` | Network interface to bind. Production default: `127.0.0.1` (loopback / Nginx only). Dev default: `0.0.0.0`. |
| `JWT_SECRET` | Signing secret for session JWT (required in production) |
| `SQL_CONNECTION_STRING` | MS SQL connection string |
| `CORS_ORIGINS` | Comma-separated browser origins allowed with credentials |
| `PUBLIC_STORE_URL` | SPA origin for redirects after payment (no trailing slash), e.g. `https://avotoday.today-ww.net` |
| `PUBLIC_API_URL` | API origin exposed to PayToday for **return URL** (`GET /api/payments/return?...`); must match what Forms is configured to call. Same value as `PUBLIC_STORE_URL` in the same-domain split topology. |
| `PAYTODAY_FORMS_BASE_URL` | Base URL for hosted payment redirect |
| `PAYTODAY_FORMS_API_URL` | Optional server-to-server Forms API URL |
| `PAYTODAY_VENDOR_ID` / `PAYTODAY_BUSINESS_ID` | Forms integration identifiers |
| `PAYTODAY_WEBHOOK_SECRET` | HMAC secret for `POST /api/webhooks/paytoday` (required in production) |
| `SHIPPING_FLAT_CENTS` / `VAT_RATE_BPS` | Checkout totals (flat shipping, VAT in basis points) |
| `COOKIE_SAME_SITE` | `strict`, `lax`, or `none` (embed / cross-site needs `none` + HTTPS) |
| `REFRESH_COOKIE_NAME` | Refresh token cookie name (default `pt_refresh`) |
| `NOTIFICATION_APP_WEBHOOK_URL` | Optional URL the outbox worker POSTs for in-app delivery |
| `SMTP_*` / `NOTIFICATION_EMAIL_FROM` | Optional email sending from the outbox worker |
| `ALLOW_DEV_ROLE_HEADER` | Set `true` only in dev to allow `X-Dev-Role` on login when DB is down |
| `PRODUCT_IMAGE_UPLOAD_DIR` | Override path for admin product image uploads (default: `./data/uploads/products` under the active release) |

### Frontend (build time)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | API base URL. **Empty** in same-domain prod (the SPA hits relative `/api/*`). Set to a full origin only when serving the SPA and API on different hosts. |
| `VITE_DEV_PORT` | Override the Vite dev server port (default 5173). |

## Migrations

```bash
cd backend
SQL_CONNECTION_STRING="..." npm run db:migrate
```

Runs `backend/migrations/*.sql` in order and records versions in `schema_migrations`.

## Cookies and embedded WebView

- **Access** session: short-lived `httpOnly` JWT (`AUTH_COOKIE_NAME`, default `pt_session`, ~24h).
- **Refresh** session: `httpOnly` cookie (`REFRESH_COOKIE_NAME`, default `pt_refresh`, ~30d); `POST /api/auth/refresh` issues a new access token.
- Cart guest session: `pt_cart_session`.
- **Payment return URL**: PayToday should redirect the browser to  
  `{PUBLIC_API_URL}/api/payments/return?orderId={guid}&status=success`  
  (or your agreed query shape). The API calls the same idempotent paid handler as the webhook, then redirects to  
  `{PUBLIC_STORE_URL}/checkout/success?orderId=...` or `/checkout/failure`.
- For PayToday App WebViews, set `COOKIE_SAME_SITE=none` and serve over **HTTPS** so `Secure` cookies work cross-site.

## Webhook

- Path: `POST /api/webhooks/paytoday` (raw body, **not** behind CSRF).
- Header: `X-PayToday-Signature` = hex HMAC-SHA256 of raw body with `PAYTODAY_WEBHOOK_SECRET`.
- JSON body must include an event id (`eventId`, `id`, `paymentId`, or `reference`) and for payment capture: `orderId` or `reference` like `PTSTORE-{guid}`, plus `status: "paid"` (or `success: true`).

## Security checklist before production

- Backend bound to `127.0.0.1:4000` (verify with `ss -tlnp` after deploy).
- Firewall blocks inbound `4000` even if the bind host changes (defense in depth).
- Remove or disable `ALLOW_DEV_ROLE_HEADER`.
- Enforce strong `JWT_SECRET` and `PAYTODAY_WEBHOOK_SECRET`.
- TLS termination at Nginx; set `TRUST_PROXY=true` and cookie `secure: true`.
- Rate-limit `/api/auth/*` and webhooks at the Nginx layer.
- Future third-party APIs: separate Nginx server block (e.g. `api.avotoday.today-ww.net`) with `limit_req`, IP allow-lists, or API keys. The backend stays on the same loopback bind.

## AvoToday production host (`avotoday.today-ww.net`)

The split rollout is documented in **[`deploy/avotoday-rollout.md`](../deploy/avotoday-rollout.md)** with scripts:

- [`deploy/avotoday-backend-production.ps1`](../deploy/avotoday-backend-production.ps1) / [`deploy/rollback-avotoday-backend.ps1`](../deploy/rollback-avotoday-backend.ps1)
- [`deploy/avotoday-frontend-production.ps1`](../deploy/avotoday-frontend-production.ps1) / [`deploy/rollback-avotoday-frontend.ps1`](../deploy/rollback-avotoday-frontend.ps1)
- Nginx config: [`deploy/nginx/avotoday-split.conf`](../deploy/nginx/avotoday-split.conf)
- `shared/.env` templates: [`deploy/env.avotoday.backend.production.template`](../deploy/env.avotoday.backend.production.template), [`deploy/env.avotoday.frontend.production.template`](../deploy/env.avotoday.frontend.production.template)
- One-shot migration: [`deploy/avotoday-cutover.md`](../deploy/avotoday-cutover.md)
