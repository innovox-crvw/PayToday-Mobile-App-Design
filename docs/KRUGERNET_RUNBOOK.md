# KRUGERNET / production runbook — PayToday Store

## Pre-deploy

1. Apply migrations in order: `npm run db:migrate` against production SQL (see `backend/migrations/`).
2. Set all variables from `docs/DEPLOY.md` and `backend/.env.example`; confirm `JWT_SECRET` and `PAYTODAY_WEBHOOK_SECRET` are strong and unique.
3. Set `PUBLIC_STORE_URL` and `PUBLIC_API_URL` to customer-facing SPA and API origins (no trailing slashes).
4. Register webhook URL `POST https://<api>/api/webhooks/paytoday` with PayToday; confirm HMAC header name matches production (`X-PayToday-Signature`).
5. Configure PayToday Forms **return URL** to hit `GET https://<api>/api/payments/return` with the agreed query parameters (`orderId` / `reference`, success/failure flags).
6. Disable `ALLOW_DEV_ROLE_HEADER`; set `NODE_ENV=production`.

## Deploy

1. Build: `npm run build` (Vite client + API).
2. Start API: `npm run start:api` (or process manager) on the configured `PORT`.
3. Serve `dist/` behind TLS; reverse-proxy `/api` to the API origin with **WebSocket/long-polling** not required — standard HTTP is enough.
4. Smoke: `GET /api/health`, `GET /api/csrf`, sign-in, one catalog request.

## Post-deploy checks

- Webhook: send a sandbox event or use PayToday’s replay tool; confirm `200` and order moves to **paid** once.
- Return URL: complete a test payment; browser should land on `/checkout/success` with the correct `orderId`.
- Notifications: confirm `notification_outbox` rows drain (logs or webhook to `NOTIFICATION_APP_WEBHOOK_URL` / SMTP).

## Rollback

1. Revert application binary/image to previous release.
2. **Do not** roll back migrations without a DBA plan; forward-fix data if a bad migration shipped.
3. If payment double-capture is suspected, inspect `payment_webhook_events`, `payment_return_events`, and order `status` before manual adjustments.

## Monitoring

- API 5xx rate and latency.
- Webhook failures (4xx/5xx) and signature errors.
- Outbox backlog: count rows where `sent_at IS NULL` (alert if growing).
- SQL connection errors in API logs.

## Incident: webhook secret rotated

1. Update `PAYTODAY_WEBHOOK_SECRET` and redeploy API.
2. Update the same secret in PayToday’s dashboard so new events verify.
3. Old events cannot be re-verified with the new secret; replay from PayToday if needed.
