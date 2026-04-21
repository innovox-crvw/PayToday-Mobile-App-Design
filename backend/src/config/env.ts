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
  /**
   * Keycloak base URL — scheme + host only, no realm, no trailing slash.
   * Example: `https://keycloak.today-ww.net`. Realms are appended per-request.
   */
  keycloakBaseUrl: (process.env.KEYCLOAK_BASE_URL ?? '').trim().replace(/\/$/u, ''),
  /** Keycloak realm (tenant) name, e.g. `Nedbank`. */
  keycloakRealm: (process.env.KEYCLOAK_REALM ?? '').trim(),
  /** Keycloak OAuth client id used for Resource Owner Password Credentials (ROPC). Direct access grants must be ON. */
  keycloakClientId: (process.env.KEYCLOAK_CLIENT_ID ?? '').trim(),
  /** Keycloak client secret for confidential clients. Leave blank for public clients. */
  keycloakClientSecret: (process.env.KEYCLOAK_CLIENT_SECRET ?? '').trim(),
  /** External "forgot password" URL for PayToday users (optional; exposed via GET /api/auth/public-config). */
  paytodayForgotPasswordUrl: (process.env.PAYTODAY_FORGOT_PASSWORD_URL ?? '').trim(),
  /** When true, `POST /api/checkout` requires `req.user` (no guest checkout). */
  checkoutRequireSignIn: parseEnvBool(process.env.CHECKOUT_REQUIRE_SIGN_IN, false),
  /** Public browser origin for SPA after payment (no trailing slash). */
  publicStoreUrl: (process.env.PUBLIC_STORE_URL ?? 'http://localhost:5173').replace(/\/$/u, ''),
  /** API origin for PayToday returnUrl (browser hits API first, then redirect to SPA). */
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/u, ''),
  /** Min/max units per cart line (checkout and cart updates enforce this). */
  cartLineMinQty: Math.max(1, Number(process.env.CART_LINE_MIN_QTY ?? 1) || 1),
  cartLineMaxQty: Math.min(100_000, Math.max(1, Number(process.env.CART_LINE_MAX_QTY ?? 999) || 999)),
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
  /** Failed local password attempts before temporary lockout (login). */
  authLockoutMaxAttempts: Math.min(100, Math.max(3, Number(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS ?? 5) || 5)),
  /** Minutes an account stays locked after too many failed logins. */
  authLockoutMinutes: Math.min(1440, Math.max(5, Number(process.env.AUTH_LOCKOUT_MINUTES ?? 15) || 15)),
  /**
   * When true, `POST /api/auth/forgot-password` includes `devResetToken` in JSON (non-production only).
   * Never enable in production.
   */
  devPasswordResetRevealToken: parseEnvBool(process.env.DEV_PASSWORD_RESET_REVEAL_TOKEN, false),
  /**
   * Folder for admin-uploaded product images (`POST /api/admin/products/upload-image`).
   * Default: `<cwd>/data/uploads/products`. Served at `GET /api/uploads/products/<filename>`.
   */
  productImageUploadDir: (() => {
    const raw = process.env.PRODUCT_IMAGE_UPLOAD_DIR?.trim()
    if (raw) return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
    return path.join(process.cwd(), 'data', 'uploads', 'products')
  })(),
  /** Max bytes for one product image upload (default 4 MiB, max 12 MiB). */
  productImageUploadMaxBytes: (() => {
    const n = Number(process.env.PRODUCT_IMAGE_UPLOAD_MAX_BYTES ?? 4 * 1024 * 1024)
    if (!Number.isFinite(n) || n < 256 * 1024) return 4 * 1024 * 1024
    return Math.min(12 * 1024 * 1024, Math.floor(n))
  })(),
}
