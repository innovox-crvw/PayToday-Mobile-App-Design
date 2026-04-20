# Keycloak authentication in this store

**HTTP API reference (paths, CSRF, examples):** [KEYCLOAK_API.md](./KEYCLOAK_API.md).

PayToday's minimal integration guide shows `POST /api/login` with username and password forwarded to Keycloak's token endpoint. This repository does exactly that on the server side: the SPA has its own app-native sign-in/register UI and the API calls Keycloak on the user's behalf.

## How PayToday / Keycloak sign-in works here

- **Route:** `POST /api/auth/login` with JSON `{ "email", "password", "authSource": "paytoday" }`. There is only one PayToday sign-in endpoint — the SPA uses the same login form for every auth source and picks between them via the `authSource` toggle.
- **Flow:** SPA posts email + password to the API → API calls `{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token` with the **Resource Owner Password Credentials** grant → API fetches `/userinfo` → the local `dbo.users` row is upserted (linked by `keycloak_sub`) as `role = 'customer'` → the API issues **application session cookies** (JWT access + refresh), the same cookies a local bcrypt sign-in would set.
- **Env:** `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, and optional `KEYCLOAK_CLIENT_SECRET` (confidential clients). `PAYTODAY_FORGOT_PASSWORD_URL` is an optional link surfaced by `GET /api/auth/public-config`.
- **Enablement:** PayToday sign-in turns itself on automatically when the three required variables are non-empty. There is **no separate feature flag** — `GET /api/auth/keycloak/status` reports `paytodaySignInEnabled: true` in that state, the SPA's PayToday toggle becomes enabled, and `POST /api/auth/login` with `authSource: "paytoday"` stops returning `400 paytoday_login_failed`.
- **Why:** The client secret and tokens stay server-side; no Keycloak access token is returned to the browser. The SPA never redirects the user to Keycloak.

This is what the storefront and admin login pages use ([`frontend/src/pages/onboarding/OnboardingLoginPage.tsx`](../frontend/src/pages/onboarding/OnboardingLoginPage.tsx), [`frontend/src/pages/admin/AdminLoginPage.tsx`](../frontend/src/pages/admin/AdminLoginPage.tsx)).

### Front-channel OIDC PKCE (removed)

Earlier versions of this app exposed `GET /api/auth/keycloak/start` and `POST /api/auth/keycloak/callback` for a browser-redirect PKCE flow, plus a "Continue with Keycloak" button. Those endpoints and the callback page have been removed — the server-side password grant is the only supported path for PayToday sign-in now. You do **not** need any `/keycloak/callback` redirect URIs configured in your Keycloak realm for this app.

## Role mapping (app-managed)

- Every PayToday user is provisioned in `dbo.users` as `role = 'customer'`. Existing rows are **never** role-updated by the Keycloak login flow.
- Staff / admin access (`role` ∈ `admin` / `ops` / `fulfillment`) is granted in-app on the admin users page by editing `users.role`. The middleware and admin routes rely on that column; Keycloak realm roles are **not** consulted. This means `KEYCLOAK_REALM_ROLE_*` environment variables are not part of the integration.

## Account lockout

Both local bcrypt and PayToday sign-in respect the same lockout window (`AUTH_LOCKOUT_MAX_ATTEMPTS`, `AUTH_LOCKOUT_MINUTES`). For emails that don't yet have a `dbo.users` row (e.g. a first-time PayToday sign-in that keeps failing), attempts are counted in `dbo.keycloak_login_throttle` (migration `017_keycloak_login_throttle`). Either source returns `423` with `code: "account_locked"`.

## Local accounts stay available

There is no "Keycloak-only" mode. Local bcrypt sign-in (`authSource: "local"`) and registration (`POST /api/auth/register`) are always accepted server-side. Gate admin / staff features via `users.role` rather than disabling the local password branches.

## Confirm with PayToday

Ask PayToday whether the Keycloak realm's client has **Direct access grants ON** (Resource Owner Password Credentials) for the audience this app uses, and whether they want a dedicated app-channel client separate from their own storefront client. Align Keycloak client configuration (allowed grant types, confidential vs public) with that answer before enabling PayToday sign-in in production.
