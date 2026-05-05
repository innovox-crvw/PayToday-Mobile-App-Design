import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import { requirePermission } from '../../middleware/requirePermission.js'
import { resolveAdminMerchantScopeFromRequest } from '../../lib/adminMerchantScope.js'
import { listAdminOrderReviewsScoped } from '../../queries/orderReviews.js'

export const adminOrderReviewsRouter = Router()
adminOrderReviewsRouter.use(requireAuth, requirePermission('orders.admin.manage', { type: 'PLATFORM' }))

adminOrderReviewsRouter.get('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  const items = await listAdminOrderReviewsScoped(pool, { payTodayMerchantIds: scope })
  res.json({ items })
})
