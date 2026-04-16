import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import type { UserRole } from '../../types/roles.js'
import { requireAuth } from '../../middleware/auth.js'
import { getSqlPool } from '../../db/pool.js'
import { createUser, findUserByEmail, findUserById, updateUserProfile } from '../../repos/usersRepo.js'
import { findValidRefreshToken, revokeAllRefreshTokensForUser, revokeRefreshToken } from '../../repos/refreshTokensRepo.js'
import { sqlUserIdFromJwtUser } from '../../lib/authUserId.js'
import { mergeGuestCartIntoUser } from '../../services/cartService.js'
import { CART_COOKIE } from '../../services/cartService.js'
import { accessTokenCookieOptions } from '../../services/authCookies.js'
import { issueAccessToken, setAuthCookiesForUser } from '../../services/authSession.js'
import {
  buildKeycloakAuthorizeUrl,
  exchangeKeycloakCode,
  fetchKeycloakProfileFromAccessToken,
  KeycloakAuthError,
} from '../../services/keycloakOidc.js'
import { fetchKeycloakPasswordGrantToken } from '../../services/keycloakToken.js'
import { upsertUserFromKeycloakProfile } from '../../services/keycloakProvision.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import {
  isKeycloakOidcConfiguredKc,
  isRocpEnvReadyKc,
  mergeKeycloakRuntime,
  mergeNotifyRuntime,
  notifyInboxBrowserUrl,
  type KeycloakRuntimeConfig,
} from '../../services/integrationRuntimeConfig.js'

export const authRouter = Router()

const SALT_ROUNDS = 10

/** Static index for developers (no secrets). */
const KEYCLOAK_HTTP_API_INDEX = [
  {
    method: 'GET' as const,
    path: '/api/auth/public-config',
    csrf: false,
    summary: 'Public auth hints (e.g. paytodayForgotPasswordUrl, notifyInboxUrl); no secrets.',
  },
  {
    method: 'POST' as const,
    path: '/api/auth/login',
    csrf: true,
    summary:
      'Sign in. JSON: { email, password, authSource?: "local" | "paytoday" }. Default local DB bcrypt; paytoday uses Keycloak ROPC when KEYCLOAK_ROPC_LOGIN_ENABLED and token/client env are set.',
  },
  {
    method: 'GET' as const,
    path: '/api/auth/keycloak/routes',
    csrf: false,
    summary: 'This index of Keycloak-related auth routes.',
  },
  {
    method: 'GET' as const,
    path: '/api/auth/keycloak/status',
    csrf: false,
    summary: 'Whether OIDC is configured; Keycloak-only and ROPC flags.',
  },
  {
    method: 'GET' as const,
    path: '/api/auth/keycloak/start',
    csrf: false,
    summary: 'Returns Keycloak authorize URL for PKCE (query: redirect_uri, code_challenge, code_challenge_method, after_login).',
  },
  {
    method: 'POST' as const,
    path: '/api/auth/keycloak/callback',
    csrf: true,
    summary: 'Exchange authorization code for app session cookies (JSON body: code, redirect_uri, code_verifier, state).',
  },
  {
    method: 'POST' as const,
    path: '/api/auth/keycloak/ro-password',
    csrf: true,
    summary: 'Optional ROPC sign-in when KEYCLOAK_ROPC_LOGIN_ENABLED=true (JSON: username, password, optional audience).',
  },
]

authRouter.get('/keycloak/routes', (_req, res) => {
  res.json({
    documentationFile: 'docs/KEYCLOAK_API.md',
    endpoints: KEYCLOAK_HTTP_API_INDEX,
  })
})

authRouter.get('/keycloak/status', async (_req, res) => {
  const pool = await getSqlPool()
  const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
  const enabled = isKeycloakOidcConfiguredKc(kc)
  const ropcEnvReady = isRocpEnvReadyKc(kc)
  res.json({
    enabled,
    clientId: kc.oidcClientId || undefined,
    keycloakOnly: kc.signInOnly,
    /** When `keycloakOnly` is true but Keycloak env is incomplete, the UI should show a configuration warning. */
    keycloakReady: kc.signInOnly ? enabled : undefined,
    /** `POST /api/auth/keycloak/ro-password` and `POST /api/auth/login` with `authSource: "paytoday"` when this is true. */
    ropcLoginEnabled: kc.ropcLoginEnabled && ropcEnvReady,
    /** When false and `keycloakOnly` is true, hide local email/password forms (unless you intentionally allow dual sign-in). */
    localPasswordLoginAllowed: !kc.signInOnly || kc.allowLocalPasswordLogin,
  })
})

