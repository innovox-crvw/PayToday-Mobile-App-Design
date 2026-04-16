import type { ConnectionPool } from 'mssql'
import { loadDotenvFiles } from '../config/env.js'
import { sendNotifyTransactionalEmail } from './notifyEmailApi.js'
import { getIntegrationSettingsMap } from './integrationSettingsCache.js'
import { mergeNotifyRuntime } from './integrationRuntimeConfig.js'
import { inAppCopyForTemplate } from './inAppNotificationPresentation.js'
import { insertUserNotificationFromOutbox } from '../repos/userNotificationsRepo.js'

/** Drain notification_outbox: Today notify API for email; optional POST for in_app; persist rows to user_notifications. */
export function startNotificationWorker(getPool: () => Promise<ConnectionPool | null>): void {
  const appWebhook = (process.env.NOTIFICATION_APP_WEBHOOK_URL ?? '').trim()

  const tick = async () => {
    const pool = await getPool()
    if (!pool) return
    loadDotenvFiles()
    const notifyCfg = mergeNotifyRuntime(await getIntegrationSettingsMap(pool))
    try {
      const rows = await pool.request().query<{
        id: string
        user_id: string | null
        email: string | null
        channel: string
        template_key: string
        payload: string
      }>(`
        SELECT TOP 25
          CAST(id AS NVARCHAR(36)) AS id,
          CAST(user_id AS NVARCHAR(36)) AS user_id,
          email,
          channel,
          template_key,
          payload
        FROM dbo.notification_outbox WHERE sent_at IS NULL ORDER BY created_at ASC
      `)

      for (const row of rows.recordset) {
        try {
          const wantsEmail = row.channel === 'email' || row.channel === 'both'
          const wantsInApp = row.channel === 'in_app' || row.channel === 'both'
          /** Only set false when a required step failed (so the row stays pending for retry). */
          let okToMarkSent = true

          if (wantsInApp && row.user_id?.trim()) {
            const { title, body } = inAppCopyForTemplate(row.template_key, row.payload)
            try {
              await insertUserNotificationFromOutbox(pool, {
                sourceOutboxId: row.id,
                userId: row.user_id.trim(),
                templateKey: row.template_key,
                title,
                body,
                payload: row.payload,
              })
            } catch (e) {
              okToMarkSent = false
              console.warn(
                '[notification in_app] could not persist user_notifications (check user_id FK to dbo.users, migration 002, template_key length)',
                row.template_key,
                e,
              )
            }
          }

          if (wantsInApp) {
            if (appWebhook) {
              try {
                await fetch(appWebhook, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userId: row.user_id,
                    templateKey: row.template_key,
                    payload: row.payload,
                  }),
                })
              } catch {
                console.warn('[notification in_app] webhook failed', row.template_key)
              }
            } else {
              console.info('[notification in_app]', row.template_key, row.payload)
            }
          }

          if (wantsEmail) {
            if (!row.email?.trim()) {
              console.info('[notification email] skipped — no recipient', row.template_key)
            } else if (!notifyCfg.apiKey.trim()) {
              console.warn(
                '[notification email] NOTIFY_SERVICE_API_KEY is not set — set it in .env or dbo.integration_settings for outbound email',
                row.template_key,
              )
              const inAppHandled = wantsInApp && Boolean(row.user_id?.trim())
              if (!inAppHandled) {
                okToMarkSent = false
              }
              /* `both` with user_id: in-app row already written; allow marking sent without email in dev. */
            } else {
              let payload: Record<string, unknown> = {}
              try {
                payload = JSON.parse(row.payload) as Record<string, unknown>
              } catch {
                payload = { raw: row.payload }
              }
              const r = await sendNotifyTransactionalEmail(
                {
                  to: row.email.trim(),
                  templateKey: row.template_key,
                  payload,
                },
                notifyCfg,
              )
              if (!r.ok) {
                console.warn('[notification email] notify service failed — will retry', row.template_key, r.error)
                okToMarkSent = false
              }
            }
          }

          if (okToMarkSent) {
            await pool.request().input('id', row.id).query(`UPDATE dbo.notification_outbox SET sent_at = SYSUTCDATETIME() WHERE id = @id`)
          }
        } catch (e) {
          console.error('[notification worker] failed', row.id, e)
        }
      }
    } catch (e) {
      console.error('[notification worker]', e)
    }
  }

  void tick()
  setInterval(() => void tick(), 30_000)
}
