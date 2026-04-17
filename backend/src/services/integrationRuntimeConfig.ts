import { env } from '../config/env.js'
import type { UserRole } from '../types/roles.js'

/** SQL `integration_settings` overrides env when non-empty; use `INTEGRATION_USE_ENV_ONLY=true` to skip SQL entirely. */
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

function issuerBaseMerged(map: Map<string, string> | null | undefined): string {
  const explicit = (pick(map, 'KEYCLOAK_ISSUER') ?? '').replace(/\/$/u, '')
  if (explicit) return explicit
  const tokenUrl = (pick(map, 'KEYCLOAK_TOKEN_URL') ?? env.keycloakTokenUrl).trim()
  const i = tokenUrl.indexOf('/protocol/openid-connect')
  if (i > 0) return tokenUrl.slice(0, i)
  return env.keycloakIssuerBase
}

export type KeycloakRuntimeConfig = {
  issuerBase: string
  tokenUrl: string
  oidcClientId: string
  oidcClientSecret: string
  frontendClientId: string
  frontendClientSecret: string
  mobileClientId: string
  mobileClientSecret: string
  realmRoleAdmin: string
  realmRoleOps: string
  realmRoleFulfillment: string
  signInOnly: boolean
  allowLocalPasswordLogin: boolean
  ropcLoginEnabled: boolean
  paytodayForgotPasswordUrl: string
}

export function mergeKeycloakRuntime(map: Map<string, string> | null | undefined): KeycloakRuntimeConfig {
  const issuerBase = issuerBaseMerged(map)
  return {
    issuerBase,
    tokenUrl: (pick(map, 'KEYCLOAK_TOKEN_URL') ?? env.keycloakTokenUrl).trim(),
    oidcClientId: (pick(map, 'KEYCLOAK_CLIENT_ID') ?? env.keycloakOidcClientId).trim(),
    oidcClientSecret: (pick(map, 'KEYCLOAK_CLIENT_SECRET') ?? env.keycloakOidcClientSecret).trim(),
    frontendClientId: (pick(map, 'KEYCLOAK_FRONTEND_CLIENT_ID') ?? env.keycloakFrontendClientId).trim(),
    frontendClientSecret: (pick(map, 'KEYCLOAK_FRONTEND_CLIENT_SECRET') ?? env.keycloakFrontendClientSecret).trim(),
    mobileClientId: (pick(map, 'KEYCLOAK_MOBILE_CLIENT_ID') ?? env.keycloakMobileClientId).trim(),
    mobileClientSecret: (pick(map, 'KEYCLOAK_MOBILE_CLIENT_SECRET') ?? env.keycloakMobileClientSecret).trim(),
    realmRoleAdmin: (pick(map, 'KEYCLOAK_REALM_ROLE_ADMIN') ?? env.keycloakRealmRoleAdmin).trim(),
    realmRoleOps: (pick(map, 'KEYCLOAK_REALM_ROLE_OPS') ?? env.keycloakRealmRoleOps).trim(),
    realmRoleFulfillment: (pick(map, 'KEYCLOAK_REALM_ROLE_FULFILLMENT') ?? env.keycloakRealmRoleFulfillment).trim(),
    signInOnly: pickBool(map, 'KEYCLOAK_SIGN_IN_ONLY', env.keycloakSignInOnly),
    allowLocalPasswordLogin: pickBool(map, 'KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN', env.keycloakAllowLocalPasswordLogin),
    ropcLoginEnabled: pickBool(map, 'KEYCLOAK_ROPC_LOGIN_ENABLED', env.keycloakRocpLoginEnabled),
    paytodayForgotPasswordUrl: (pick(map, 'PAYTODAY_FORGOT_PASSWORD_URL') ?? env.paytodayForgotPasswordUrl).trim(),
  }
}

export function isKeycloakOidcConfiguredKc(kc: KeycloakRuntimeConfig): boolean {
  return Boolean(kc.issuerBase && kc.oidcClientId)
}

export function isRocpEnvReadyKc(kc: KeycloakRuntimeConfig): boolean {
  const ropcFrontendReady = Boolean(
    kc.tokenUrl && kc.frontendClientId && kc.frontendClientSecret && kc.issuerBase,
  )
  const ropcMobileReady = Boolean(
    kc.tokenUrl && kc.mobileClientId && kc.mobileClientSecret && kc.issuerBase,
  )
  return ropcFrontendReady || ropcMobileReady
}

export function roleFromRealmNames(
  kc: KeycloakRuntimeConfig,
  realmRoleNames: Set<string>,
): UserRole {
  if (kc.realmRoleAdmin && realmRoleNames.has(kc.realmRoleAdmin)) return 'admin'
  if (kc.realmRoleOps && realmRoleNames.has(kc.realmRoleOps)) return 'ops'
  if (kc.realmRoleFulfillment && realmRoleNames.has(kc.realmRoleFulfillment)) return 'fulfillment'
  return 'customer'
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
