import type { ConnectionPool } from 'mssql'

export async function insertRefreshToken(
  pool: ConnectionPool,
  userId: string,
  tokenHash: Buffer,
  expiresAt: Date,
): Promise<void> {
  await pool
    .request()
    .input('uid', userId)
    .input('h', tokenHash)
    .input('exp', expiresAt)
    .query(`
      INSERT INTO dbo.user_refresh_tokens (user_id, token_hash, expires_at)
      VALUES (@uid, @h, @exp)
    `)
}

export async function findValidRefreshToken(
  pool: ConnectionPool,
  tokenHash: Buffer,
): Promise<{ userId: string; email: string; role: string } | null> {
  const r = await pool.request().input('h', tokenHash).query<{ user_id: string; email: string; role: string }>(`
      SELECT CAST(t.user_id AS NVARCHAR(36)) AS user_id, u.email, u.role
      FROM dbo.user_refresh_tokens t
      INNER JOIN dbo.users u ON u.id = t.user_id
      WHERE t.token_hash = @h AND t.revoked_at IS NULL AND t.expires_at > SYSUTCDATETIME()
    `)
  const row = r.recordset[0]
  return row ? { userId: row.user_id, email: row.email, role: row.role } : null
}

export async function revokeRefreshToken(pool: ConnectionPool, tokenHash: Buffer): Promise<void> {
  await pool
    .request()
    .input('h', tokenHash)
    .query(`UPDATE dbo.user_refresh_tokens SET revoked_at = SYSUTCDATETIME() WHERE token_hash = @h`)
}

export async function revokeAllRefreshTokensForUser(pool: ConnectionPool, userId: string): Promise<void> {
  await pool
    .request()
    .input('uid', userId)
    .query(`UPDATE dbo.user_refresh_tokens SET revoked_at = SYSUTCDATETIME() WHERE user_id = @uid AND revoked_at IS NULL`)
}
