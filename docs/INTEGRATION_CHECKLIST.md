# PayToday integration checklist

Use this before staging/production cutover.

## Forms API (payment redirect)

- [ ] Read **`docs/PAYTODAY_PAYMENT_INTENT_FRONTEND.md`** — SPA must use **`POST /api/checkout`**, not PayToday’s URL from the browser (keeps `vi` / `business_id` secret).
- [ ] Onboarding name mapping (guide → env vars): see the table at the top of **`.env.example`**. Keycloak HTTP API: **`docs/KEYCLOAK_API.md`** (or `GET /api/auth/keycloak/routes`). Keycloak modes: **`docs/KEYCLOAK_AUTH_MODEL.md`**. Manual E2E steps: **`docs/PAYTODAY_E2E_SMOKE.md`**.
- [ ] Obtain **vendor ID (vi)**, **business ID**, and environment **base URL** from PayToday.
- [ ] Confirm HTTP method and JSON shape for creating a payment session (or confirm query-string hosted form if that is the supported model).
- [ ] Set `PAYTODAY_FORMS_BASE_URL` and/or `PAYTODAY_FORMS_API_URL` in `.env`.
- [ ] Set `PUBLIC_STORE_URL` to the customer-facing origin (used for `returnUrl` / `cancelUrl`).
- [ ] Test redirect in sandbox; confirm `reference` matches `PTSTORE-{orderGuid}`.

## Webhook

- [ ] Register `POST https://<api-host>/api/webhooks/paytoday` with PayToday.
- [ ] Set `PAYTODAY_WEBHOOK_SECRET` and verify header name (e.g. `X-PayToday-Signature`) matches production docs.
- [ ] Send test events; confirm idempotent replay (same `eventId`).

## Return URL

- [ ] Confirm PayToday appends success/failure parameters your handler expects; adjust `backend/src/routes/api/paymentReturn.ts` if names differ.
- [ ] Test payment completion when webhook is **disabled** (return path only), then webhook only, then both orders.

## App channel (embed)

- [ ] Decide cookie policy: `COOKIE_SAME_SITE=none` + HTTPS for cross-site WebView, or same-site only.
- [ ] Confirm whether App passes identity (JWT / SSO) into the WebView for auto-login.

## Email / in-app notifications

- [ ] Configure SMTP or provider for `EMAIL_*` / `NOTIFICATION_EMAIL_FROM` (see `.env.example`) so the outbox worker can send mail.
- [ ] Provide PayToday App notification module endpoint and credentials for `in_app` channel.

## KRUGERNET / hosting

- [ ] Reverse proxy: `/api` → Node; static `dist/` for SPA; TLS termination.
- [ ] Run `npm run db:migrate` on deploy.
