import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  listRoles,
  listPermissions,
  getUserRoles,
  grantRoleToUser,
  revokeRoleFromUser,
  listAuditLog,
} from '../../services/rbacService.js'

export const adminRbacRouter = Router()
adminRbacRouter.use(requireAuth, requireRole('admin', 'ops'))

function noPool(res: import('express').Response) {
  res.status(503).json({ error: 'Database not configured' })
}

adminRbacRouter.get('/roles', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    res.json({ items: await listRoles(pool) })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminRbacRouter.get('/permissions', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    res.json({ items: await listPermissions(pool) })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminRbacRouter.get('/users/:userId/roles', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    const roles = await getUserRoles(pool, req.params.userId)
    res.json({ items: roles })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminRbacRouter.post('/users/:userId/roles/:roleId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    await grantRoleToUser(pool, req.params.userId, req.params.roleId, req.user?.sub ?? null)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminRbacRouter.delete('/users/:userId/roles/:roleId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  try {
    await revokeRoleFromUser(pool, req.params.userId, req.params.roleId)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminRbacRouter.get('/audit', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100)))
  try {
    res.json({ items: await listAuditLog(pool, limit) })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

/** Lookup user by email (for the assign-role UI). */
adminRbacRouter.get('/user-search', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) { noPool(res); return }
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : ''
  if (!email) { res.status(400).json({ error: 'email query param required' }); return }
  try {
    const r = await pool.request().input('e', email).query<{ id: string; email: string; full_name: string | null }>(`
      SELECT TOP 5 CAST(id AS NVARCHAR(36)) AS id, email, full_name
      FROM dbo.users WHERE LOWER(email) LIKE '%' + @e + '%'
      ORDER BY email
    `)
    res.json({ items: r.recordset })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})
