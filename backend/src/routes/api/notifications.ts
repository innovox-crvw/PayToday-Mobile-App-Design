import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import { getSqlPool } from '../../db/pool.js'
import { sqlUserIdFromJwtUser } from '../../lib/authUserId.js'
import { isInvalidUniqueIdentifierConversion, isMissingUserNotificationsTableError } from '../../lib/notificationSqlErrors.js'
import { formatSqlDriverError } from '../../db/sqlDriverError.js'
import {
  countUnreadUserNotifications,
  getUserNotification,
  listUserNotifications,
  markUserNotificationRead,
} from '../../repos/userNotificationsRepo.js'

export const notificationsRouter = Router()

notificationsRouter.get('/unread-count', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.json({ unread: 0 })
    return
  }
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!uid) {
    res.json({ unread: 0 })
    return
  }
  try {
    const unread = await countUnreadUserNotifications(pool, uid)
    res.json({ unread })
  } catch (e) {
    if (isMissingUserNotificationsTableError(e)) {
      res.json({ unread: 0 })
      return
    }
    console.warn('[notifications unread-count]', formatSqlDriverError(e))
    res.json({ unread: 0 })
  }
})

notificationsRouter.get('/', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!uid) {
    res.json({ notifications: [] })
    return
  }
  try {
    const rows = await listUserNotifications(pool, uid)
    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        templateKey: r.template_key,
        title: r.title,
        body: r.body ?? '',
        read: r.read_at != null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    })
  } catch (e) {
    if (isMissingUserNotificationsTableError(e)) {
      console.info('[notifications list] dbo.user_notifications missing — run db:migrate (002):', formatSqlDriverError(e))
      res.json({ notifications: [], meta: { notificationsTableMissing: true } })
      return
    }
    if (isInvalidUniqueIdentifierConversion(e)) {
      console.info('[notifications list] empty response:', formatSqlDriverError(e))
      res.json({ notifications: [] })
      return
    }
    console.error('[notifications list]', e)
    res.status(500).json({ error: 'Could not load notifications' })
  }
})

notificationsRouter.get('/:id', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!uid) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
  try {
    const row = await getUserNotification(pool, uid, id)
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({
      notification: {
        id: row.id,
        templateKey: row.template_key,
        title: row.title,
        body: row.body ?? '',
        payload: row.payload,
        read: row.read_at != null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      },
    })
  } catch (e) {
    if (isMissingUserNotificationsTableError(e) || isInvalidUniqueIdentifierConversion(e)) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    console.error('[notifications get]', e)
    res.status(500).json({ error: 'Could not load notification' })
  }
})

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const uid = sqlUserIdFromJwtUser(req.user)
  if (!uid) {
    res.json({ ok: false })
    return
  }
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
  try {
    const ok = await markUserNotificationRead(pool, uid, id)
    res.json({ ok })
  } catch (e) {
    if (isMissingUserNotificationsTableError(e) || isInvalidUniqueIdentifierConversion(e)) {
      res.json({ ok: false })
      return
    }
    console.error('[notifications read]', e)
    res.status(500).json({ error: 'Could not update notification' })
  }
})
