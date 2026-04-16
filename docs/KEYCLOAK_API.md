# Keycloak integration API (this application)

These routes are implemented by the **PayToday Store API** (`backend/src/routes/api/auth.ts`). They orchestrate **Keycloak’s** OpenID Connect endpoints; they are not a proxy to the full Keycloak Admin REST API.

All paths are prefixed with your API origin (e.g. `http://localhost:4000`). Mutating requests under `/api/*` (except documented exceptions) require **CSRF**: call `GET /api/csrf`, send the returned token in header `X-CSRF-Token` and keep the `pt_csrf` cookie. Use `credentials: 'include'` from the browser.

| Method | Path | CSRF | Purpose |
|--------|------|------|---------|
| `GET` | `/api/auth/public-config` | No | Public hints (e.g. `paytodayForgotPasswordUrl`); no secrets. |
| `POST` | `/api/auth/login` | Yes | Store sign-in. Body: `{ email, password, authSource?: "local" \| "paytoday" }`. Default `local` uses SQL + bcrypt; `paytoday` uses Keycloak ROPC when enabled (same session cookies as OIDC). |
| `GET` | `/api/auth/keycloak/routes` | No | Machine-readable list of Keycloak-related routes (this doc’s index). |
| `GET` | `/api/auth/keycloak/status` | No | Whether OIDC is configured, Keycloak-only mode, optional ROPC flag. |
| `GET` | `/api/auth/keycloak/start` | No | Returns `{ url }` — Keycloak authorize URL for PKCE sign-in. |
| `POST` | `/api/auth/keycloak/callback` | Yes | Exchanges authorization `code` for app session cookies. |
| `POST` | `/api/auth/keycloak/ro-password` | Yes | Optional resource-owner password grant → session cookies (disabled by default). |

For **auth model** (OIDC vs ROPC) and PayToday alignment, see [KEYCLOAK_AUTH_MODEL.md](./KEYCLOAK_AUTH_MODEL.md). For **env vars**, see [`.env.example`](../.env.example).

---

## `GET /api/auth/keycloak/routes`

Returns JSON describing the Keycloak-related API surface (no secrets).

**Example**

```bash
curl -s http://localhost:4000/api/auth/keycloak/routes | jq .
```

---

## `GET /api/auth/keycloak/status`

**Response** (`200`, JSON):

| Field | Type | Meaning |
|-------|------|---------|
| `enabled` | boolean | OIDC sign-in is usable (`KEYCLOAK_ISSUER` + `KEYCLOAK_CLIENT_ID` at minimum). |
| `clientId` | string? | OIDC client id exposed to the UI (not the secret). |
| `keycloakOnly` | boolean | Mirrors `KEYCLOAK_SIGN_IN_ONLY`. |
| `keycloakReady` | boolean? | When `keycloakOnly` is true: whether OIDC is actually configured. |
| `ropcLoginEnabled` | boolean | Whether `POST .../ro-password` and `POST .../login` with `authSource: "paytoday"` are allowed (feature flag + env-complete). |
| `localPasswordLoginAllowed` | boolean | `false` only when `KEYCLOAK_SIGN_IN_ONLY` is on and `KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN` is off; otherwise SQL email/password login/register stay available. |

**Example**

```bash
curl -s http://localhost:4000/api/auth/keycloak/status | jq .
```

---

## `GET /api/auth/public-config`

Returns JSON only (no authentication). Example fields:

| Field | Type | Meaning |
|-------|------|---------|
| `paytodayForgotPasswordUrl` | string? | From `PAYTODAY_FORGOT_PASSWORD_URL` — optional link for the storefront “Forgot password (PayToday)” control. |

---

## `POST /api/auth/login` (`authSource`)

Same CSRF rules as other `POST /api/*` routes. Supports NedAccess-style dual paths:

- Omit `authSource` or send `authSource: "local"` — existing database bcrypt flow (unless Keycloak-only mode blocks it).
- `authSource: "paytoday"` — Keycloak resource-owner password grant, then the same app session cookies as other sign-in methods. Requires `KEYCLOAK_ROPC_LOGIN_ENABLED=true` and token URL + confidential client env (see `.env.example`).

