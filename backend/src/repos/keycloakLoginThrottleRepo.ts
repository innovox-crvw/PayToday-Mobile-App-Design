import type { ConnectionPool } from 'mssql'

export type KeycloakThrottleRow = {
  email_normalized: string
  failed_count: number
  locked_until: Date | null
}

export async function findKeycloakThrottleByEmail(
  pool: ConnectionPool,
  emailLower: string,
): Promise<KeycloakThrottleRow | null> {
  const r = await pool
    .request()
    .input('email', emailLower.toLowerCase())
    .query<KeycloakThrottleRow>(`
      SELECT email_normalized, failed_count, locked_until
      FROM dbo.keycloak_login_throttle WHERE email_normalized = @email
    `)
  return r.recordset[0] ?? null
}

export async function resetKeycloakThrottle(pool: ConnectionPool, emailLower: string): Promise<void> {
  await pool
    .request()
    .input('email', emailLower.toLowerCase())
    .query(`DELETE FROM dbo.keycloak_login_throttle WHERE email_normalized = @email`)
}

export async function recordFailedKeycloakThrottle(
  pool: ConnectionPool,
  emailLower: string,
  maxAttempts: number,
  lockMinutes: number,
): Promise<number> {
  const email = emailLower.toLowerCase()
  const upd = await pool
    .request()
    .input('email', email)
    .input('max', maxAttempts)
    .input('mins', lockMinutes)
    .query<{ n: number }>(`
      UPDATE dbo.keycloak_login_throttle SET
        failed_count = ISNULL(failed_count, 0) + 1,
        locked_until = CASE
          WHEN ISNULL(failed_count, 0) + 1 >= @max THEN DATEADD(MINUTE, @mins, SYSUTCDATETIME())
          ELSE locked_until
        END,
        updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.failed_count AS n
      WHERE email_normalized = @email
    `)
  const n = Number(upd.recordset[0]?.n ?? 0)
  if (n > 0) return n
  await pool
    .request()
    .input('email', email)
    .input('max', maxAttempts)
    .input('mins', lockMinutes)
    .query(`
      INSERT INTO dbo.keycloak_login_throttle (email_normalized, failed_count, locked_until, updated_at)
      VALUES (@email, 1,
        CASE WHEN 1 >= @max THEN DATEADD(MINUTE, @mins, SYSUTCDATETIME()) ELSE NULL END,
        SYSUTCDATETIME())
    `)
  return 1
}
