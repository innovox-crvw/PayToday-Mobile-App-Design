/** SessionStorage key shared with `KeycloakCallbackPage`. */
export const PKCE_VERIFIER_STORAGE_KEY = 'pt_kc_code_verifier'

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]!)
  return btoa(bin).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** RFC 7636 code verifier + S256 challenge for Keycloak (or any OIDC) PKCE. */
export async function createPkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const codeVerifier = base64UrlEncode(bytes.buffer)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  const codeChallenge = base64UrlEncode(digest)
  return { codeVerifier, codeChallenge }
}