**Example**

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Cookie: pt_csrf=…" -H "X-CSRF-Token: …" \
  -d '{"email":"user@example.com","password":"…","authSource":"paytoday"}'
```

---

## `GET /api/auth/keycloak/start`

Starts the **authorization code + PKCE** flow. The SPA should generate PKCE verifier/challenge (see `frontend/src/lib/oauthPkce.ts`), then request this URL.

**Query parameters** (all required unless noted):

| Name | Value |
|------|--------|
| `redirect_uri` | Absolute callback URL on an **allowed origin** (`PUBLIC_STORE_URL` / `CORS_ORIGINS`). Example: `http://localhost:5173/account/keycloak/callback` |
| `code_challenge` | PKCE S256 challenge (base64url) |
| `code_challenge_method` | Must be `S256` |
| `after_login` | Optional. Path starting with `/` (max 256 chars). Default `/account`. |

**Response** (`200`): `{ "url": "<Keycloak authorize URL>" }`

**Errors**: `400` / `503` with `{ "error": "..." }` (`KeycloakAuthError` messages).

**Example** (challenge value is illustrative only):

```bash
curl -sG http://localhost:4000/api/auth/keycloak/start \
  --data-urlencode "redirect_uri=http://localhost:5173/account/keycloak/callback" \
  --data-urlencode "code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" \
  --data-urlencode "code_challenge_method=S256" \
  --data-urlencode "after_login=/account" | jq .
```

---

## `POST /api/auth/keycloak/callback`

Completes the OIDC flow. Requires **MS SQL** (user provisioning).

**Headers**: `Content-Type: application/json`, `X-CSRF-Token`, session cookies from `GET /api/csrf`.

**Body** (JSON):

| Field | Description |
|-------|-------------|
| `code` | Authorization code from Keycloak redirect |
| `redirect_uri` | Same value passed to `/keycloak/start` |
| `code_verifier` | PKCE verifier |
| `state` | Opaque `state` returned by Keycloak (signed by this API) |

**Response** (`200`): `{ "ok": true, "user": { "id", "email", "role" }, "next": "/account" }`  
Sets **httpOnly** auth cookies (`pt_session`, refresh).

**Example** (with CSRF agent — use real values from the browser flow):

```bash
# Obtain CSRF (cookie jar)
curl -s -c cookies.txt http://localhost:4000/api/csrf
TOKEN=$(jq -r .csrfToken < csrf.json)  # save body to file in practice

curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/keycloak/callback \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $TOKEN" \
  -d '{"code":"...","redirect_uri":"...","code_verifier":"...","state":"..."}'
```

---

## `POST /api/auth/keycloak/ro-password`

**Optional.** Returns `404` when `KEYCLOAK_ROPC_LOGIN_ENABLED` is not `true`. Does **not** return Keycloak access tokens in JSON — only sets the same session cookies as the callback on success.

**Body** (JSON):

| Field | Required | Description |
|-------|----------|-------------|
| `username` | Yes | Keycloak username (often email) |
| `password` | Yes | Password |
| `audience` | No | `"frontend"` (default) or `"mobile"` — selects client credentials from env |

**Response** (`200`): `{ "ok": true, "user": { "id", "email", "role" } }`

**Errors**: `400`, `401`, `503`, `404` (feature off).

---

## Keycloak server URLs (external)

Your realm’s **well-known** document is typically:

`{KEYCLOAK_ISSUER}/.well-known/openid-configuration`

Example issuer:

`https://keycloak.example.com/realms/your-realm`

The store API reads that document server-side for `authorization_endpoint`, `token_endpoint`, and `userinfo_endpoint`. You do not call those from the SPA except by redirecting the user to the authorize URL returned by **`/keycloak/start`**.

---

## Related frontend entry points

| Area | File |
|------|------|
| Store sign-in + Keycloak button | `frontend/src/pages/store/AccountPage.tsx` |
| Admin Keycloak button | `frontend/src/pages/admin/AdminLoginPage.tsx` |
| OIDC callback page | `frontend/src/pages/store/KeycloakCallbackPage.tsx` |

---

## Tests

Smoke coverage includes `GET /api/auth/keycloak/routes`, `GET /api/auth/keycloak/status`, and disabled ROPC behaviour: `tests/api.smoke.test.ts`.