/** No secrets — forgot-password URL for PayToday users, aligned with NedAccess `GET /auth/public-config`. */
authRouter.get('/public-config', async (_req, res) => {
  const pool = await getSqlPool()
  const map = await getIntegrationSettingsMap(pool)
  const kc = mergeKeycloakRuntime(map)
  const notify = mergeNotifyRuntime(map)
  res.json({
    paytodayForgotPasswordUrl: kc.paytodayForgotPasswordUrl || undefined,
    notifyInboxUrl: notifyInboxBrowserUrl(notify),
    publicStoreUrl: env.publicStoreUrl,
  })
})

/** Local email/password login/register blocked when KEYCLOAK_SIGN_IN_ONLY=true unless dual-login override is set. */
function rejectPasswordAuthIfKeycloakOnly(res: import('express').Response, kc: KeycloakRuntimeConfig): boolean {
  if (!kc.signInOnly) return false
  if (kc.allowLocalPasswordLogin) return false
  if (!isKeycloakOidcConfiguredKc(kc)) {
    res.status(503).json({
      error:
        'KEYCLOAK_SIGN_IN_ONLY is enabled but Keycloak OIDC is not configured. Set KEYCLOAK_ISSUER (or KEYCLOAK_TOKEN_URL) and KEYCLOAK_CLIENT_ID in the environment or dbo.integration_settings.',
    })
    return true
  }
  res.status(403).json({
    error: 'Password sign-in is disabled. Use “Continue with Keycloak”.',
    keycloakOnly: true,
  })
  return true
}

async function completeKeycloakPasswordGrantSession(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  req: import('express').Request,
  res: import('express').Response,
  username: string,
  password: string,
  audience: 'frontend' | 'mobile',
  kc: KeycloakRuntimeConfig,
): Promise<void> {
  if (!kc.tokenUrl || !kc.issuerBase) {
    res.status(503).json({
      error:
        'Keycloak password grant is not configured. Set KEYCLOAK_TOKEN_URL and KEYCLOAK_ISSUER (or a token URL from which the issuer can be derived) in env or dbo.integration_settings.',
      code: 'paytoday_login_failed',
    })
    return
  }
  if (audience === 'mobile') {
    if (!kc.mobileClientId || !kc.mobileClientSecret) {
      res.status(503).json({
        error: 'Keycloak mobile client is not configured for password grant.',
        code: 'paytoday_login_failed',
      })
      return
    }
  } else if (!kc.frontendClientId || !kc.frontendClientSecret) {
    res.status(503).json({
      error:
        'Keycloak frontend client is not configured for password grant. Set KEYCLOAK_FRONTEND_CLIENT_ID and KEYCLOAK_FRONTEND_CLIENT_SECRET in env or dbo.integration_settings.',
      code: 'paytoday_login_failed',
    })
    return
  }
  try {
    const tok = await fetchKeycloakPasswordGrantToken(kc, audience, username, password)
    const profile = await fetchKeycloakProfileFromAccessToken(kc, tok.access_token)
    const row = await upsertUserFromKeycloakProfile(pool, {
      keycloakSub: profile.keycloakSub,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
    })
    const sessionToken = req.cookies?.[CART_COOKIE] as string | undefined
    if (sessionToken) {
      try {
        await mergeGuestCartIntoUser(pool, sessionToken, row.id)
      } catch {
        /* ignore */
      }
    }
    await revokeAllRefreshTokensForUser(pool, row.id)
    await setAuthCookiesForUser(res, pool, row.id, row.email, row.role)
    res.json({ ok: true, user: { id: row.id, email: row.email, role: row.role }, authSource: 'paytoday' })
  } catch (e) {
    if (e instanceof KeycloakAuthError) {
      res.status(e.statusCode).json({ error: e.message, code: 'paytoday_login_failed' })
      return
    }
    const msg = e instanceof Error ? e.message : 'Keycloak sign-in failed'
    res.status(401).json({ error: msg, code: 'paytoday_login_failed' })
  }
}

