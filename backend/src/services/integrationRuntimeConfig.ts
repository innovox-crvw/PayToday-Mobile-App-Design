import { env } from '../config/env.js'

/**
 * SQL `integration_settings` overrides env when non-empty; use `INTEGRATION_USE_ENV_ONLY=true` to skip SQL entirely.
 *
 * Minimal Keycloak surface — just the four fields needed for server-side Resource Owner Password Credentials
 * sign-in (plus the optional forgot-password URL surfaced to the SPA). Role mapping happens in-app via
 * `users.role` managed on the admin page; Keycloak users always land as `customer`.
 */
function pick(map: Map<string, string> | null | undefined, key: string): string | undefined {
  const v = map?.get(key)
  if (v == null) return undefined
  const t = String(v).trim()
  return t === '' ? undefined : t
}

function pickBool(map: Map<string, string> | null | undefined, key: string, fallback: boolean): boolean {
  const v = pick(map, key)
  if (v === undefined) return fallback
  return ['true', '1', 'yes'].includes(v.toLowerCase())
}

export type KeycloakRuntimeConfig = {
  /** e.g. `https://keycloak.today-ww.net` (no trailing slash, no `/realms/...` suffix). */
  baseUrl: string
  /** Keycloak realm name, e.g. `Nedbank`. */
  realm: string
  /** OAuth 2.0 client id (a confidential client with Direct access grants ON). */
  clientId: string
  /** Optional confidential client secret. Public clients leave this blank. */
  clientSecret: string
  /** Optional absolute URL surfaced to the SPA for "Forgot password (PayToday)". */
  paytodayForgotPasswordUrl: string
}

export function mergeKeycloakRuntime(map: Map<string, string> | null | undefined): KeycloakRuntimeConfig {
  return {
    baseUrl: (pick(map, 'KEYCLOAK_BASE_URL') ?? env.keycloakBaseUrl).replace(/\/$/u, ''),
    realm: (pick(map, 'KEYCLOAK_REALM') ?? env.keycloakRealm).trim(),
    clientId: (pick(map, 'KEYCLOAK_CLIENT_ID') ?? env.keycloakClientId).trim(),
    clientSecret: (pick(map, 'KEYCLOAK_CLIENT_SECRET') ?? env.keycloakClientSecret).trim(),
    paytodayForgotPasswordUrl: (pick(map, 'PAYTODAY_FORGOT_PASSWORD_URL') ?? env.paytodayForgotPasswordUrl).trim(),
  }
}

/** PayToday sign-in is available when the three required Keycloak fields are non-empty. */
export function isKeycloakConfigured(kc: KeycloakRuntimeConfig): boolean {
  return Boolean(kc.baseUrl && kc.realm && kc.clientId)
}

export type PayTodayRuntimeConfig = {
  formsBaseUrl: string
  formsApiUrl: string
  paymentIntentUrl: string
  vendorId: string
  businessId: string
  webhookSecret: string
  scanApiBaseUrl: string
  publicApiUrl: string
  publicStoreUrl: string
}

export function mergePayTodayRuntime(map: Map<string, string> | null | undefined): PayTodayRuntimeConfig {
  return {
    formsBaseUrl: (pick(map, 'PAYTODAY_FORMS_BASE_URL') ?? env.paytodayFormsBaseUrl).trim(),
    formsApiUrl: (pick(map, 'PAYTODAY_FORMS_API_URL') ?? env.paytodayFormsApiUrl).trim(),
    paymentIntentUrl: (pick(map, 'PAYTODAY_PAYMENT_INTENT_URL') ?? env.paytodayPaymentIntentUrl).trim(),
    vendorId: (pick(map, 'PAYTODAY_VENDOR_ID') ?? env.paytodayVendorId).trim(),
    businessId: (pick(map, 'PAYTODAY_BUSINESS_ID') ?? env.paytodayBusinessId).trim(),
    webhookSecret: (pick(map, 'PAYTODAY_WEBHOOK_SECRET') ?? env.paytodayWebhookSecret).trim(),
    scanApiBaseUrl: (pick(map, 'PAYTODAY_SCAN_API_BASE_URL') ?? env.paytodayScanApiBaseUrl).trim(),
    publicApiUrl: (pick(map, 'PUBLIC_API_URL') ?? env.publicApiUrl).replace(/\/$/u, ''),
    publicStoreUrl: (pick(map, 'PUBLIC_STORE_URL') ?? env.publicStoreUrl).replace(/\/$/u, ''),
  }
}

