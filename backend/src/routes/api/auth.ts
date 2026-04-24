import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import type { UserRole } from '../../types/roles.js'
import { requireAuth } from '../../middleware/auth.js'
import { getSqlPool } from '../../db/pool.js'
import { parseEmailString, parseOptionalDisplayName } from '../../lib/inputValidators.js'
import {
  createUser,
  deleteCustomerUserAccount,
  findUserByEmail,
  findUserById,
  listMerchantsForUser,
  updateUserProfile,
  resetLoginFailures,
  recordFailedLogin,
  updateUserEmail,
  setUserPasswordHash,
  setEmailVerificationToken,
  findUserIdByEmailVerificationHash,
  markEmailVerified,
} from '../../repos/usersRepo.js'
import {
  findKeycloakThrottleByEmail,
  recordFailedKeycloakThrottle,
  resetKeycloakThrottle,
} from '../../repos/keycloakLoginThrottleRepo.js'
import {
  insertPasswordResetToken,
  findValidPasswordResetUserId,
  markPasswordResetTokenUsed,
} from '../../repos/passwordResetTokensRepo.js'
import { findValidRefreshToken, revokeAllRefreshTokensForUser, revokeRefreshToken } from '../../repos/refreshTokensRepo.js'
import { sqlUserIdFromJwtUser } from '../../lib/authUserId.js'
import { mergeGuestCartIntoUser } from '../../services/cartService.js'
import { CART_COOKIE } from '../../services/cartService.js'
import { accessTokenCookieOptions } from '../../services/authCookies.js'
import { issueAccessToken, setAuthCookiesForUser } from '../../services/authSession.js'
import { KeycloakAuthError, keycloakPasswordSignIn } from '../../services/keycloakClient.js'
import { upsertUserFromKeycloakProfile } from '../../services/keycloakProvision.js'
import { getIntegrationSettingsMap } from '../../services/integrationSettingsCache.js'
import {
  isKeycloakConfigured,
  mergeKeycloakRuntime,
  mergeNotifyRuntime,
  notifyInboxBrowserUrl,
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
      'Sign in. JSON: { email, password, authSource?: "local" | "paytoday" }. Default local DB bcrypt; paytoday uses Keycloak password grant server-side when KEYCLOAK_BASE_URL/REALM/CLIENT_ID are set.',
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
    summary:
      'Returns paytodaySignInEnabled + localPasswordLoginAllowed so the SPA knows which /api/auth/login methods are available.',
  },
  {
    method: 'POST' as const,
    path: '/api/auth/delete-account',
    csrf: true,
    summary:
      'Customer self-service: JSON { confirmEmail, currentPassword? }. confirmEmail must match the signed-in email; store-password accounts require currentPassword. Revokes sessions and deletes the SQL user (orders/carts detached).',
  },
]

authRouter.get('/keycloak/routes', (_req, res) => {
  res.json({
    documentationFile: 'docs/KEYCLOAK_API.md',
    endpoints: KEYCLOAK_HTTP_API_INDEX,
  })
})

/**
 * Auth-method availability for the SPA. The SPA never calls Keycloak directly;
 * it just needs to know which `/api/auth/login` `authSource` values work right now.
 */
