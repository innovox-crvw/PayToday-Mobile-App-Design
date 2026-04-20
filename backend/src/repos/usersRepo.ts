import type { ConnectionPool } from 'mssql'
import type { UserRole } from '../types/roles.js'

/**
 * App user row. **PayToday / Keycloak-backed accounts** are identified by non-null `keycloak_sub`
 * with `password_hash` null (credentials live in Keycloak, not in this DB). Local store accounts have
 * a bcrypt `password_hash` and usually null `keycloak_sub`.
 */
export interface UserRow {
  id: string
  email: string
  /** Null for Keycloak-only accounts (migration 008). */
  password_hash: string | null
  full_name: string | null
  role: UserRole
  notification_channel: string
  /** Keycloak OIDC subject; when set, this row is linked to IdP identity (PayToday user). */
  keycloak_sub?: string | null
  email_verified?: boolean
  failed_login_count?: number
  locked_until?: Date | null
}

export async function findUserByEmail(pool: ConnectionPool, email: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('email', email.toLowerCase())
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub,
        ISNULL(email_verified, 1) AS email_verified,
        ISNULL(failed_login_count, 0) AS failed_login_count,
        locked_until
      FROM dbo.users WHERE email = @email
    `)
  return r.recordset[0] ?? null
}

export async function findUserById(pool: ConnectionPool, userId: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('id', userId)
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub,
        ISNULL(email_verified, 1) AS email_verified,
        ISNULL(failed_login_count, 0) AS failed_login_count,
        locked_until
      FROM dbo.users WHERE id = @id
    `)
  return r.recordset[0] ?? null
}

export async function createUser(
  pool: ConnectionPool,
  input: { email: string; passwordHash: string; fullName: string | null; role: UserRole },
): Promise<string> {
  const r = await pool
    .request()
    .input('email', input.email.toLowerCase())
    .input('passwordHash', input.passwordHash)
    .input('fullName', input.fullName)
    .input('role', input.role)
    .query<{ id: string }>(`
      INSERT INTO dbo.users (email, password_hash, full_name, role, email_verified)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@email, @passwordHash, @fullName, @role, 0)
    `)
  return r.recordset[0].id
}

export async function findUserByKeycloakSub(pool: ConnectionPool, keycloakSub: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('sub', keycloakSub)
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub,
        ISNULL(email_verified, 1) AS email_verified,
        ISNULL(failed_login_count, 0) AS failed_login_count,
        locked_until
      FROM dbo.users WHERE keycloak_sub = @sub
    `)
  return r.recordset[0] ?? null
}

export async function findUserByEmailLower(pool: ConnectionPool, email: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('email', email.toLowerCase())
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub,
        ISNULL(email_verified, 1) AS email_verified,
        ISNULL(failed_login_count, 0) AS failed_login_count,
        locked_until
      FROM dbo.users WHERE LOWER(email) = @email
    `)
  return r.recordset[0] ?? null
}

export async function linkKeycloakSubToUser(pool: ConnectionPool, userId: string, keycloakSub: string): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .input('sub', keycloakSub)
    .query(`UPDATE dbo.users SET keycloak_sub = @sub, updated_at = SYSUTCDATETIME() WHERE id = @id`)
}

export async function insertUserFromKeycloak(
  pool: ConnectionPool,
  input: { email: string; fullName: string | null; keycloakSub: string; role: UserRole; emailVerified: boolean },
): Promise<string> {
  const r = await pool
    .request()
    .input('email', input.email.toLowerCase())
    .input('fullName', input.fullName)
    .input('sub', input.keycloakSub)
    .input('role', input.role)
    .input('ev', input.emailVerified ? 1 : 0)
    .query<{ id: string }>(`
      INSERT INTO dbo.users (email, password_hash, full_name, role, keycloak_sub, email_verified)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@email, NULL, @fullName, @role, @sub, @ev)
    `)
  return r.recordset[0]!.id
}