authRouter.get('/keycloak/start', async (req, res) => {
  try {
    const pool = await getSqlPool()
    const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
    const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : ''
    const codeChallenge = typeof req.query.code_challenge === 'string' ? req.query.code_challenge : ''
    const codeChallengeMethod = typeof req.query.code_challenge_method === 'string' ? req.query.code_challenge_method : ''
    const afterLogin = typeof req.query.after_login === 'string' ? req.query.after_login : '/account'
    if (!redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
      res
        .status(400)
        .json({ error: 'redirect_uri, code_challenge, and code_challenge_method=S256 are required' })
      return
    }
    const url = await buildKeycloakAuthorizeUrl(kc, {
      redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      afterLogin,
    })
    res.json({ url })
  } catch (e) {
    if (e instanceof KeycloakAuthError) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    throw e
  }
})

authRouter.post('/keycloak/callback', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database required for Keycloak sign-in' })
    return
  }
  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  const redirectUri = typeof req.body?.redirect_uri === 'string' ? req.body.redirect_uri : ''
  const codeVerifier = typeof req.body?.code_verifier === 'string' ? req.body.code_verifier : ''
  const state = typeof req.body?.state === 'string' ? req.body.state : ''
  if (!code || !redirectUri || !codeVerifier || !state) {
    res.status(400).json({ error: 'code, redirect_uri, code_verifier, and state are required' })
    return
  }
  try {
    const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
    const profile = await exchangeKeycloakCode(kc, { code, redirectUri, codeVerifier, state })
    const row = await upsertUserFromKeycloakProfile(pool, {
      keycloakSub: profile.keycloakSub,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
    })
    const sessionToken = req.cookies?.[CART_COOKIE] as string | undefined
    if (sessionToken) {
      try {
        await mergeGuestCartIntoUser(pool, sessionToken, row.id)
      } catch {
        /* ignore */
      }
    }
    await revokeAllRefreshTokensForUser(pool, row.id)
    await setAuthCookiesForUser(res, pool, row.id, row.email, row.role)
    res.json({ ok: true, user: { id: row.id, email: row.email, role: row.role }, next: profile.next })
  } catch (e) {
    if (e instanceof KeycloakAuthError) {
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    throw e
  }
})

/**
 * Keycloak resource-owner password grant → same session cookies as OIDC callback.
 * Disabled unless `KEYCLOAK_ROPC_LOGIN_ENABLED=true` and token + frontend client credentials are set.
 * Does not return Keycloak access tokens to the client.
 */
authRouter.post('/keycloak/ro-password', async (req, res) => {
  const pool = await getSqlPool()
  const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
  if (!kc.ropcLoginEnabled) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!pool) {
    res.status(503).json({ error: 'Database required for Keycloak sign-in' })
    return
  }
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const audience = req.body?.audience === 'mobile' ? 'mobile' : 'frontend'
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' })
    return
  }
  await completeKeycloakPasswordGrantSession(pool, req, res, username, password, audience, kc)
})

authRouter.post('/register', async (req, res) => {
  const pool = await getSqlPool()
  const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
  if (rejectPasswordAuthIfKeycloakOnly(res, kc)) return
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable — start SQL Server or use login without registering' })
    return
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : null
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' })
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' })
    return
  }
  const existing = await findUserByEmail(pool, email)
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const userId = await createUser(pool, { email, passwordHash, fullName, role: 'customer' })
  const sessionToken = req.cookies?.[CART_COOKIE] as string | undefined
  if (sessionToken) {
    try {
      await mergeGuestCartIntoUser(pool, sessionToken, userId)
    } catch {
      /* ignore merge failures */
    }
  }
  await setAuthCookiesForUser(res, pool, userId, email, 'customer')
  res.json({ ok: true, user: { id: userId, email, role: 'customer' } })
})