authRouter.get('/keycloak/status', async (_req, res) => {
  const pool = await getSqlPool()
  const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
  res.json({
    /** `POST /api/auth/login` with `authSource: "paytoday"` works when this is true. */
    paytodaySignInEnabled: isKeycloakConfigured(kc),
    /** Local store sign-in and registration are always available; role-based gating lives in `users.role`. */
    localPasswordLoginAllowed: true,
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

async function isKeycloakSignInLocked(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  emailLower: string,
): Promise<boolean> {
  const user = await findUserByEmail(pool, emailLower)
  if (user?.locked_until && new Date(user.locked_until) > new Date()) return true
  const th = await findKeycloakThrottleByEmail(pool, emailLower)
  if (th?.locked_until && new Date(th.locked_until) > new Date()) return true
  return false
}

async function recordKeycloakAuthFailure(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  emailLower: string,
): Promise<void> {
  const user = await findUserByEmail(pool, emailLower)
  if (user?.keycloak_sub) {
    await recordFailedLogin(pool, user.id, env.authLockoutMaxAttempts, env.authLockoutMinutes)
  } else {
    await recordFailedKeycloakThrottle(pool, emailLower, env.authLockoutMaxAttempts, env.authLockoutMinutes)
  }
}

async function clearKeycloakAuthFailuresOnSuccess(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  userId: string,
  emailLower: string,
): Promise<void> {
  await resetLoginFailures(pool, userId)
  await resetKeycloakThrottle(pool, emailLower)
}

/**
 * Sign in a PayToday user via Keycloak password grant and hydrate local `dbo.users`.
 * Called from `POST /api/auth/login` when `authSource: "paytoday"`.
 */
async function completePaytodaySignIn(
  pool: NonNullable<Awaited<ReturnType<typeof getSqlPool>>>,
  req: import('express').Request,
  res: import('express').Response,
  email: string,
  password: string,
): Promise<void> {
  const kc = mergeKeycloakRuntime(await getIntegrationSettingsMap(pool))
  if (!isKeycloakConfigured(kc)) {
    res.status(400).json({
      error:
        "PayToday sign-in isn't configured on this server. Set KEYCLOAK_BASE_URL, KEYCLOAK_REALM, and KEYCLOAK_CLIENT_ID.",
      code: 'paytoday_login_failed',
    })
    return
  }
  const emailParsed = parseEmailString(email, 'email')
  if (!emailParsed.ok) {
    res.status(400).json({ error: emailParsed.message, field: emailParsed.field, code: 'validation_error' })
    return
  }
  const emailLower = emailParsed.value
  if (await isKeycloakSignInLocked(pool, emailLower)) {
    res.status(423).json({
      error: 'Account temporarily locked due to failed sign-in attempts. Try again later.',
      code: 'account_locked',
    })
    return
  }
  try {
    const profile = await keycloakPasswordSignIn(kc, email, password)
    const profileEmailLower = profile.email.trim().toLowerCase()
    if (await isKeycloakSignInLocked(pool, profileEmailLower)) {
      res.status(423).json({
        error: 'Account temporarily locked due to failed sign-in attempts. Try again later.',
        code: 'account_locked',
      })
      return
    }
    const row = await upsertUserFromKeycloakProfile(pool, {
      keycloakSub: profile.keycloakSub,
      email: profile.email,
      fullName: profile.fullName,
      emailVerified: profile.emailVerified,
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
    await clearKeycloakAuthFailuresOnSuccess(pool, row.id, profileEmailLower)
    await setAuthCookiesForUser(res, pool, row.id, row.email, row.role)
    res.json({ ok: true, user: { id: row.id, email: row.email, role: row.role }, authSource: 'paytoday' })
  } catch (e) {
    try {
      await recordKeycloakAuthFailure(pool, emailLower)
    } catch {
      /* ignore throttle DB errors */
    }
    if (e instanceof KeycloakAuthError) {
      res.status(e.statusCode).json({ error: e.message, code: 'paytoday_login_failed' })
      return
    }
    const msg = e instanceof Error ? e.message : 'PayToday sign-in failed'
    res.status(401).json({ error: msg, code: 'paytoday_login_failed' })
  }
}

authRouter.post('/register', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable — start SQL Server or use login without registering' })
    return
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!password) {
    res.status(400).json({ error: 'email and password required' })
    return
  }
  const emailR = parseEmailString(req.body?.email, 'email')
  if (!emailR.ok) {
    res.status(400).json({ error: emailR.message, field: emailR.field, code: 'validation_error' })
    return
  }
  const emailNorm = emailR.value
  const fullNameR = parseOptionalDisplayName(req.body?.fullName, 'fullName')
  if (!fullNameR.ok) {
    res.status(400).json({ error: fullNameR.message, field: fullNameR.field, code: 'validation_error' })
    return
  }
  const fullName = fullNameR.value
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' })
    return
  }
  const existing = await findUserByEmail(pool, emailNorm)
  if (existing) {
    if (existing.keycloak_sub) {
      res.status(409).json({
        error: 'This email already has a PayToday account. Sign in with PayToday instead of registering.',
        code: 'paytoday_account_exists',
      })
      return
    }
    res.status(409).json({ error: 'Email already registered' })
    return
  }
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const userId = await createUser(pool, { email: emailNorm, passwordHash, fullName, role: 'customer' })
  const rawVerify = crypto.randomBytes(32).toString('hex')
  const verifyHash = crypto.createHash('sha256').update(rawVerify, 'utf8').digest()
  const verifyExp = new Date(Date.now() + 48 * 60 * 60 * 1000)
  try {
    await setEmailVerificationToken(pool, userId, verifyHash, verifyExp)
  } catch (e) {
    console.warn('[auth/register] email verification token skipped:', e instanceof Error ? e.message : e)
  }
  const sessionToken = req.cookies?.[CART_COOKIE] as string | undefined
  if (sessionToken) {
    try {
      await mergeGuestCartIntoUser(pool, sessionToken, userId)
    } catch {
      /* ignore merge failures */
    }
  }
  await setAuthCookiesForUser(res, pool, userId, emailNorm, 'customer')
  const body: Record<string, unknown> = {
    ok: true,
    user: { id: userId, email: emailNorm, role: 'customer' },
    emailVerificationRequired: true,
  }
  if (env.nodeEnv !== 'production' && process.env.DEV_EMAIL_VERIFICATION_REVEAL_TOKEN === 'true') {
    body.devVerificationToken = rawVerify
  }
  res.json(body)
})

authRouter.post('/login', async (req, res) => {
  const authSource = req.body?.authSource === 'paytoday' ? 'paytoday' : 'local'

  if (authSource === 'paytoday') {
    const poolEarly = await getSqlPool()
    const kcEarly = mergeKeycloakRuntime(await getIntegrationSettingsMap(poolEarly))
    if (!isKeycloakConfigured(kcEarly)) {
      res.status(400).json({
        error:
          "PayToday sign-in isn't configured on this server. Set KEYCLOAK_BASE_URL, KEYCLOAK_REALM, and KEYCLOAK_CLIENT_ID.",
        code: 'paytoday_login_failed',
      })
      return
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!password) {
      res.status(400).json({ error: 'email and password required' })
      return
    }
    const emailPayR = parseEmailString(req.body?.email, 'email')
    if (!emailPayR.ok) {
      res.status(400).json({ error: emailPayR.message, field: emailPayR.field, code: 'validation_error' })
      return
    }
    const email = emailPayR.value
    if (!poolEarly) {
      res.status(503).json({
        error: 'Database required for PayToday sign-in',
        code: 'paytoday_login_failed',
      })
      return
    }
    await completePaytodaySignIn(poolEarly, req, res, email, password)
    return
  }

  const pool = await getSqlPool()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!password) {
    res.status(400).json({ error: 'email and password required' })
    return
  }
  const emailLocR = parseEmailString(req.body?.email, 'email')
  if (!emailLocR.ok) {
    res.status(400).json({ error: emailLocR.message, field: emailLocR.field, code: 'validation_error' })
    return
  }
  const email = emailLocR.value

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
    if (!user.password_hash || user.keycloak_sub) {
      res.status(409).json({
        error: 'This email uses a PayToday account. Switch to PayToday sign-in.',
        code: 'use_paytoday_account',
      })
      return
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      res.status(423).json({
        error: 'Account temporarily locked due to failed sign-in attempts. Try again later.',
        code: 'account_locked',
      })
      return
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      await recordFailedLogin(pool, user.id, env.authLockoutMaxAttempts, env.authLockoutMinutes)
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    await resetLoginFailures(pool, user.id)
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

authRouter.get('/verify-email', async (req, res) => {
  const pool = await getSqlPool()
  const raw = typeof req.query.token === 'string' ? req.query.token.trim() : ''
  if (!pool || !raw) {
    res.status(400).json({ error: 'token required' })
    return
  }
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest()
  const userId = await findUserIdByEmailVerificationHash(pool, hash)
  if (!userId) {
    res.status(400).json({ error: 'Invalid or expired verification link' })
    return
  }
  await markEmailVerified(pool, userId)
  res.json({ ok: true, message: 'Email verified.' })
})

authRouter.post('/forgot-password', async (req, res) => {
  const pool = await getSqlPool()
  const emailR = parseEmailString(req.body?.email, 'email')
  const email = emailR.ok ? emailR.value : ''
  const body: Record<string, unknown> = { ok: true, message: 'If an account exists, a reset link will be sent.' }
  if (!pool || !email) {
    res.json(body)
    return
  }
  const user = await findUserByEmail(pool, email)
  if (!user?.password_hash) {
    res.json(body)
    return
  }
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  await insertPasswordResetToken(pool, user.id, hash, expiresAt)
  if (env.nodeEnv !== 'production' && env.devPasswordResetRevealToken) {
    body.devResetToken = raw
    body.devResetHint = 'Set DEV_PASSWORD_RESET_REVEAL_TOKEN=false in production; integrate email delivery for real resets.'
  }
  res.json(body)
})

authRouter.post('/reset-password', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  const confirm = typeof req.body?.confirmNewPassword === 'string' ? req.body.confirmNewPassword : ''
  if (!token || !newPassword || newPassword !== confirm) {
    res.status(400).json({ error: 'token, newPassword, and matching confirmNewPassword required' })
    return
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' })
    return
  }
  const hash = crypto.createHash('sha256').update(token, 'utf8').digest()
  const found = await findValidPasswordResetUserId(pool, hash)
  if (!found) {
    res.status(400).json({ error: 'Invalid or expired reset link' })
    return
  }
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  await setUserPasswordHash(pool, found.userId, passwordHash)
  await markPasswordResetTokenUsed(pool, found.tokenId)
  await revokeAllRefreshTokensForUser(pool, found.userId)
  const row = await findUserById(pool, found.userId)
  if (row) {
    await setAuthCookiesForUser(res, pool, row.id, row.email, row.role)
  }
  res.json({ ok: true })
})

authRouter.post('/resend-verification', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!pool || !uid) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const row = await findUserById(pool, uid)
  if (!row?.password_hash) {
    res.status(400).json({ error: 'Email verification applies to password accounts only.' })
    return
  }
  if (row.email_verified) {
    res.json({ ok: true, alreadyVerified: true })
    return
  }
  const raw = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest()
  const verifyExp = new Date(Date.now() + 48 * 60 * 60 * 1000)
  await setEmailVerificationToken(pool, uid, hash, verifyExp)
  const out: Record<string, unknown> = { ok: true }
  if (env.nodeEnv !== 'production' && process.env.DEV_EMAIL_VERIFICATION_REVEAL_TOKEN === 'true') {
    out.devVerificationToken = raw
  }
  res.json(out)
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  const uid = sqlUserIdFromJwtUser(req.user)
  if (pool && uid) {
    try {
      const row = await findUserById(pool, uid)
      if (row) {
        const merchants = await listMerchantsForUser(pool, uid)
        res.json({
          user: {
            ...req.user,
            fullName: row.full_name,
            notificationChannel: row.notification_channel,
            emailVerified: Boolean(row.email_verified),
            accountKind: row.password_hash ? 'local' : 'paytoday',
            merchants: merchants.map((m) => ({
              payTodayMerchantId: m.payTodayMerchantId,
              name: m.name,
              slug: m.slug,
              isPrimary: m.isPrimary,
            })),
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
  const row = await findUserById(pool, uid)
  if (!row) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const body = req.body ?? {}
  let fullName: string | null | undefined
  if (Object.prototype.hasOwnProperty.call(body, 'fullName')) {
    const fn = parseOptionalDisplayName(body.fullName, 'fullName')
    if (!fn.ok) {
      res.status(400).json({ error: fn.message, field: fn.field, code: 'validation_error' })
      return
    }
    fullName = fn.value
  }
  const notificationChannel = typeof body.notificationChannel === 'string' ? body.notificationChannel : undefined
  if (notificationChannel !== undefined) {
    const allowed = new Set(['email', 'in_app', 'both'])
    if (!allowed.has(notificationChannel)) {
      res.status(400).json({ error: 'notificationChannel must be email, in_app, or both' })
      return
    }
  }

  const wantsEmail = Object.prototype.hasOwnProperty.call(body, 'email')
  const wantsPassword =
    Object.prototype.hasOwnProperty.call(body, 'newPassword') ||
    Object.prototype.hasOwnProperty.call(body, 'confirmNewPassword')

  const newEmailRaw = wantsEmail && typeof body.email === 'string' ? body.email : ''
  const confirmEmailRaw = wantsEmail && typeof body.confirmEmail === 'string' ? body.confirmEmail : ''
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
  const confirmNewPassword = typeof body.confirmNewPassword === 'string' ? body.confirmNewPassword : ''

  if (wantsEmail || wantsPassword) {
    if (!row.password_hash) {
      res.status(400).json({
        error: 'Password changes and email changes for Keycloak accounts must be done in your identity provider.',
      })
      return
    }
    if (!currentPassword) {
      res.status(400).json({ error: 'currentPassword is required to change email or password' })
      return
    }
    if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
      res.status(401).json({ error: 'Current password is incorrect' })
      return
    }
  }

  if (wantsEmail) {
    const newEmailParsed = parseEmailString(newEmailRaw, 'email')
    if (!newEmailParsed.ok) {
      res.status(400).json({
        error: newEmailParsed.message,
        field: newEmailParsed.field,
        code: 'validation_error',
      })
      return
    }
    const confirmEmailParsed = parseEmailString(confirmEmailRaw, 'confirmEmail')
    if (!confirmEmailParsed.ok) {
      res.status(400).json({
        error: confirmEmailParsed.message,
        field: confirmEmailParsed.field,
        code: 'validation_error',
      })
      return
    }
    const newEmail = newEmailParsed.value
    const confirmEmail = confirmEmailParsed.value
    if (newEmail !== confirmEmail) {
      res.status(400).json({ error: 'email and confirmEmail must match' })
      return
    }
    if (newEmail === row.email.toLowerCase()) {
      res.status(400).json({ error: 'That is already your email' })
      return
    }
    const taken = await findUserByEmail(pool, newEmail)
    if (taken) {
      res.status(409).json({ error: 'Email already in use' })
      return
    }
    await updateUserEmail(pool, uid, newEmail)
    const rawVerify = crypto.randomBytes(32).toString('hex')
    const vHash = crypto.createHash('sha256').update(rawVerify, 'utf8').digest()
    const verifyExp = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await pool
      .request()
      .input('id', uid)
      .query(`UPDATE dbo.users SET email_verified = 0, updated_at = SYSUTCDATETIME() WHERE id = @id`)
    await setEmailVerificationToken(pool, uid, vHash, verifyExp)
    await revokeAllRefreshTokensForUser(pool, uid)
    await setAuthCookiesForUser(res, pool, uid, newEmail, row.role)
    res.json({
      ok: true,
      emailChanged: true,
      emailVerificationRequired: true,
      ...(env.nodeEnv !== 'production' && process.env.DEV_EMAIL_VERIFICATION_REVEAL_TOKEN === 'true'
        ? { devVerificationToken: rawVerify }
        : {}),
    })
    return
  }

  if (wantsPassword) {
    if (!newPassword || newPassword !== confirmNewPassword) {
      res.status(400).json({ error: 'newPassword and confirmNewPassword must match' })
      return
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'password must be at least 8 characters' })
      return
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await setUserPasswordHash(pool, uid, passwordHash)
    await revokeAllRefreshTokensForUser(pool, uid)
    await setAuthCookiesForUser(res, pool, uid, row.email, row.role)
    res.json({ ok: true, passwordChanged: true })
    return
  }

  if (fullName === undefined && notificationChannel === undefined) {
    res.status(400).json({ error: 'No updates provided' })
    return
  }

  await updateUserProfile(pool, uid, { fullName, notificationChannel })
  res.json({ ok: true })
})

authRouter.post('/delete-account', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  if (!uid) {
    res.status(400).json({
      error:
        'This session is not linked to a database profile. Sign out and use an account that is stored in the database to delete it.',
    })
    return
  }

  const row = await findUserById(pool, uid)
  if (!row) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  if (row.role !== 'customer') {
    res.status(403).json({
      error: 'Staff and operations accounts cannot be removed from the storefront. Use an administrator or your identity provider.',
    })
    return
  }

  const body = req.body ?? {}
  const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : ''
  if (!confirmEmail || confirmEmail !== row.email.toLowerCase()) {
    res.status(400).json({ error: 'Type your account email exactly to confirm deletion.' })
    return
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  if (row.password_hash) {
    if (!currentPassword) {
      res.status(400).json({ error: 'currentPassword is required for store password accounts' })
      return
    }
    if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
      res.status(401).json({ error: 'Current password is incorrect' })
      return
    }
  }

  try {
    await revokeAllRefreshTokensForUser(pool, uid)
    await deleteCustomerUserAccount(pool, uid)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'USER_NOT_FOUND') {
      res.status(404).json({ error: 'User not found' })
      return
    }
    console.error('[auth/delete-account]', e)
    res.status(500).json({ error: 'Could not delete account. Try again or contact support.' })
    return
  }

  res.clearCookie(env.cookieName)
  res.clearCookie(env.refreshCookieName)
  res.json({ ok: true })
})
