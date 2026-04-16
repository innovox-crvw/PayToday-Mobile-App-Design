import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { UserRole } from '../types/roles.js'
import { isKeycloakOidcConfiguredKc, roleFromRealmNames, type KeycloakRuntimeConfig } from './integrationRuntimeConfig.js'

export type { KeycloakRuntimeConfig }

export class KeycloakAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message)
    this.name = 'KeycloakAuthError'
  }
}

type OidcDiscovery = {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
}

const discoveryCache = new Map<string, { at: number; data: OidcDiscovery }>()
const DISCOVERY_TTL_MS = 60 * 60 * 1000

export function isAllowedOAuthRedirectUri(redirectUri: string): boolean {
  let candidate: URL
  try {
    candidate = new URL(redirectUri)
  } catch {
    return false
  }
  const allowed = new Set<string>()
  try {
    allowed.add(new URL(env.publicStoreUrl).origin)
  } catch {
    /* ignore */
  }
  for (const o of env.corsOrigins) {
    try {
      allowed.add(new URL(o).origin)
    } catch {
      /* ignore */
    }
  }
  return allowed.has(candidate.origin)
}

function normalizeAfterLogin(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/account'
  if (raw.length > 256) return '/account'
  return raw
}

async function loadDiscovery(kc: KeycloakRuntimeConfig): Promise<OidcDiscovery> {
  const issuerKey = kc.issuerBase.replace(/\/$/u, '')
  const hit = discoveryCache.get(issuerKey)
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) {
    return hit.data
  }
  const wellKnown = `${issuerKey}/.well-known/openid-configuration`
  let res: Response
  try {
    res = await fetch(wellKnown)
  } catch {
    throw new KeycloakAuthError('Could not reach Keycloak OpenID configuration.', 502)
  }
  if (!res.ok) {
    throw new KeycloakAuthError(`Keycloak discovery failed (HTTP ${res.status}).`, 502)
  }
  const data = (await res.json()) as Partial<OidcDiscovery>
  if (
    typeof data.authorization_endpoint !== 'string' ||
    typeof data.token_endpoint !== 'string' ||
    typeof data.userinfo_endpoint !== 'string'
  ) {
    throw new KeycloakAuthError('Keycloak discovery response missing required endpoints.', 502)
  }
  const d: OidcDiscovery = {
    authorization_endpoint: data.authorization_endpoint,
    token_endpoint: data.token_endpoint,
    userinfo_endpoint: data.userinfo_endpoint,
  }
  discoveryCache.set(issuerKey, { at: Date.now(), data: d })
  return d
}

function signOAuthState(redirectUri: string, nextPath: string): string {
  return jwt.sign(
    { redirect_uri: redirectUri, next: nextPath, exp: Math.floor(Date.now() / 1000) + 600 },
    env.jwtSecret,
    { algorithm: 'HS256' },
  )
}

function verifyOAuthState(state: string): { redirect_uri: string; next: string } {
  try {
    const decoded = jwt.verify(state, env.jwtSecret) as {
      redirect_uri?: string
      next?: string
    }
    const redirect_uri = decoded.redirect_uri
    const next = typeof decoded.next === 'string' ? decoded.next : '/account'
    if (typeof redirect_uri !== 'string' || !isAllowedOAuthRedirectUri(redirect_uri)) {
      throw new KeycloakAuthError('Invalid OAuth state (redirect).', 400)
    }
    return { redirect_uri, next: normalizeAfterLogin(next) }
  } catch (e) {
    if (e instanceof KeycloakAuthError) throw e
    throw new KeycloakAuthError('Invalid or expired OAuth state.', 400)
  }
}

