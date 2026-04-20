import type { KeycloakRuntimeConfig } from './integrationRuntimeConfig.js'

/**
 * Typed error raised for every Keycloak failure so route handlers can turn it into
 * a `paytoday_login_failed` response with a sensible HTTP status.
 */
export class KeycloakAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 401,
  ) {
    super(message)
    this.name = 'KeycloakAuthError'
  }
}

export type KeycloakTokenResponse = {
  access_token: string
  expires_in?: number
  token_type?: string
  refresh_token?: string
  scope?: string
}

export type KeycloakUserInfo = {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  given_name?: string
  family_name?: string
  preferred_username?: string
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/u, '')
}

export function keycloakTokenUrl(kc: KeycloakRuntimeConfig): string {
  return `${stripTrailingSlash(kc.baseUrl)}/realms/${encodeURIComponent(kc.realm)}/protocol/openid-connect/token`
}

export function keycloakUserInfoUrl(kc: KeycloakRuntimeConfig): string {
  return `${stripTrailingSlash(kc.baseUrl)}/realms/${encodeURIComponent(kc.realm)}/protocol/openid-connect/userinfo`
}

/**
 * Exchange a username + password for a Keycloak access token using the
 * OAuth 2.0 Resource Owner Password Credentials grant. Call only from trusted
 * backend code — never expose client_secret or passwords to the browser.
 */
export async function keycloakToken(
  kc: KeycloakRuntimeConfig,
  username: string,
  password: string,
): Promise<KeycloakTokenResponse> {
  if (!kc.baseUrl || !kc.realm || !kc.clientId) {
    throw new KeycloakAuthError('Keycloak not configured', 503)
  }
  const body = new URLSearchParams()
  body.set('grant_type', 'password')
  body.set('client_id', kc.clientId)
  if (kc.clientSecret) body.set('client_secret', kc.clientSecret)
  body.set('scope', 'openid email profile')
  body.set('username', username)
  body.set('password', password)

  let res: Response
  try {
    res = await fetch(keycloakTokenUrl(kc), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    throw new KeycloakAuthError('Could not reach Keycloak token endpoint.', 502)
  }
  const text = await res.text()
  let data: Partial<KeycloakTokenResponse> & { error?: string; error_description?: string }
  try {
    data = text ? (JSON.parse(text) as typeof data) : {}
  } catch {
    throw new KeycloakAuthError('Keycloak token response was not JSON.', 502)
  }
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `Keycloak token request failed (${res.status}).`
    const status = res.status === 401 || res.status === 400 ? 401 : 502
    throw new KeycloakAuthError(msg, status)
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
    refresh_token: data.refresh_token,
    scope: data.scope,
  }
}

/**
 * Load OIDC userinfo using an access token from `keycloakToken`.
 */
export async function keycloakUserInfo(
  kc: KeycloakRuntimeConfig,
  accessToken: string,
): Promise<KeycloakUserInfo> {
  if (!kc.baseUrl || !kc.realm) {
    throw new KeycloakAuthError('Keycloak not configured', 503)
  }
  let res: Response
  try {
    res = await fetch(keycloakUserInfoUrl(kc), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new KeycloakAuthError('Could not reach Keycloak userinfo endpoint.', 502)
  }
  if (!res.ok) {
    throw new KeycloakAuthError(`Keycloak userinfo failed (HTTP ${res.status}).`, 502)
  }
  return (await res.json()) as KeycloakUserInfo
}

/**
 * Convenience: call `keycloakToken` then `keycloakUserInfo` and shape the result
 * for `upsertUserFromKeycloakProfile` in [backend/src/services/keycloakProvision.ts](backend/src/services/keycloakProvision.ts).
 */
export async function keycloakPasswordSignIn(
  kc: KeycloakRuntimeConfig,
  username: string,
  password: string,
): Promise<{
  accessToken: string
  keycloakSub: string
  email: string
  fullName: string | null
  emailVerified: boolean
}> {
  const tok = await keycloakToken(kc, username, password)
  const info = await keycloakUserInfo(kc, tok.access_token)
  const sub = typeof info.sub === 'string' ? info.sub.trim() : ''
  if (!sub) {
    throw new KeycloakAuthError('Keycloak userinfo missing subject.', 502)
  }
  const email =
    (typeof info.email === 'string' && info.email.trim()) ||
    (typeof info.preferred_username === 'string' && info.preferred_username.includes('@')
      ? info.preferred_username.trim()
      : '')
  if (!email) {
    throw new KeycloakAuthError('Keycloak did not return an email; ensure the client requests email scope.', 400)
  }
  const fullName =
    (typeof info.name === 'string' && info.name.trim()) ||
    [info.given_name, info.family_name]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join(' ')
      .trim() || null
  return {
    accessToken: tok.access_token,
    keycloakSub: sub,
    email,
    fullName,
    emailVerified: info.email_verified === true,
  }
}
