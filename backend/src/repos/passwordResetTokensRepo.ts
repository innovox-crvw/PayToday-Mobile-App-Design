import type { ConnectionPool } from 'mssql'

export async function insertPasswordResetToken(
  pool: ConnectionPool,
  userId: string,
  tokenHash: Buffer,
  expiresAt: Date,
): Promise<void> {
  await pool
    .request()
    .input('userId', userId)
    .input('hash', tokenHash)
    .input('expiresAt', expiresAt)
    .query(`
      INSERT INTO dbo.password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (@userId, @hash, @expiresAt)
    `)
}

export async function findValidPasswordResetUserId(
  pool: ConnectionPool,
  tokenHash: Buffer,
): Promise<{ userId: string; tokenId: string } | null> {
  const r = await pool
    .request()
    .input('hash', tokenHash)
    .query<{ user_id: string; id: string }>(`
      SELECT CAST(user_id AS NVARCHAR(36)) AS user_id, CAST(id AS NVARCHAR(36)) AS id
      FROM dbo.password_reset_tokens
      WHERE token_hash = @hash AND used_at IS NULL AND expires_at > SYSUTCDATETIME()
    `)
  const row = r.recordset[0]
  if (!row) return null
  return { userId: row.user_id, tokenId: row.id }
}

export async function markPasswordResetTokenUsed(pool: ConnectionPool, tokenId: string): Promise<void> {
  await pool.request().input('id', tokenId).query(`UPDATE dbo.password_reset_tokens SET used_at = SYSUTCDATETIME() WHERE id = @id`)
}