export type NotifyRuntimeConfig = {
  apiKey: string
  baseUrl: string
  /** JSON string: template_key → notify portal templateId */
  emailTemplateIdsJson: string
  notificationEmailFrom: string
  /** Storefront origin for email links / template variables */
  publicStoreUrl: string
  /**
   * Path segment after the API base version, e.g. `business-2025-api-portal` →
   * `…/api/v1/{portal}/email` for transactional email (ignored when `useFlatEmailPath` is true).
   */
  portal: string
  /** Path on the notify service after the portal segment, e.g. `/notifications` for inbox UI. */
  inboxPath: string
  /** POST `{base}/email` only (Postman PayToday Notifications Service). */
  useFlatEmailPath: boolean
}

function stripNotifyTrailingSlashes(s: string): string {
  return s.replace(/\/+$/u, '')
}

function trimNotifyPortalSegment(portal: string): string {
  return portal.trim().replace(/^\/+|\/+$/gu, '')
}

/** POST URL for transactional email (`X-API-Key` header per PayToday Notifications Postman collection). */
export function notifyTransactionalEmailUrl(cfg: Pick<NotifyRuntimeConfig, 'baseUrl' | 'portal' | 'useFlatEmailPath'>): string {
  const base = stripNotifyTrailingSlashes((cfg.baseUrl || 'https://notify-service.today-ww.net/api/v1').trim())
  if (cfg.useFlatEmailPath) {
    return `${base}/email`
  }
  const portal = trimNotifyPortalSegment(cfg.portal)
  if (!portal) return `${base}/email`
  return `${base}/${portal}/email`
}

/** Public inbox URL on the notify host (no secrets). Undefined if base or portal is missing, or flat email path is used. */
export function notifyInboxBrowserUrl(
  cfg: Pick<NotifyRuntimeConfig, 'baseUrl' | 'portal' | 'inboxPath' | 'useFlatEmailPath'>,
): string | undefined {
  if (cfg.useFlatEmailPath) return undefined
  const base = stripNotifyTrailingSlashes(cfg.baseUrl.trim())
  const portal = trimNotifyPortalSegment(cfg.portal)
  if (!base || !portal) return undefined
  const raw = (cfg.inboxPath.trim() || '/notifications').trim() || '/notifications'
  const path = raw.startsWith('/') ? raw : `/${raw}`
  return `${base}/${portal}${path}`
}

export function mergeNotifyRuntime(map: Map<string, string> | null | undefined): NotifyRuntimeConfig {
  return {
    apiKey: (pick(map, 'NOTIFY_SERVICE_API_KEY') ?? env.notifyServiceApiKey).trim(),
    baseUrl: (pick(map, 'NOTIFY_SERVICE_BASE_URL') ?? env.notifyServiceBaseUrl).replace(/\/$/u, ''),
    emailTemplateIdsJson: (pick(map, 'NOTIFY_EMAIL_TEMPLATE_IDS') ?? process.env.NOTIFY_EMAIL_TEMPLATE_IDS ?? '').trim(),
    notificationEmailFrom: (pick(map, 'NOTIFICATION_EMAIL_FROM') ?? env.notificationEmailFrom).trim(),
    publicStoreUrl: (pick(map, 'PUBLIC_STORE_URL') ?? env.publicStoreUrl).replace(/\/$/u, ''),
    portal: (pick(map, 'NOTIFY_SERVICE_PORTAL') ?? env.notifyServicePortal).trim(),
    inboxPath: (pick(map, 'NOTIFY_SERVICE_INBOX_PATH') ?? env.notifyServiceInboxPath).trim() || '/notifications',
    useFlatEmailPath: pickBool(map, 'NOTIFY_SERVICE_USE_FLAT_EMAIL_PATH', env.notifyServiceUseFlatEmailPath),
  }
}
