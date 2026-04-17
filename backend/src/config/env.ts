import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

/**
 * Load `.env` from (1) current working directory, then (2) repo root next to `backend/`.
 * Dotenv does not override already-set variables, so `npm run dev` from the repo root wins;
 * starting the API with `cwd` inside `backend/` still finds the root `.env`.
 */
const envDirFromModule = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** Reload `.env` from cwd then repo root (same merge rules as dotenv: later file fills missing keys only). */
export function loadDotenvFiles(): void {
  dotenv.config({ path: path.join(process.cwd(), '.env') })
  dotenv.config({ path: path.join(envDirFromModule, '.env') })
}

loadDotenvFiles()

function parseSameSite(v: string | undefined): 'strict' | 'lax' | 'none' {
  const s = (v ?? 'strict').toLowerCase()
  if (s === 'lax' || s === 'none') return s
  return 'strict'
}

/**
 * Optional `SQL_SERVER_TCP=host,port` (e.g. `127.0.0.1,49242`) replaces `Server=...` in the connection string.
 * Use for SQL Express when the driver falls back to port 1433: set the port from SQL Server Configuration Manager
 * → TCP/IP → IPAll → TCP Dynamic Ports (or a static TCP Port), and ensure TCP/IP is Enabled for SQLEXPRESS.
 */
function applySqlTcpOverride(connectionString: string | undefined): string | undefined {
  const raw = connectionString?.trim()
  const tcp = process.env.SQL_SERVER_TCP?.trim()
  if (!raw || !tcp) return raw
  return raw.replace(/\bServer\s*=\s*[^;]+/i, `Server=${tcp}`)
}

function parseEnvBool(v: string | undefined, defaultVal: boolean): boolean {
  if (v === undefined || v.trim() === '') return defaultVal
  return ['true', '1', 'yes'].includes(v.trim().toLowerCase())
}

/**
 * When `SQL_CONNECTION_STRING` is unset, build from `SQL_SERVER`, `SQL_DATABASE`, `SQL_ENCRYPT`,
 * `SQL_TRUST_SERVER_CERTIFICATE`, and optional `SQL_USER` / `SQL_PASSWORD` (else Windows `Trusted_Connection=yes`).
 */
function sqlConnectionStringFromGranularEnv(): string | undefined {
  const server = process.env.SQL_SERVER?.trim()
  if (!server) return undefined
  const database = process.env.SQL_DATABASE?.trim() || 'paytoday'
  const encrypt = parseEnvBool(process.env.SQL_ENCRYPT, true)
  /* Local SQL almost always needs TrustServerCertificate; production should set explicitly if false. */
  const trustDefault = process.env.NODE_ENV !== 'production'
  const trustCert = parseEnvBool(process.env.SQL_TRUST_SERVER_CERTIFICATE, trustDefault)
  const user = process.env.SQL_USER?.trim()
  const password = process.env.SQL_PASSWORD ?? ''
  let cs = `Server=${server};Database=${database};Encrypt=${encrypt};TrustServerCertificate=${trustCert};Connection Timeout=30`
  if (user) {
    cs += `;User Id=${user};Password=${password}`
  } else {
    cs += ';Trusted_Connection=yes'
  }
  return cs
}