/** Sync IdP email_verified after Keycloak userinfo (login or callback). */
export async function syncKeycloakEmailVerified(
  pool: ConnectionPool,
  userId: string,
  emailVerified: boolean,
): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .input('ev', emailVerified ? 1 : 0)
    .query(`UPDATE dbo.users SET email_verified = @ev, updated_at = SYSUTCDATETIME() WHERE id = @id`)
}

const NOTIFY_CHANNELS = new Set(['email', 'in_app', 'both'])

export async function updateUserProfile(
  pool: ConnectionPool,
  userId: string,
  input: { fullName?: string | null; notificationChannel?: string },
): Promise<void> {
  const parts: string[] = []
  const req = pool.request().input('id', userId)

  if (input.fullName !== undefined) {
    parts.push('full_name = @fullName')
    req.input('fullName', input.fullName)
  }
  if (input.notificationChannel !== undefined) {
    const ch = NOTIFY_CHANNELS.has(input.notificationChannel) ? input.notificationChannel : 'email'
    parts.push('notification_channel = @notificationChannel')
    req.input('notificationChannel', ch)
  }
  if (!parts.length) return
  parts.push('updated_at = SYSUTCDATETIME()')
  await req.query(`UPDATE dbo.users SET ${parts.join(', ')} WHERE id = @id`)
}

export async function resetLoginFailures(pool: ConnectionPool, userId: string): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .query(`UPDATE dbo.users SET failed_login_count = 0, locked_until = NULL, updated_at = SYSUTCDATETIME() WHERE id = @id`)
}

export async function recordFailedLogin(
  pool: ConnectionPool,
  userId: string,
  maxAttempts: number,
  lockMinutes: number,
): Promise<number> {
  const r = await pool
    .request()
    .input('id', userId)
    .input('max', maxAttempts)
    .input('mins', lockMinutes)
    .query<{ n: number }>(`
      UPDATE dbo.users SET
        failed_login_count = ISNULL(failed_login_count, 0) + 1,
        locked_until = CASE
          WHEN ISNULL(failed_login_count, 0) + 1 >= @max THEN DATEADD(MINUTE, @mins, SYSUTCDATETIME())
          ELSE locked_until
        END,
        updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.failed_login_count AS n
      WHERE id = @id
    `)
  return Number(r.recordset[0]?.n ?? 0)
}

export async function updateUserEmail(pool: ConnectionPool, userId: string, emailLower: string): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .input('email', emailLower)
    .query(`UPDATE dbo.users SET email = @email, updated_at = SYSUTCDATETIME() WHERE id = @id`)
}

export async function setUserPasswordHash(pool: ConnectionPool, userId: string, passwordHash: string): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .input('hash', passwordHash)
    .query(`UPDATE dbo.users SET password_hash = @hash, updated_at = SYSUTCDATETIME() WHERE id = @id`)
}

export async function setEmailVerificationToken(
  pool: ConnectionPool,
  userId: string,
  tokenHash: Buffer,
  expiresAt: Date,
): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .input('h', tokenHash)
    .input('exp', expiresAt)
    .query(`
      UPDATE dbo.users SET
        email_verification_token_hash = @h,
        email_verification_expires_at = @exp,
        updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `)
}

export async function findUserIdByEmailVerificationHash(
  pool: ConnectionPool,
  tokenHash: Buffer,
): Promise<string | null> {
  const r = await pool
    .request()
    .input('h', tokenHash)
    .query<{ id: string }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.users
      WHERE email_verification_token_hash = @h
        AND email_verification_expires_at > SYSUTCDATETIME()
        AND ISNULL(email_verified, 0) = 0
    `)
  return r.recordset[0]?.id ?? null
}

export async function markEmailVerified(pool: ConnectionPool, userId: string): Promise<void> {
  await pool
    .request()
    .input('id', userId)
    .query(`
      UPDATE dbo.users SET
        email_verified = 1,
        email_verification_token_hash = NULL,
        email_verification_expires_at = NULL,
        updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `)
}
