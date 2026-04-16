# PayToday end-to-end smoke checklist

Use this after configuring `.env` (see [`.env.example`](../.env.example) and the onboarding table at the top of that file). Adapt hosts to your staging API and storefront.

## Preconditions

- API running with valid `JWT_SECRET`, `PUBLIC_API_URL`, `PUBLIC_STORE_URL`.
- PayToday **Payment Intent** variables set when using hosted pay: `PAYTODAY_PAYMENT_INTENT_URL`, `PAYTODAY_VENDOR_ID`, `PAYTODAY_BUSINESS_ID` (see [PAYTODAY_PAYMENT_INTENT_FRONTEND.md](./PAYTODAY_PAYMENT_INTENT_FRONTEND.md)).
- MS SQL running and migrations applied if you need real checkout (otherwise checkout returns 503).

## 1. Health and CSRF

1. `GET {PUBLIC_API_URL}/api/health` → `200`, `ok: true`.
2. `GET {PUBLIC_API_URL}/api/csrf` → `200`, note `csrfToken` for mutations.

## 2. Storefront config

1. `GET {PUBLIC_API_URL}/api/storefront-config` → includes `checkoutRequireSignIn` (boolean).
2. If `CHECKOUT_REQUIRE_SIGN_IN=true` in API env, confirm the SPA checkout shows the sign-in requirement and disables pay until `/api/auth/me` returns a user.

## 3. Checkout → redirect URL (authenticated path)

1. Sign in via the SPA (email/password or Keycloak OIDC) so cookies exist.
2. Add a line item to the cart (or use whatever catalog flow you use).
3. `POST {PUBLIC_API_URL}/api/checkout` with headers:
   - `Content-Type: application/json`
   - `X-CSRF-Token: <token from /api/csrf>`
   - Cookie jar from the browser session (or tool that preserves `pt_session` / CSRF cookie).
   - Optional: `Idempotency-Key: <uuid>`.
4. Body: valid `deliveryMethod`, `depositLocationId` or `shippingAddressId` per [CheckoutPage](../frontend/src/pages/store/CheckoutPage.tsx) rules.
5. Expect `200` and JSON containing `redirectUrl` when PayToday env is configured; otherwise expect a clear `4xx`/`503` error from the API (never a PayToday secret in the response).

## 4. Browser redirect

1. Open `redirectUrl` in the browser; complete or cancel payment in PayToday’s sandbox as appropriate.

## 5. Return URL

1. After payment, PayToday should redirect to `GET {PUBLIC_API_URL}/api/payments/return?...` (query shape per PayToday contract).
2. Expect `302` to `{PUBLIC_STORE_URL}/checkout/success?orderId=...` or `/checkout/failure?...` (see [paymentReturn.ts](../backend/src/routes/api/paymentReturn.ts)).
3. Automated smoke (no SQL): `tests/api.smoke.test.ts` covers basic return URL behaviour.

## 6. Webhook

1. `POST {PUBLIC_API_URL}/api/webhooks/paytoday` with valid `X-PayToday-Signature` over the **raw** body (see [DEPLOY.md](./DEPLOY.md)).
2. Replay the same event id; expect idempotent handling (`duplicate: true` on second post in smoke test).

## 7. Secrets

- Confirm the browser **never** receives `PAYTODAY_VENDOR_ID`, `PAYTODAY_BUSINESS_ID`, or Keycloak **client_secret** in JSON from your app.
- Keycloak ROPC (`/api/auth/keycloak/ro-password`) must not return Keycloak access tokens in the response body; only session cookies.

## 8. Optional Keycloak ROPC

1. With `KEYCLOAK_ROPC_LOGIN_ENABLED=true` and full ROPC env, `POST /api/auth/keycloak/ro-password` with CSRF + JSON credentials → `200` and `ok: true`.
2. With flag `false`, same request → `404`.
