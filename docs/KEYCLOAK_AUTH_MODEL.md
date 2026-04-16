# Keycloak authentication in this store

**HTTP API reference (paths, CSRF, examples):** [KEYCLOAK_API.md](./KEYCLOAK_API.md).

PayToday’s minimal integration guide sometimes shows `POST /api/login` with username and password forwarded to Keycloak’s token endpoint. This repository supports **two** patterns; choose based on PayToday / security requirements.

## Recommended: OIDC authorization code + PKCE (browser)

- **Routes:** `GET /api/auth/keycloak/start`, `POST /api/auth/keycloak/callback` (see [`backend/src/routes/api/auth.ts`](../backend/src/routes/api/auth.ts)).
- **Flow:** SPA obtains PKCE verifier/challenge, API returns Keycloak authorize URL, user signs in at Keycloak, callback exchanges the code at the API and issues **application session cookies** (JWT access + refresh), same as email/password login.
- **Env:** `KEYCLOAK_ISSUER` (or `KEYCLOAK_TOKEN_URL` for issuer derivation), `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` for the confidential client used at the token endpoint.
- **Why:** Client secret and tokens are handled server-side; no Keycloak access token is returned to the browser.

This is what the storefront **Continue with Keycloak** button uses ([`frontend/src/pages/store/AccountPage.tsx`](../frontend/src/pages/store/AccountPage.tsx)).

## Optional: Resource-owner password grant (ROPC)

- **When:** PayToday or another trusted channel explicitly requires the password-grant style, or for **non-browser** clients that cannot run a browser redirect.
- **Routes:** `POST /api/auth/keycloak/ro-password` with JSON `{ "username": "…", "password": "…" [, "audience": "frontend" | "mobile"] }`, **or** NedAccess-style `POST /api/auth/login` with `{ "email": "…", "password": "…", "authSource": "paytoday" }` (same server behaviour as `ro-password` with `username` = email).
- **Enable:** `KEYCLOAK_ROPC_LOGIN_ENABLED=true` plus `KEYCLOAK_TOKEN_URL`, issuer (via `KEYCLOAK_ISSUER` or derivable from token URL), and **either** `KEYCLOAK_FRONTEND_CLIENT_ID` / `KEYCLOAK_FRONTEND_CLIENT_SECRET` **or** (for `audience: "mobile"`) `KEYCLOAK_MOBILE_CLIENT_ID` / `KEYCLOAK_MOBILE_CLIENT_SECRET`.
- **Behaviour:** Calls Keycloak’s token endpoint from Node, loads userinfo, upserts the app user, sets **the same session cookies** as OIDC. The Keycloak access token is **not** returned in the JSON body.
- **Status:** `GET /api/auth/keycloak/status` includes `ropcLoginEnabled` when the feature flag and required env are satisfied.

ROPC is **disabled by default** (`KEYCLOAK_ROPC_LOGIN_ENABLED=false`). Prefer OIDC for interactive storefront sign-in.

## `KEYCLOAK_SIGN_IN_ONLY` and `KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN`

When `KEYCLOAK_SIGN_IN_ONLY` is `true`, local email/password `POST /api/auth/login` and `POST /api/auth/register` are rejected **unless** `KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN=true` (dual sign-in: Keycloak plus SQL accounts). OIDC should still be configured when Keycloak-only mode is on so **Continue with Keycloak** works. Public forgot-password link for PayToday users: `PAYTODAY_FORGOT_PASSWORD_URL` → `GET /api/auth/public-config`.

## Confirm with PayToday

Ask whether they require **browser redirect (OIDC)** only, or also **password grant** for a specific app channel. Align Keycloak client configuration (allowed grant types, redirect URIs, confidential vs public) with that answer before enabling ROPC in production.
