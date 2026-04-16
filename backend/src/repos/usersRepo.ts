import type { ConnectionPool } from 'mssql'
import type { UserRole } from '../types/roles.js'

export interface UserRow {
  id: string
  email: string
  /** Null for Keycloak-only accounts (migration 008). */
  password_hash: string | null
  full_name: string | null
  role: UserRole
  notification_channel: string
  keycloak_sub?: string | null
}

export async function findUserByEmail(pool: ConnectionPool, email: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('email', email.toLowerCase())
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub
      FROM dbo.users WHERE email = @email
    `)
  return r.recordset[0] ?? null
}

export async function findUserById(pool: ConnectionPool, userId: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('id', userId)
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub
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
      INSERT INTO dbo.users (email, password_hash, full_name, role)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@email, @passwordHash, @fullName, @role)
    `)
  return r.recordset[0].id
}

export async function findUserByKeycloakSub(pool: ConnectionPool, keycloakSub: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('sub', keycloakSub)
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub
      FROM dbo.users WHERE keycloak_sub = @sub
    `)
  return r.recordset[0] ?? null
}

export async function findUserByEmailLower(pool: ConnectionPool, email: string): Promise<UserRow | null> {
  const r = await pool
    .request()
    .input('email', email.toLowerCase())
    .query<UserRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, email, password_hash, full_name, role, notification_channel, keycloak_sub
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
  input: { email: string; fullName: string | null; keycloakSub: string; role: UserRole },
): Promise<string> {
  const r = await pool
    .request()
    .input('email', input.email.toLowerCase())
    .input('fullName', input.fullName)
    .input('sub', input.keycloakSub)
    .input('role', input.role)
    .query<{ id: string }>(`
      INSERT INTO dbo.users (email, password_hash, full_name, role, keycloak_sub)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@email, NULL, @fullName, @role, @sub)
    `)
  return r.recordset[0]!.id
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
