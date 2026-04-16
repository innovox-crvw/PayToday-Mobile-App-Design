import type { ConnectionPool } from 'mssql'

export interface UserNotificationRow {
  id: string
  template_key: string
  title: string
  body: string | null
  payload: string | null
  read_at: Date | null
  created_at: Date
}

export async function insertUserNotificationFromOutbox(
  pool: ConnectionPool,
  input: {
    sourceOutboxId: string
    userId: string
    templateKey: string
    title: string
    body: string
    payload: string
  },
): Promise<boolean> {
  const r = await pool
    .request()
    .input('sourceOutboxId', input.sourceOutboxId)
    .input('userId', input.userId)
    .input('templateKey', input.templateKey)
    .input('title', input.title)
    .input('body', input.body)
    .input('payload', input.payload)
    .query<{ n: number }>(`
      IF NOT EXISTS (SELECT 1 FROM dbo.user_notifications WHERE source_outbox_id = @sourceOutboxId)
      BEGIN
        INSERT INTO dbo.user_notifications (source_outbox_id, user_id, template_key, title, body, payload)
        VALUES (@sourceOutboxId, @userId, @templateKey, @title, @body, @payload);
        SELECT 1 AS n;
      END
      ELSE
        SELECT 0 AS n;
    `)
  return (r.recordset[0]?.n ?? 0) === 1
}

export async function listUserNotifications(pool: ConnectionPool, userId: string): Promise<UserNotificationRow[]> {
  const r = await pool.request().input('userId', userId).query<UserNotificationRow>(`
    SELECT TOP (80)
      CAST(id AS NVARCHAR(36)) AS id,
      template_key,
      title,
      body,
      payload,
      read_at,
      created_at
    FROM dbo.user_notifications
    WHERE user_id = @userId
    ORDER BY created_at DESC
  `)
  return r.recordset
}

export async function getUserNotification(
  pool: ConnectionPool,
  userId: string,
  id: string,
): Promise<UserNotificationRow | null> {
  const r = await pool.request().input('userId', userId).input('id', id).query<UserNotificationRow>(`
    SELECT
      CAST(id AS NVARCHAR(36)) AS id,
      template_key,
      title,
      body,
      payload,
      read_at,
      created_at
    FROM dbo.user_notifications
    WHERE user_id = @userId AND id = @id
  `)
  return r.recordset[0] ?? null
}

export async function markUserNotificationRead(pool: ConnectionPool, userId: string, id: string): Promise<boolean> {
  const r = await pool
    .request()
    .input('userId', userId)
    .input('id', id)
    .query<{ c: number }>(`
      UPDATE dbo.user_notifications
      SET read_at = SYSUTCDATETIME()
      WHERE user_id = @userId AND id = @id AND read_at IS NULL;
      SELECT @@ROWCOUNT AS c;
    `)
  return (r.recordset[0]?.c ?? 0) > 0
}

export async function countUnreadUserNotifications(pool: ConnectionPool, userId: string): Promise<number> {
  const r = await pool.request().input('userId', userId).query<{ n: number }>(`
    SELECT COUNT_BIG(1) AS n FROM dbo.user_notifications WHERE user_id = @userId AND read_at IS NULL
  `)
  return Number(r.recordset[0]?.n ?? 0)
}
