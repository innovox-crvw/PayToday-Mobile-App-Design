import type { KeycloakRuntimeConfig } from './integrationRuntimeConfig.js'

export type KeycloakAudience = 'mobile' | 'frontend'

/**
 * Server-side Keycloak access token (resource-owner password grant).
 * Call only from trusted backend code; never expose client_secret or passwords to the browser.
 */
export async function fetchKeycloakPasswordGrantToken(
  kc: KeycloakRuntimeConfig,
  audience: KeycloakAudience,
  username: string,
  password: string,
): Promise<{ access_token: string; expires_in?: number; token_type?: string }> {
  const tokenUrl = kc.tokenUrl
  if (!tokenUrl) {
    throw new Error('KEYCLOAK_TOKEN_URL is not configured.')
  }
  const clientId = audience === 'mobile' ? kc.mobileClientId : kc.frontendClientId
  const clientSecret = audience === 'mobile' ? kc.mobileClientSecret : kc.frontendClientSecret
  if (!clientId || !clientSecret) {
    throw new Error(
      audience === 'mobile'
        ? 'KEYCLOAK_MOBILE_CLIENT_ID and KEYCLOAK_MOBILE_CLIENT_SECRET are required.'
        : 'KEYCLOAK_FRONTEND_CLIENT_ID and KEYCLOAK_FRONTEND_CLIENT_SECRET are required.',
    )
  }
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password,
    scope: 'openid email profile',
  })
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    token_type?: string
    error_description?: string
    error?: string
  }
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `Keycloak token request failed (${res.status})`
    throw new Error(msg)
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
  }
}