/** Vitest sets VITEST=true; avoid long SQL connect timeouts in API smoke tests. */
function sqlConnectionStringFromEnv(): string | undefined {
  if (process.env.VITEST === 'true') return undefined
  const explicit = process.env.SQL_CONNECTION_STRING?.trim()
  if (explicit) return explicit
  return sqlConnectionStringFromGranularEnv()
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  /** MS SQL connection string; omit to use in-memory catalogue (dev only). */
  sqlConnectionString: applySqlTcpOverride(sqlConnectionStringFromEnv()),
  /**
   * When true, the API never reads `dbo.integration_settings` — PayToday, Keycloak, and notify settings
   * use only this process environment (`merge*` functions receive an empty map). Use when the table is
   * removed or you do not want SQL overrides.
   */
  integrationUseEnvOnly: parseEnvBool(process.env.INTEGRATION_USE_ENV_ONLY, false),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
  cookieName: process.env.AUTH_COOKIE_NAME ?? 'pt_session',
  refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? 'pt_refresh',
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  paytodayFormsBaseUrl: process.env.PAYTODAY_FORMS_BASE_URL ?? '',
  paytodayFormsApiUrl: process.env.PAYTODAY_FORMS_API_URL ?? '',
  /**
   * When set, checkout uses PayToday's documented Payment Intent API (JSON `vi`, `amount`, etc.)
   * and `payment_url` response. See https://site.paytoday.com.na/help-center/custom-web-integrations/
   * If empty but PAYTODAY_FORMS_API_URL is set, the legacy custom JSON body is used instead.
   */
  paytodayPaymentIntentUrl: (process.env.PAYTODAY_PAYMENT_INTENT_URL ?? '').trim(),
  paytodayVendorId: process.env.PAYTODAY_VENDOR_ID ?? '',
  paytodayBusinessId: process.env.PAYTODAY_BUSINESS_ID ?? '',
  paytodayWebhookSecret: process.env.PAYTODAY_WEBHOOK_SECRET ?? '',
  /** Keycloak token endpoint (resource-owner or future flows). Secrets only in env, never in client bundles. */
  keycloakTokenUrl: (process.env.KEYCLOAK_TOKEN_URL ?? '').trim(),
  keycloakMobileClientId: (process.env.KEYCLOAK_MOBILE_CLIENT_ID ?? '').trim(),
  keycloakMobileClientSecret: (process.env.KEYCLOAK_MOBILE_CLIENT_SECRET ?? '').trim(),
  keycloakFrontendClientId: (process.env.KEYCLOAK_FRONTEND_CLIENT_ID ?? '').trim(),
  keycloakFrontendClientSecret: (process.env.KEYCLOAK_FRONTEND_CLIENT_SECRET ?? '').trim(),
  /**
   * OIDC issuer (Keycloak), e.g. `https://auth.example.com/realms/myrealm` — no trailing slash.
   * If unset, derived from `KEYCLOAK_TOKEN_URL` by stripping `/protocol/openid-connect/...`.
   */
  keycloakIssuerBase: (() => {
    const explicit = (process.env.KEYCLOAK_ISSUER ?? '').trim().replace(/\/$/u, '')
    if (explicit) return explicit
    const tokenUrl = (process.env.KEYCLOAK_TOKEN_URL ?? '').trim()
    const i = tokenUrl.indexOf('/protocol/openid-connect')
    if (i > 0) return tokenUrl.slice(0, i)
    return ''
  })(),
  /** Confidential client id for server-side code exchange (falls back to KEYCLOAK_FRONTEND_CLIENT_ID). */
  keycloakOidcClientId: (process.env.KEYCLOAK_CLIENT_ID ?? process.env.KEYCLOAK_FRONTEND_CLIENT_ID ?? '').trim(),
  /** Client secret for confidential clients; omit for public clients that allow code+PKCE without secret. */
  keycloakOidcClientSecret: (process.env.KEYCLOAK_CLIENT_SECRET ?? process.env.KEYCLOAK_FRONTEND_CLIENT_SECRET ?? '').trim(),
  /** Map Keycloak realm role → app role (first match wins: admin, ops, fulfillment). */
  keycloakRealmRoleAdmin: (process.env.KEYCLOAK_REALM_ROLE_ADMIN ?? '').trim(),
  keycloakRealmRoleOps: (process.env.KEYCLOAK_REALM_ROLE_OPS ?? '').trim(),
  keycloakRealmRoleFulfillment: (process.env.KEYCLOAK_REALM_ROLE_FULFILLMENT ?? '').trim(),
  /**
   * When true, local `POST /api/auth/login` / `POST /api/auth/register` are rejected unless `KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN`.
   * Requires Keycloak OIDC to be configured (`KEYCLOAK_ISSUER` + client id); otherwise the API returns 503 on blocked routes.
   */
  keycloakSignInOnly: parseEnvBool(process.env.KEYCLOAK_SIGN_IN_ONLY, false),
  /**
   * When true, `POST /api/auth/keycloak/ro-password` is enabled (Keycloak ROPC → app session cookies).
   * Requires `KEYCLOAK_TOKEN_URL` and frontend (or mobile) client id + secret. Default false — prefer OIDC + PKCE.
   */
  keycloakRocpLoginEnabled: parseEnvBool(process.env.KEYCLOAK_ROPC_LOGIN_ENABLED, false),
  /**
   * When `KEYCLOAK_SIGN_IN_ONLY=true`, local email/password login and registration are normally blocked.
   * Set this to `true` to keep store SQL login/register available alongside Keycloak (dual sign-in).
   */
  keycloakAllowLocalPasswordLogin: parseEnvBool(process.env.KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN, false),
  /** External “forgot password” URL for PayToday/Keycloak users (optional; exposed via GET /api/auth/public-config). */
  paytodayForgotPasswordUrl: (process.env.PAYTODAY_FORGOT_PASSWORD_URL ?? '').trim(),
  /** When true, `POST /api/checkout` requires `req.user` (no guest checkout). */
  checkoutRequireSignIn: parseEnvBool(process.env.CHECKOUT_REQUIRE_SIGN_IN, false),
  /** Public browser origin for SPA after payment (no trailing slash). */
  publicStoreUrl: (process.env.PUBLIC_STORE_URL ?? 'http://localhost:5173').replace(/\/$/u, ''),
  /** API origin for PayToday returnUrl (browser hits API first, then redirect to SPA). */
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/u, ''),
  shippingFlatCents: Math.max(0, Number(process.env.SHIPPING_FLAT_CENTS ?? 0) || 0),
  /** If > 0, home delivery shipping is 0 when subtotal (cents) is >= this (Avo-style free shipping over threshold). */
  shippingFreeSubtotalCents: Math.max(0, Number(process.env.SHIPPING_FREE_SUBTOTAL_CENTS ?? 0) || 0),
  vatRateBps: Math.max(0, Number(process.env.VAT_RATE_BPS ?? 0) || 0),
  /** Optional PayToday scan/pay API base (server-side BFF or logging). */
  paytodayScanApiBaseUrl: (process.env.PAYTODAY_SCAN_API_BASE_URL ?? '').replace(/\/$/u, ''),
  cookieSameSite: parseSameSite(process.env.COOKIE_SAME_SITE),
  /** When true, `app.set('trust proxy', 1)` so `req.secure` / HTTPS detection works behind a reverse proxy. */
  trustProxy: parseEnvBool(process.env.TRUST_PROXY, false),
  notificationEmailFrom: process.env.NOTIFICATION_EMAIL_FROM ?? '',
  /** Notifications API base (Postman `{{baseUrl}}`, e.g. `http://localhost:3001/api/v1` or hosted `…/api/v1`). */
  notifyServiceBaseUrl: (process.env.NOTIFY_SERVICE_BASE_URL ?? 'https://notify-service.today-ww.net/api/v1').replace(
    /\/$/u,
    '',
  ),
  /** When set, email is posted to `{NOTIFY_SERVICE_BASE_URL}/{portal}/email` instead of `…/email`. */
  notifyServicePortal: (process.env.NOTIFY_SERVICE_PORTAL ?? '').trim(),
  /** Path after portal for inbox / UI deep links (exposed on public-config; default `/notifications`). */
  notifyServiceInboxPath: (() => {
    const p = (process.env.NOTIFY_SERVICE_INBOX_PATH ?? '/notifications').trim()
    return p || '/notifications'
  })(),
  notifyServiceApiKey: process.env.NOTIFY_SERVICE_API_KEY ?? '',
  /**
   * When true, POST mail to `{NOTIFY_SERVICE_BASE_URL}/email` only (PayToday Notifications “Send custom email” in Postman).
   * When false, use `{base}/{NOTIFY_SERVICE_PORTAL}/email` if `NOTIFY_SERVICE_PORTAL` is set, else `{base}/email`.
   */
  notifyServiceUseFlatEmailPath: parseEnvBool(process.env.NOTIFY_SERVICE_USE_FLAT_EMAIL_PATH, false),
  /**
   * Optional JSON map: outbox `template_key` → notify `templateId` (portal template).
   * Example: {"checkout_pending_payment":"tmpl_abc","payment_confirmed":"tmpl_def","hub_demo_pending_payment":"…","hub_demo_payment_completed":"…"}
   * When a key is missing, the worker sends built-in HTML/text using `PUBLIC_STORE_URL` and payload.
   */
  notifyEmailTemplateIds: (() => {
    const raw = process.env.NOTIFY_EMAIL_TEMPLATE_IDS?.trim()
    if (!raw) return {} as Record<string, string>
    try {
      const o = JSON.parse(raw) as Record<string, unknown>
      if (!o || typeof o !== 'object') return {}
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && v.trim()) out[k] = v.trim()
      }
      return out
    } catch {
      return {}
    }
  })(),
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587) || 587,
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  /** Only in development: allow X-Dev-Role header on login. Disabled in production. */
  allowDevRoleHeader: process.env.ALLOW_DEV_ROLE_HEADER === 'true',
  /**
   * Hours until deposit-box pickup codes expire (default 48). Fractional values are allowed (e.g. `0.5` ≈ 30 minutes).
   * Invalid or non-positive values fall back to 48.
   */
  pickupCodeTtlHours: (() => {
    const n = Number(process.env.PICKUP_CODE_TTL_HOURS ?? 48)
    if (!Number.isFinite(n) || n <= 0) return 48
    return n
  })(),
  /** Max days after order `created_at` that a customer may open a return (shipped/delivered orders). Default 90. */
  storeReturnWindowDays: (() => {
    const n = Number(process.env.STORE_RETURN_WINDOW_DAYS ?? 90)
    if (!Number.isFinite(n) || n < 1) return 90
    return Math.min(Math.floor(n), 3650)
  })(),
  /**
   * Optional path to the Vite production build (`dist` with `index.html`).
   * Relative paths resolve from `process.cwd()` (run `npm run build` from repo root, then e.g. `SPA_STATIC_ROOT=dist`).
   * When set, this API process also serves the SPA and static assets; `/api/*` stays on the backend.
   */
  spaStaticRoot: process.env.SPA_STATIC_ROOT?.trim() || undefined,
}
