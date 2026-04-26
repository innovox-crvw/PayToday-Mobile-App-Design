# Keycloak integration API (this application)

These routes are implemented by the **PayToday Store API** (`backend/src/routes/api/auth.ts`). They let the store API talk to **Keycloak's** token endpoint server-side on behalf of users; they are not a proxy to the full Keycloak Admin REST API.

All paths are prefixed with your API origin (e.g. `http://localhost:4000`). Mutating requests under `/api/*` (except documented exceptions) require **CSRF**: call `GET /api/csrf`, send the returned token in header `X-CSRF-Token` and keep the `pt_csrf` cookie. Use `credentials: 'include'` from the browser.

> **The SPA never redirects the user to Keycloak.** PayToday sign-in is performed entirely by
> `POST /api/auth/login` with `authSource: "paytoday"` — the backend calls the Keycloak token
> endpoint using the OAuth 2.0 Resource Owner Password Credentials grant and sets the same app
> session cookies as a local sign-in. No PKCE, no redirect URIs, no `/keycloak/callback`.

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| `GET` | `/api/auth/public-config` | No | Public hints (e.g. `paytodayForgotPasswordUrl`); no secrets. |
| `POST` | `/api/auth/login` | Yes | Store sign-in. Body: `{ email, password, authSource?: "local" \| "paytoday" }`. Default `local` uses SQL + bcrypt; `paytoday` calls Keycloak server-side. |
| `POST` | `/api/auth/register` | Yes | Creates a local (bcrypt) store account. Returns `409 paytoday_account_exists` when the email is already a PayToday user. |
| `GET` | `/api/auth/keycloak/routes` | No | Machine-readable list of Keycloak-related routes (this doc's index). |
| `GET` | `/api/auth/keycloak/status` | No | Which `/api/auth/login` methods the SPA may use right now. |

For the **auth model** and PayToday alignment, see [KEYCLOAK_AUTH_MODEL.md](./KEYCLOAK_AUTH_MODEL.md). For **env vars**, see [`backend/.env.example`](../backend/.env.example).

---

## `GET /api/auth/keycloak/routes`

Returns JSON describing the Keycloak-related API surface (no secrets).

```bash
curl -s http://localhost:4000/api/auth/keycloak/routes | jq .
```

---

## `GET /api/auth/keycloak/status`

Tells the SPA which `authSource` values are currently accepted by `POST /api/auth/login`.

**Response** (`200`, JSON):

| Field | Type | Meaning |
|-------|------|---------|
| `paytodaySignInEnabled` | boolean | `authSource: "paytoday"` works. `true` when `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, and `KEYCLOAK_CLIENT_ID` are all non-empty. |
| `localPasswordLoginAllowed` | boolean | Always `true`. Local store sign-in and registration are always available; role-based gating lives in `users.role`. |

```bash
curl -s http://localhost:4000/api/auth/keycloak/status | jq .
```

---

## `GET /api/auth/public-config`

Returns JSON only (no authentication). Example fields:

| Field | Type | Meaning |
|-------|------|---------|
| `paytodayForgotPasswordUrl` | string? | From `PAYTODAY_FORGOT_PASSWORD_URL` — optional link for the SPA's "Forgot password (PayToday)" control. |

---

## `POST /api/auth/login`

Same CSRF rules as other `POST /api/*` routes. Supports two `authSource` values — the SPA picks one based on the login form toggle and the result of `/api/auth/keycloak/status`.

- Omit `authSource` or send `authSource: "local"` — database bcrypt flow.
- `authSource: "paytoday"` — Keycloak Resource Owner Password Credentials grant, then the same app session cookies. Requires `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, and `KEYCLOAK_CLIENT_ID` (plus optional `KEYCLOAK_CLIENT_SECRET` for confidential clients).

PayToday users are always provisioned in `dbo.users` as `role = 'customer'`. Staff/admin access is granted by an administrator editing `users.role` in-app (see the admin users page).

**Error codes** (JSON body includes `code`):

| HTTP | `code` | Meaning |
|------|--------|---------|
| `409` | `use_paytoday_account` | The email is linked to a PayToday (Keycloak-backed) user. The SPA should switch the toggle to PayToday and retry. |
| `423` | `account_locked` | Too many failed sign-in attempts for this email (local bcrypt uses `users.failed_login_count`; pre-provisioned Keycloak users use `dbo.keycloak_login_throttle` — see migration `017_keycloak_login_throttle`). |
| `400` | `paytoday_login_failed` | `authSource: "paytoday"` but Keycloak is not configured (base URL / realm / client id missing). |
| `401`/`502` | `paytoday_login_failed` | Keycloak rejected the credentials or the token / userinfo request failed. |

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Cookie: pt_csrf=…" -H "X-CSRF-Token: …" \
  -d '{"email":"user@example.com","password":"…","authSource":"paytoday"}'
```

---

## `POST /api/auth/register`

Creates a local (bcrypt) store account. The SPA's registration form only ever creates local accounts — PayToday users sign up in PayToday, not here.

| HTTP | `code` | Meaning |
|------|--------|---------|
| `409` | `paytoday_account_exists` | The email is already a PayToday (Keycloak) user. The SPA should point them at the sign-in page with the PayToday tab selected. |
| `409` | _(unset)_ | A local account already exists for this email. |

---

## Keycloak server URLs (external)

Given `KEYCLOAK_BASE_URL` and `KEYCLOAK_REALM`, the store API calls exactly two realm endpoints:

- **Token**: `{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token`
- **Userinfo**: `{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo`

Your realm's **well-known** document is available at `{KEYCLOAK_BASE_URL}/realms/{KEYCLOAK_REALM}/.well-known/openid-configuration` — useful for verifying the token endpoint from a browser.

In Keycloak Admin → your realm → **Clients** → your client: set **Direct access grants** to ON. If the client is confidential, copy **Credentials → Client secret** into `KEYCLOAK_CLIENT_SECRET`. No callback / redirect URIs are required for this app.

**Staging:** Point `KEYCLOAK_BASE_URL` and `KEYCLOAK_REALM` in `.env` (or `dbo.integration_settings`) at your **staging** realm for local development; production uses the same variable names with production Keycloak. Application code loads hosts only via `mergeKeycloakRuntime` — no hardcoded Keycloak URLs in routes.

---

## Related frontend entry points

| Area | File |
|------|------|
| Storefront / onboarding sign-in + register (app-native UI) | `frontend/src/pages/onboarding/OnboardingLoginPage.tsx` |
| Admin sign-in (app-native UI) | `frontend/src/pages/admin/AdminLoginPage.tsx` |
| Shared `/api/auth/keycloak/status` hook | `frontend/src/hooks/useAuthMethods.ts` |

---

## Tests

Smoke coverage includes `GET /api/auth/keycloak/routes`, `GET /api/auth/keycloak/status` (shape check), `authSource: "paytoday"` behaviour when Keycloak is unconfigured, and regression checks that the old PKCE endpoints respond 404: `tests/api.smoke.test.ts`.