authRouter.post('/login', async (req, res) => {
  const authSource = req.body?.authSource === 'paytoday' ? 'paytoday' : 'local'

  if (authSource === 'paytoday') {
    const poolEarly = await getSqlPool()
    const kcEarly = mergeKeycloakRuntime(await getIntegrationSettingsMap(poolEarly))
    if (!kcEarly.ropcLoginEnabled) {
      res.status(400).json({
        error:
          'PayToday password sign-in is disabled. Set KEYCLOAK_ROPC_LOGIN_ENABLED=true and Keycloak token URL + client credentials (env or dbo.integration_settings), use “Continue with Keycloak”, or sign in with a store password when allowed.',
        code: 'paytoday_login_failed',
      })
      return
    }
    if (!isRocpEnvReadyKc(kcEarly)) {
      res.status(503).json({
        error: 'Keycloak resource-owner (password) grant is not fully configured on the server.',
        code: 'paytoday_login_failed',
      })
      return
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!email || !password) {
      res.status(400).json({ error: 'email and password required' })
      return
    }
    const pool = await getSqlPool()
    if (!pool) {
      res.status(503).json({
        error: 'Database required for PayToday sign-in',
        code: 'paytoday_login_failed',
      })
      return
    }
    await completeKeycloakPasswordGrantSession(pool, req, res, email, password, 'frontend', kcEarly)
    return
  }

  const pool = await getSqlPool()
  const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
  if (rejectPasswordAuthIfKeycloakOnly(res, kc)) return
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' })
    return
  }

  let role: UserRole = 'customer'
  if (env.allowDevRoleHeader && env.nodeEnv !== 'production') {
    const roleHeader = req.get('x-dev-role') as UserRole | undefined
    if (roleHeader && ['customer', 'admin', 'ops', 'fulfillment'].includes(roleHeader)) {
      role = roleHeader
    }
  }

  if (pool) {
    const user = await findUserByEmail(pool, email)
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    if (!user.password_hash) {
      res.status(401).json({
        error: 'This account uses Keycloak. Use “Continue with Keycloak” on the sign-in page.',
      })
      return
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    role = user.role
    const sessionToken = req.cookies?.[CART_COOKIE] as string | undefined
    if (sessionToken) {
      try {
        await mergeGuestCartIntoUser(pool, sessionToken, user.id)
      } catch {
        /* ignore */
      }
    }
    await revokeAllRefreshTokensForUser(pool, user.id)
    await setAuthCookiesForUser(res, pool, user.id, user.email, user.role)
    res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role }, authSource: 'local' })
    return
  }

  const token = jwt.sign({ sub: `user_${email}`, email, role }, env.jwtSecret, { expiresIn: '24h' })
  res.cookie(env.cookieName, token, accessTokenCookieOptions())
  res.json({
    ok: true,
    user: { email, role },
    warning: 'Database unavailable; using demo session (no persisted account)',
    authSource: 'local',
  })
})

authRouter.post('/refresh', async (req, res) => {
  const pool = await getSqlPool()
  const raw = req.cookies?.[env.refreshCookieName] as string | undefined
  if (!pool || !raw) {
    res.status(401).json({ error: 'No refresh session' })
    return
  }
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest()
  const row = await findValidRefreshToken(pool, hash)
  if (!row) {
    res.status(401).json({ error: 'Invalid refresh' })
    return
  }
  const access = issueAccessToken(row.userId, row.email, row.role as UserRole)
  res.cookie(env.cookieName, access, accessTokenCookieOptions())
  res.json({ ok: true })
})

authRouter.post('/logout', async (req, res) => {
  const pool = await getSqlPool()
  const raw = req.cookies?.[env.refreshCookieName] as string | undefined
  if (pool && raw) {
    const hash = crypto.createHash('sha256').update(raw, 'utf8').digest()
    await revokeRefreshToken(pool, hash)
  }
  res.clearCookie(env.cookieName)
  res.clearCookie(env.refreshCookieName)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  const uid = sqlUserIdFromJwtUser(req.user)
  if (pool && uid) {
    try {
      const row = await findUserById(pool, uid)
      if (row) {
        res.json({
          user: {
            ...req.user,
            fullName: row.full_name,
            notificationChannel: row.notification_channel,
          },
        })
        return
      }
    } catch (e) {
      console.warn('[auth/me] findUserById failed:', e instanceof Error ? e.message : e)
    }
  }
  res.json({ user: req.user })
})

authRouter.patch('/me', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  if (!uid) {
    res.status(400).json({
      error:
        'This session is not linked to a database user id (e.g. demo login when the API had no SQL). Register or sign in with Keycloak to persist a profile.',
    })
    return
  }
  const body = req.body ?? {}
  let fullName: string | null | undefined
  if (Object.prototype.hasOwnProperty.call(body, 'fullName')) {
    if (typeof body.fullName !== 'string') {
      res.status(400).json({ error: 'fullName must be a string' })
      return
    }
    fullName = body.fullName.trim() || null
  }
  const notificationChannel = typeof body.notificationChannel === 'string' ? body.notificationChannel : undefined

  if (fullName === undefined && notificationChannel === undefined) {
    res.status(400).json({ error: 'No updates provided' })
    return
  }

  await updateUserProfile(pool, uid, { fullName, notificationChannel })
  res.json({ ok: true })
})
