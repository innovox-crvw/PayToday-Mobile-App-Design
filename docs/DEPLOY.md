# PayToday Store — deployment and operations

## Runtime

- **API**: Node.js 20+, `npm run build` then `npm run start:api` (serves `/api` only).
- **Web**: static files from `dist/` after `npm run build` (Vite); configure reverse proxy to forward `/api` to the API origin, or set `VITE_*` public API URL if split-hosted.
- **Database**: Microsoft SQL Server; set `SQL_CONNECTION_STRING` (see `.env.example`).

## Local database (Docker)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2).
2. From the project root: `docker compose up -d`  
   This starts SQL Server 2022 on port **1433** with the password in `docker-compose.yml` / `.env.example`.
3. Copy `.env.example` to `.env` and ensure `SQL_CONNECTION_STRING` matches (same `sa` password and `Database=paytoday`).
4. Create the database, load **demo schema + products + users**, then apply newer migrations:  
   - **`npm run db:demo-setup`** — runs `db:prepare`, then **`db:bootstrap`** (executes [`backend/scripts/paytoday-full-setup.sql`](../backend/scripts/paytoday-full-setup.sql); **dev reset**, drops core tables), then `db:migrate`.  
   - For an **existing** database that already has the full catalogue, use **`npm run db:setup`** (`db:prepare` + `db:migrate` only).  
   - `db:prepare` connects to `master` and creates `paytoday` when missing (retries while the container starts).
5. Start the app: `npm run dev` — the API uses `SQL_CONNECTION_STRING` from `.env` via `dotenv`.

Stop the container (data kept in volume): `docker compose down`. Remove data: `docker compose down -v`.

## Local SQL Server (no Docker)

1. Install [SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads) (Express/Developer is fine) or use an existing instance.
2. Ensure database **`paytoday`** exists: keep `Database=paytoday` in `.env` and run **`npm run db:prepare`** (connects to `master` and creates the DB when your login allows it), or create the database manually in SSMS.
3. Set **`SQL_CONNECTION_STRING`** in **`.env`** to your instance (see `.env.example`). For local dev, `Encrypt=true;TrustServerCertificate=true` is typical.
4. Apply schema: **`npm run db:migrate`**
5. **`npm run dev`** — the API logs whether MS SQL connected.

Project files involved: **`docker-compose.yml`** (containerized SQL), **`.env`** / **`.env.example`** (link string), **`backend/migrations/*.sql`** (schema and seed data).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 4000) |
| `JWT_SECRET` | Signing secret for session JWT (required in production) |
| `SQL_CONNECTION_STRING` | MS SQL connection string |
| `CORS_ORIGINS` | Comma-separated browser origins allowed with credentials |
| `PUBLIC_STORE_URL` | SPA origin for redirects after payment (no trailing slash), e.g. `https://store.example.com` |
| `PUBLIC_API_URL` | API origin exposed to PayToday for **return URL** (`GET /api/payments/return?...`); must match what Forms is configured to call |
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

## Migrations

```bash
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

- Remove or disable `ALLOW_DEV_ROLE_HEADER`.
- Enforce strong `JWT_SECRET` and `PAYTODAY_WEBHOOK_SECRET`.
- TLS termination at reverse proxy; set cookie `secure: true`.
- Rate-limit `/api/auth/*` and webhooks at the edge.

## AvoToday production host (`avotoday.today-ww.net`)

PowerShell + SSH + PM2 rollout (Option C: unified Node serving `dist` + `/api`) is documented in **[`deploy/avotoday-rollout.md`](../deploy/avotoday-rollout.md)** with scripts [`deploy/avotoday-production.ps1`](../deploy/avotoday-production.ps1) and [`deploy/rollback-avotoday-production.ps1`](../deploy/rollback-avotoday-production.ps1), an Nginx example under [`deploy/nginx/`](../deploy/nginx/), and a **`shared/.env` template**: [`deploy/env.avotoday.production.template`](../deploy/env.avotoday.production.template).
