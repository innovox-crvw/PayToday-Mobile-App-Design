import type { ConnectionPool } from 'mssql'

export interface EnqueueInput {
  userId: string | null
  email: string | null
  channel: string
  templateKey: string
  payload: string
}

/** Persists to outbox; a worker or log consumer sends email / app push. */
export async function enqueueNotification(pool: ConnectionPool | null, input: EnqueueInput): Promise<void> {
  if (!pool) {
    console.info('[notification]', input.templateKey, input.channel, input.payload)
    return
  }
  await pool
    .request()
    .input('userId', input.userId)
    .input('email', input.email)
    .input('channel', input.channel)
    .input('templateKey', input.templateKey)
    .input('payload', input.payload)
    .query(`
      INSERT INTO dbo.notification_outbox (user_id, email, channel, template_key, payload)
      VALUES (@userId, @email, @channel, @templateKey, @payload)
    `)
}