export async function buildKeycloakAuthorizeUrl(
  kc: KeycloakRuntimeConfig,
  params: {
    redirectUri: string
    codeChallenge: string
    codeChallengeMethod: 'S256'
    afterLogin: string
  },
): Promise<string> {
  if (!isKeycloakOidcConfiguredKc(kc)) {
    throw new KeycloakAuthError('Keycloak OIDC is not configured.', 503)
  }
  if (!isAllowedOAuthRedirectUri(params.redirectUri)) {
    throw new KeycloakAuthError('redirect_uri origin is not allowed for OAuth.', 400)
  }
  if (params.codeChallengeMethod !== 'S256') {
    throw new KeycloakAuthError('Only S256 PKCE is supported.', 400)
  }
  const d = await loadDiscovery(kc)
  const state = signOAuthState(params.redirectUri, normalizeAfterLogin(params.afterLogin))
  const u = new URL(d.authorization_endpoint)
  u.searchParams.set('client_id', kc.oidcClientId)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('redirect_uri', params.redirectUri)
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', params.codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

function decodeAccessTokenPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function roleFromAccessToken(accessToken: string, kc: KeycloakRuntimeConfig): UserRole {
  const p = decodeAccessTokenPayload(accessToken)
  const roles = new Set<string>()
  const ra = p?.realm_access as { roles?: string[] } | undefined
  for (const r of ra?.roles ?? []) roles.add(r)
  return roleFromRealmNames(kc, roles)
}

function profileFromUserinfo(
  kc: KeycloakRuntimeConfig,
  profile: {
    sub?: string
    email?: string
    preferred_username?: string
    name?: string
    given_name?: string
    family_name?: string
  },
  accessToken: string,
): { keycloakSub: string; email: string; fullName: string | null; role: UserRole } {
  const keycloakSub = typeof profile.sub === 'string' ? profile.sub : ''
  if (!keycloakSub) {
    throw new KeycloakAuthError('Keycloak userinfo missing subject.', 502)
  }
  const email =
    (typeof profile.email === 'string' && profile.email.trim()) ||
    (typeof profile.preferred_username === 'string' && profile.preferred_username.includes('@')
      ? profile.preferred_username.trim()
      : '')
  if (!email) {
    throw new KeycloakAuthError('Keycloak did not return an email; ensure the client requests email scope.', 400)
  }
  const fullName =
    (typeof profile.name === 'string' && profile.name.trim()) ||
    [profile.given_name, profile.family_name]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join(' ')
      .trim() || null

  const role = roleFromAccessToken(accessToken, kc)
  return { keycloakSub, email, fullName, role }
}

/**
 * Load OIDC userinfo using an access token from the password grant or code flow.
 */
export async function fetchKeycloakProfileFromAccessToken(
  kc: KeycloakRuntimeConfig,
  accessToken: string,
): Promise<{
  role: UserRole
  email: string
  fullName: string | null
  keycloakSub: string
}> {
  const issuer = kc.issuerBase.replace(/\/$/u, '')
  if (!issuer) {
    throw new KeycloakAuthError('Keycloak issuer is not configured.', 503)
  }
  const d = await loadDiscovery(kc)
  let ui: Response
  try {
    ui = await fetch(d.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    throw new KeycloakAuthError('Could not reach Keycloak userinfo endpoint.', 502)
  }
  if (!ui.ok) {
    throw new KeycloakAuthError(`Keycloak userinfo failed (HTTP ${ui.status}).`, 502)
  }
  const profile = (await ui.json()) as Parameters<typeof profileFromUserinfo>[1]
  const parsed = profileFromUserinfo(kc, profile, accessToken)
  return parsed
}

export async function exchangeKeycloakCode(
  kc: KeycloakRuntimeConfig,
  params: {
    code: string
    redirectUri: string
    codeVerifier: string
    state: string
  },
): Promise<{
  accessToken: string
  role: UserRole
  email: string
  fullName: string | null
  keycloakSub: string
  next: string
}> {
  const { redirect_uri, next } = verifyOAuthState(params.state)
  if (redirect_uri !== params.redirectUri) {
    throw new KeycloakAuthError('redirect_uri does not match OAuth state.', 400)
  }
  if (!isKeycloakOidcConfiguredKc(kc)) {
    throw new KeycloakAuthError('Keycloak OIDC is not configured.', 503)
  }
  const d = await loadDiscovery(kc)
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', kc.oidcClientId)
  if (kc.oidcClientSecret) {
    body.set('client_secret', kc.oidcClientSecret)
  }
  body.set('code', params.code)
  body.set('redirect_uri', params.redirectUri)
  body.set('code_verifier', params.codeVerifier)

  let res: Response
  try {
    res = await fetch(d.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    throw new KeycloakAuthError('Could not reach Keycloak token endpoint.', 502)
  }
  const text = await res.text()
  let tok: { access_token?: string; error?: string; error_description?: string }
  try {
    tok = text ? (JSON.parse(text) as typeof tok) : {}
  } catch {
    throw new KeycloakAuthError('Keycloak token response was not JSON.', 502)
  }
  if (!res.ok || !tok.access_token) {
    const msg = tok.error_description || tok.error || `Token exchange failed (HTTP ${res.status}).`
    throw new KeycloakAuthError(msg, res.status === 400 ? 400 : 502)
  }

  let ui: Response
  try {
    ui = await fetch(d.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
  } catch {
    throw new KeycloakAuthError('Could not reach Keycloak userinfo endpoint.', 502)
  }
  if (!ui.ok) {
    throw new KeycloakAuthError(`Keycloak userinfo failed (HTTP ${ui.status}).`, 502)
  }
  const profile = (await ui.json()) as Parameters<typeof profileFromUserinfo>[1]
  const { keycloakSub, email, fullName, role } = profileFromUserinfo(kc, profile, tok.access_token)
  return { accessToken: tok.access_token, role, email, fullName, keycloakSub, next }
}
