# NedAccess Authentication Deep Dive

## PayToday vs Regular Login — How It All Works

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [The Login Endpoint](#the-login-endpoint)
3. [Regular (Local) Login Flow](#regular-local-login-flow)
4. [PayToday Login Flow](#paytoday-login-flow)
5. [Post-Authentication (Shared Path)](#post-authentication-shared-path)
6. [JWT Token System](#jwt-token-system)
7. [Cookie Management](#cookie-management)
8. [Token Refresh](#token-refresh)
9. [Auth Middleware (`requireAuth`)](#auth-middleware-requireauth)
10. [Logout & Token Revocation](#logout--token-revocation)
11. [Frontend Auth Architecture](#frontend-auth-architecture)
12. [Session Lifecycle](#session-lifecycle)
13. [Key Differences Summary](#key-differences-summary)
14. [Security Features](#security-features)
15. [File Reference](#file-reference)

---

## Architecture Overview

Both PayToday and regular login use a **single endpoint** (`POST /auth/login`). The body field `authSource` (`'local'` or `'paytoday'`) determines which credential-validation path runs. After identity is established, **both flows converge** into the same JWT issuance, cookie-setting, and session management code.

```
┌─────────────────────────────────────────────────────────────┐
│                     POST /auth/login                        │
│                                                             │
│  { email, password, authSource: 'local' | 'paytoday' }     │
└───────────────────────┬─────────────────────────────────────┘
                        │
              ┌─────────┴──────────┐
              │                    │
     authSource='local'    authSource='paytoday'
              │                    │
    ┌─────────▼─────────┐  ┌──────▼──────────────┐
    │  DB lookup + bcrypt│  │ Keycloak ROPC +      │
    │  password compare  │  │ userinfo endpoint    │
    │                    │  │                      │
    │  + lockout checks  │  │ + auto-provisioning  │
    │  + 30-day OTP gate │  │   (no lockout/OTP)   │
    └─────────┬──────────┘  └──────┬──────────────┘
              │                    │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  SHARED PATH       │
              │  • Email verify    │
              │  • JWT issuance    │
              │  • Cookie setting  │
              │  • Audit logging   │
              │  • Profile check   │
              └────────────────────┘
```

**Key principle**: PayToday/Keycloak is only used to **validate credentials and resolve user identity**. The app session is always NedAccess-issued JWTs — there is no separate PayToday session store.

---

## The Login Endpoint

**File**: `backend/src/routes/auth.ts` — line 640

```typescript
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  authSource: z.enum(['local', 'paytoday']).default('local'),
});

router.post('/auth/login', idempotency(), limiter, async (req, res) => { ... });
```

**Middleware applied to both flows:**
- `idempotency()` — prevents duplicate submissions
- `limiter` — `express-rate-limit` on the route (refresh endpoint is excluded from this)
- In-memory per-IP rate limiter (`checkLoginRateLimit`) — max 10 attempts/minute

---

## Regular (Local) Login Flow

**Code path**: `auth.ts` lines 724–889

### Step-by-step:

### 1. Account Lockout Check
```
isAccountLocked(emailLower) → checks failed_login_attempts table
```
If locked, returns generic `AUTH_ERROR` (same as wrong password — no lockout info revealed to prevent enumeration). A password-reset email is silently sent.

### 2. User Lookup
```
QUsers.getUserByEmailForLogin(emailLower)
```
Queries `users` table for active (non-deleted) users by email.

### 3. User Not Found Handling
If no user found, checks if a **deleted** account exists (for better error messaging). Performs a **dummy bcrypt compare** against a fake hash to prevent timing attacks that could enumerate valid emails.

### 4. Password Verification
```typescript
const ok = await bcrypt.compare(password, rows[0].password_hash);
```
Standard bcrypt comparison against the stored hash.

### 5. Failed Login Tracking
On wrong password:
- `trackFailedLogin(email, ip)` — increments counter
- If account becomes locked, sends lockout email silently
- Returns generic `AUTH_ERROR` (never reveals attempt count or lockout status)

### 6. 30-Day Inactivity OTP Gate
```typescript
const inactivityCheck = await isUserInactiveByEmail(emailLower);
if (inactivityCheck.inactive && inactivityCheck.userId) {
  // Generate OTP, send via email
  // Return { requiresOtp: true, userId, email }
  // NO tokens issued yet
}
```
If the user hasn't logged in for 30+ days, an OTP is generated and emailed. The login response returns `requiresOtp: true` instead of tokens. The user must call `POST /auth/otp/verify` to complete authentication.

### 7. Email Verification Check
```typescript
if (authSource === 'local' && !user.email_verified_at) {
  return res.status(401).json(AUTH_ERROR);
}
```
Local users MUST have a verified email to log in.

### 8. Success → Continues to [Shared Path](#post-authentication-shared-path)

---

## PayToday Login Flow

**Code path**: `auth.ts` lines 667–723

### Step-by-step:

### 1. Keycloak ROPC Token Exchange
```typescript
const tok = await keycloakToken(email, password);
```

**File**: `backend/src/services/keycloak.ts` — lines 7–32

Sends a **Resource Owner Password Credentials (ROPC)** grant to Keycloak:
```
POST {keycloak_base_url}/realms/{realm}/protocol/openid-connect/token

Body (URL-encoded):
  grant_type=password
  client_id={configured_client_id}
  client_secret={if_configured}
  scope=openid
  username={user_email}
  password={user_password}
```

### 2. Fetch User Info from Keycloak
```typescript
const info = await keycloakUserInfo(tok.access_token);
```

**File**: `backend/src/services/keycloak.ts` — lines 34–48

```
GET {keycloak_base_url}/realms/{realm}/protocol/openid-connect/userinfo
Authorization: Bearer {keycloak_access_token}
```

Returns `{ sub, email, email_verified }`.

### 3. Keycloak Configuration
```typescript
const kcCfg = await getKeycloakConfig();
```

**File**: `backend/src/services/integrationConfig.ts` — lines 90–110

Configuration is loaded from the `system_settings` DB table with environment variable fallbacks:
- `keycloak_base_url` / `KEYCLOAK_BASE_URL`
- `keycloak_realm` / `KEYCLOAK_REALM`
- `keycloak_frontend_client_id` / `KEYCLOAK_FRONTEND_CLIENT_ID`
- `keycloak_frontend_client_secret` / `KEYCLOAK_FRONTEND_CLIENT_SECRET`
- `paytoday_forgot_password_url` / `PAYTODAY_FORGOT_PASSWORD_URL`

### 4. User Resolution / Auto-Provisioning
```typescript
const rows = await QUsers.findByPaytodayIdOrEmail(sub, emailLower);
```
Looks up the user by Keycloak `sub` (subject ID) OR email.

**If no user exists** — auto-creates one:
```typescript
await QUsers.insertUserFromPaytoday({
  email: emailLower,
  rolesJson: JSON.stringify(['user']),
  paytodayUserId: sub,          // Keycloak subject ID
  paytodayRealm: kcCfg.realm,   // Keycloak realm
  emailVerifiedAt: verifiedAt,   // From Keycloak's email_verified
  cellPhone: null,
});
```
The user is created with `password_hash: '-'` (a dash, not a real hash) — this prevents local login for PayToday-provisioned users.

**If user exists but is deleted** → returns `401` with `account_deleted`.

### 5. Error Handling
- Keycloak timeout → `503 paytoday_login_timeout`
- Other Keycloak failures → `502 paytoday_login_failed`

### 6. Success → Continues to [Shared Path](#post-authentication-shared-path)

### What's NOT applied to PayToday:
- No account lockout checks (Keycloak handles its own)
- No bcrypt password comparison
- No failed-login counter tracking
- No 30-day inactivity OTP gate
- Email verification driven by Keycloak's `email_verified` claim (not NedAccess's check)

---

## Post-Authentication (Shared Path)

**Code path**: `auth.ts` lines 892–965

After either flow resolves a `user` object, both paths converge:

### 1. Email Verification (Local Only)
```typescript
if (authSource === 'local' && !user.email_verified_at) {
  return res.status(401).json(AUTH_ERROR);
}
```

### 2. JWT Issuance
```typescript
const roles = user.roles ? JSON.parse(user.roles) : ['user'];
const accessToken = signAccessToken({ sub: String(user.id), roles });
const refreshToken = signRefreshToken({ sub: String(user.id), roles });
```

### 3. Cookie Setting
Both `accessToken` and `refreshToken` are set as **httpOnly** cookies (see [Cookie Management](#cookie-management)).

### 4. Audit Logging
```typescript
await audit({
  actorId: String(user.id),
  action: 'auth.login',
  meta: { authSource },  // Records whether it was 'local' or 'paytoday'
});
```

### 5. Last Login Update
```typescript
await updateLastLogin(String(user.id));
```

### 6. Profile Completeness Check
```typescript
const profileCheck = await checkProfileCompleteness(String(user.id));
```

### 7. Response
```json
{
  "success": true,
  "token": "<access_token>",
  "expiresIn": 3600,
  "user": {
    "id": 123,
    "email": "user@example.com",
    "cellPhone": "+264...",
    "roles": ["user"],
    "kycStatus": "NONE",
    "profileComplete": false,
    "profileCompletionPercentage": 45,
    "requiredSteps": ["identity", "address"],
    "passwordResetRequired": false
  }
}
```

---

## JWT Token System

**File**: `backend/src/services/jwt.ts`

### Token Types

| Token | Purpose | Expiry | Storage |
|-------|---------|--------|---------|
| Access Token | API authentication | Configurable via `JWT_ACCESS_EXPIRES_IN` (default ~1h) | httpOnly cookie + JSON response |
| Refresh Token | Obtain new access tokens | Configurable via `JWT_REFRESH_EXPIRES_IN` (longer) | httpOnly cookie only |

### Claims Structure
```typescript
interface SessionClaims {
  sub: string;              // User ID
  roles?: string[];         // e.g., ['user'], ['admin', 'ops']
  sessionCreatedAt?: number; // Unix timestamp — first set at login, preserved across refreshes
}
```

### Key Rotation Support
```typescript
function verifyWithFallback(token: string, options?: VerifyOptions): any {
  try {
    return jwt.verify(token, env.JWT_SECRET, options);
  } catch (err) {
    if (env.JWT_SECRET_PREVIOUS) {
      return jwt.verify(token, env.JWT_SECRET_PREVIOUS, options);
    }
    throw err;
  }
}
```
Zero-downtime key rotation: set a new `JWT_SECRET` and move the old one to `JWT_SECRET_PREVIOUS`. Tokens signed with the old key continue to verify during the grace period.

### Session Anchoring
`sessionCreatedAt` is set when the user first logs in and is **preserved** when access tokens are refreshed. This enables a 5-day **absolute session timeout** regardless of how many times the user refreshes.

---

## Cookie Management

All auth cookies share these options:

| Option | Value | Notes |
|--------|-------|-------|
| `httpOnly` | `true` | Not accessible via JavaScript |
| `secure` | `true` in production | HTTPS only |
| `sameSite` | `'lax'` | Allows top-level navigations, blocks cross-site POSTs |
| `path` | `'/'` | Sent with all requests (required behind reverse proxy with `/api` prefix) |
| `domain` | `env.COOKIE_DOMAIN` (production only) | Scoped to the configured domain |
| `maxAge` | Parsed from JWT expiry config | Explicit expiration matching the JWT |

**Frontend usage**: The Axios client is configured with `withCredentials: true` so cookies are automatically sent. The frontend **never reads** the auth tokens from JavaScript — they are httpOnly. The only readable cookie is the CSRF token.

---

## Token Refresh

**Endpoint**: `POST /auth/refresh` — `auth.ts` lines 972–1134

This endpoint is **excluded from the express-rate-limit** middleware to avoid blocking legitimate refresh cycles.

### Flow:

```
┌──────────────────┐
│ Read refreshToken │ ← from cookies only (not Authorization header)
│ from cookies     │
└────────┬─────────┘
         │
┌────────▼─────────┐
│ Verify JWT        │ ← verifyRefreshToken() with key rotation fallback
└────────┬─────────┘
         │
┌────────▼──────────────────────┐
│ Check absolute session age    │ ← sessionCreatedAt + 5 days
│ If > 5 days:                  │
│   • Clear all cookies         │
│   • Send Clear-Site-Data      │
│   • Return 401 session_expired│
└────────┬──────────────────────┘
         │
┌────────▼─────────┐
│ Verify user exists│ ← QUsers.getUserByIdForRefresh(claims.sub)
└────────┬─────────┘
         │
┌────────▼──────────────────────┐
│ Issue NEW access token only   │
│ (refresh token NOT rotated)   │
│ Preserve sessionCreatedAt     │
└────────┬──────────────────────┘
         │
┌────────▼─────────┐
│ Set new cookie    │
│ Return JSON       │
└──────────────────┘
```

### Frontend Auto-Refresh

**File**: `frontend/src/lib/authRefresh.ts`

- **Proactive refresh**: Every **50 minutes** (`AUTO_REFRESH_INTERVAL`), `AuthApi.refresh()` is called to get a fresh access token before it expires.
- **Expiring-soon header**: The middleware sets `X-Token-Expiring-Soon: true` when the access token has < 10 minutes left. The frontend's response interceptor detects this and triggers a refresh if the user is active.
- **401 retry queue**: On a 401 response (not from refresh/login/logout), the frontend queues the failed request, calls `POST /auth/refresh`, then replays all queued requests with the new token.
- **Manual refresh**: The `SessionWarning` component shows a "Stay Signed In" button that calls `manualRefresh()`.

### Notable: Refresh does NOT check the revocation list
The refresh handler verifies JWT validity + user existence + session age, but does **not** call `isTokenRevoked()` for the refresh token. Only the `requireAuth` middleware checks revocation on the access token.

---

## Auth Middleware (`requireAuth`)

**File**: `backend/src/middleware/auth.ts` — lines 12–169

Runs on every authenticated API request. Here's the evaluation order:

```
1. Check mobile_kyc_access cookie (scoped JWT with audience: 'mobile_kyc')
   → If valid, set req.user and continue (mobile handoff flow)

2. Check accessToken cookie or Authorization: Bearer header
   → Prefer cookie, fall back to Bearer

3. Verify JWT (verifyAccessToken with key rotation fallback)

4. Check token revocation (isTokenRevoked via revoked_tokens table)
   → Fail open on DB errors (availability over security)

5. Check absolute session age (sessionCreatedAt + 5 days)
   → If expired: clear cookies, Clear-Site-Data header, 401

6. Check if user account is deleted (users.deleted_at)
   → Fail open on DB errors

7. Set req.user = { id, roles, permissions }
   → Derive permissions: admin/ops get 'users.manage', 'documents.view_all'

8. Set X-Token-Expiring-Soon header if < 10 minutes remain

9. Production: no token → 401 (hard fail)
   Non-production: allow x-user-id / x-user-roles dev headers
```

### Additional Middleware Exports

| Middleware | Purpose |
|------------|---------|
| `requireRole(...roles)` | Check user has specific role(s) |
| `requireOwnerOrRole(role?)` | User owns the resource OR has the role |
| `requireKycSessionOwner(role?)` | User owns the KYC session OR has the role |
| `requireIntegrationScope(scope)` | Validates integration Bearer tokens |
| `requireIntegrationScopeOrRole(scope, roles)` | Integration token OR user role |
| `blockAgents` | Prevents agent-role users from accessing user-only routes |

---

## Logout & Token Revocation

### Logout Endpoint

**`POST /auth/logout`** — `auth.ts` lines 1137–1221

Requires valid auth (`requireAuth` middleware).

```
1. Revoke access token  → revokeToken(accessToken, { reason: 'logout' })
2. Revoke refresh token → revokeToken(refreshToken, { reason: 'logout' })
3. Clear cookies (maxAge: 0 + clearCookie)
4. Set Clear-Site-Data header (clears cache, cookies, storage)
5. Audit log
6. Return 204 No Content
```

### Token Revocation Service

**File**: `backend/src/services/tokenRevocation.ts`

Stores revoked tokens in the `revoked_tokens` DB table.

**How JTI is determined:**
- If the JWT has a `jti` claim → use it
- Otherwise → SHA-256 hash of the token's signature portion (first 32 chars)

**Key functions:**

| Function | Purpose |
|----------|---------|
| `isTokenRevoked(token)` | SELECT from `revoked_tokens` by JTI — called on every auth'd request |
| `revokeToken(token, options)` | MERGE (upsert) into `revoked_tokens` |
| `revokeAllUserTokens(userId)` | Inserts a marker row (placeholder for future "logout everywhere") |
| `cleanupExpiredRevokedTokens()` | DELETE expired rows (should run periodically) |

**Fail-open design**: If the DB is unreachable when checking revocation, the request is **allowed through** to maintain availability. This is a deliberate trade-off.

---

## Frontend Auth Architecture

### State Management (Zustand)

**File**: `frontend/src/app/auth.tsx`

Auth state is managed via Zustand (not React Context). The store holds:
- `user` object (profile, roles, KYC status)
- `fetchMe()` → `GET /profile`
- `logout()` → `POST /auth/logout`

### Login Page

**File**: `frontend/src/pages/LoginPage.tsx`

A single login page handles both flows via a toggle:

```typescript
const [authSource, setAuthSource] = useState<'local' | 'paytoday'>('local');
```

- **Local mode**: Standard email/password form
- **PayToday mode**: Same form but with different helper text, loading message ("Authenticating with PayToday..."), and error handling for PayToday-specific errors (`paytoday_auth_failed`, `paytoday_login_failed`)

**Forgot password**:
- Local: NedAccess forgot-password flow
- PayToday: External link from `GET /auth/public-config` → `paytodayForgotPasswordUrl`

### API Client

**File**: `frontend/src/lib/api.ts`

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,  // Always send cookies
});
```

**CSRF protection**: A request interceptor reads the CSRF token from `document.cookie` (`XSRF-TOKEN` / `csrf-token` / `csrfToken`) and sends it on mutating requests (POST, PUT, DELETE, PATCH).

**Response interceptor chain:**
1. Maintenance mode redirect
2. CSRF token retry
3. `account_deleted` → redirect to login
4. `absolute_timeout` → redirect to login with reason
5. **401 → refresh queue** → retry original request
6. Generic 403 → redirect to login

### Route Guards

**File**: `frontend/src/app/auth.tsx`

| Guard | Behavior |
|-------|----------|
| `RequireAuth` | Calls `fetchMe()`, shows loading spinner, redirects to `/login` if no user. Starts `startAutoRefresh()` when user exists. |
| `RequireKyc` | Redirects to `/kyc-verify` if KYC not passed |
| `RequireAdmin` | Role check for admin |
| `RequireAdminOrOps` | Role check for admin or ops |
| `RequireUser` | Role check for user |
| `RequireAgent` | Role check for agent + extra CSRF refresh |

### Token Storage

- **httpOnly cookies**: Access and refresh tokens — **not readable by JavaScript**
- **No localStorage for tokens**: Legacy keys (`VerifyToday:accessToken`, `accessToken`, etc.) are actively cleaned up on hydration
- **Readable cookie**: CSRF token only

---

## Session Lifecycle

```
┌──────────────┐
│   Login      │ sessionCreatedAt = now()
│              │ Access token issued (1h)
│              │ Refresh token issued (longer)
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│              Active Session              │
│                                          │
│  Every ~50 min: auto-refresh             │
│  On X-Token-Expiring-Soon: prompt/refresh│
│  On 401: queue → refresh → retry         │
│                                          │
│  sessionCreatedAt preserved across all   │
│  refreshes (anchored to login time)      │
└──────┬───────────────────────────────────┘
       │
       ▼ After 5 days from sessionCreatedAt
┌──────────────┐
│ Absolute     │ Cookies cleared
│ Timeout      │ Clear-Site-Data sent
│              │ User must re-login
└──────────────┘
```

### Timeout Rules

| Timeout | Duration | Mechanism |
|---------|----------|-----------|
| Access token expiry | ~1 hour | JWT `exp` claim |
| Auto-refresh interval | 50 minutes | Frontend timer |
| Expiring-soon threshold | < 10 minutes remaining | Backend `X-Token-Expiring-Soon` header |
| Absolute session timeout | 5 days | `sessionCreatedAt` checked in middleware + refresh |

---

## Key Differences Summary

| Aspect | Regular (Local) | PayToday |
|--------|-----------------|----------|
| **Credential validation** | DB lookup + bcrypt | Keycloak ROPC + userinfo |
| **User provisioning** | Manual registration | Auto-provisioned on first login |
| **Password storage** | bcrypt hash in DB | `password_hash = '-'` (not usable) |
| **Account lockout** | Yes (failed-login tracking) | No (Keycloak handles its own) |
| **Failed login counter** | Yes (DB-tracked) | No |
| **Email must be verified** | Yes (NedAccess `email_verified_at`) | Driven by Keycloak's `email_verified` claim |
| **30-day inactivity OTP** | Yes | No |
| **Password change in-app** | Yes | Blocked (`isPayTodayUser` flag) |
| **Forgot password** | NedAccess flow | External PayToday URL |
| **Error codes** | `invalid_credentials`, `account_locked` (generic) | `paytoday_login_failed`, `paytoday_login_timeout` |
| **JWT issuance** | Identical | Identical |
| **Cookie management** | Identical | Identical |
| **Session management** | Identical | Identical |
| **Logout flow** | Identical | Identical |

---

## Security Features

### Anti-Enumeration
- Generic `AUTH_ERROR` response for all failure cases (wrong password, locked account, unverified email)
- Dummy bcrypt compare on user-not-found to prevent timing attacks

### Rate Limiting
- `express-rate-limit` on the login route
- In-memory per-IP rate limiter (`checkLoginRateLimit`, max 10/min)
- Security event logging on rate limit exceeded

### Account Lockout (Local Only)
- Progressive lockout after failed attempts
- Silent lockout — response never reveals lockout status
- Password-reset email sent automatically on lockout

### Token Security
- httpOnly cookies (not accessible via JS)
- Secure flag in production (HTTPS only)
- SameSite: lax (CSRF protection)
- Server-side token revocation on logout
- Key rotation support (`JWT_SECRET_PREVIOUS`)
- `Clear-Site-Data` header on logout and session expiry

### Session Controls
- 5-day absolute session timeout (not extendable)
- `sessionCreatedAt` anchored at login time
- Deleted user check on every authenticated request
- Token revocation check on every authenticated request

### CSRF Protection
- CSRF token cookie (readable by JS)
- Request interceptor adds CSRF header on mutating requests
- `sameSite: 'lax'` blocks cross-site POST requests

---

## File Reference

| File | Purpose | Key Lines |
|------|---------|-----------|
| `backend/src/routes/auth.ts` | Login, refresh, logout endpoints | 637–965 (login), 972–1134 (refresh), 1137–1221 (logout) |
| `backend/src/services/keycloak.ts` | Keycloak ROPC + userinfo | 7–48 |
| `backend/src/services/jwt.ts` | JWT sign/verify with key rotation | 1–91 |
| `backend/src/services/integrationConfig.ts` | Keycloak config loader (DB + env fallback) | 77–110 |
| `backend/src/services/tokenRevocation.ts` | Server-side token blacklist | 1–226 |
| `backend/src/middleware/auth.ts` | `requireAuth` + role/owner guards | 12–445 |
| `backend/src/queries/users.ts` | `findByPaytodayIdOrEmail`, `insertUserFromPaytoday`, login queries | 207–279 |
| `frontend/src/pages/LoginPage.tsx` | Login UI for both flows | Full file |
| `frontend/src/lib/api.ts` | Axios client, CSRF, 401 refresh queue | 13–419 (interceptors), 653–674 (AuthApi) |
| `frontend/src/lib/authRefresh.ts` | Auto-refresh, expiring-soon handling | Full file |
| `frontend/src/app/auth.tsx` | Zustand auth store, route guards | Full file |
| `frontend/src/app/router.tsx` | Route definitions with `RequireAuth` wrappers | 124–191 |
| `frontend/src/components/SessionWarning.tsx` | Session expiry UI with "Stay Signed In" | Full file |
