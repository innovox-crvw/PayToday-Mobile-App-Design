import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import {
  getMerchantWeeklyJson,
  upsertMerchantWeeklyJson,
  getLiquorSellingHours,
  upsertLiquorSellingHours,
  type MerchantHoursKind,
} from '../../services/merchantHoursService.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { resolveAdminMerchantScopeFromRequest, isPayTodayMerchantIdAllowedForScope } from '../../lib/adminMerchantScope.js'

export const adminMerchantHoursRouter = Router()
adminMerchantHoursRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

/* ── Granular liquor selling hours (before /:merchantId/:kind so "liquor-hours" is not captured as :kind) ── */
adminMerchantHoursRouter.get('/:merchantId/liquor-hours', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  if (!isPayTodayMerchantIdAllowedForScope(scope, merchantId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const rows = await getLiquorSellingHours(pool, merchantId)
  res.json({ items: rows })
})

adminMerchantHoursRouter.put('/:merchantId/liquor-hours', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  if (!isPayTodayMerchantIdAllowedForScope(scope, merchantId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const rows = Array.isArray(req.body?.rows) ? (req.body.rows as unknown[]) : []
  if (!rows.length) {
    res.status(400).json({ error: 'rows[] is required' })
    return
  }
  try {
    await upsertLiquorSellingHours(
      pool,
      merchantId,
      rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          dayOfWeek: Number(row.dayOfWeek ?? row.day_of_week),
          startMinute: Number(row.startMinute ?? row.start_minute),
          endMinute: Number(row.endMinute ?? row.end_minute),
          isActive: Boolean(row.isActive ?? row.is_active ?? true),
        }
      }),
    )
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminMerchantHoursRouter.get('/:merchantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  if (!isPayTodayMerchantIdAllowedForScope(scope, merchantId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const general = await getMerchantWeeklyJson(pool, merchantId, 'general')
  const liquor = await getMerchantWeeklyJson(pool, merchantId, 'liquor')
  res.json({ payTodayMerchantId: merchantId, generalWeeklyJson: general, liquorWeeklyJson: liquor })
})

async function putMerchantHoursKind(req: import('express').Request, res: import('express').Response): Promise<void> {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  const kindRaw = String(req.params.kind ?? '').toLowerCase()
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  const kind = (kindRaw === 'liquor' ? 'liquor' : 'general') as MerchantHoursKind
  const { scope } = await resolveAdminMerchantScopeFromRequest(pool, req)
  if (!isPayTodayMerchantIdAllowedForScope(scope, merchantId)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const weeklyJson = typeof req.body?.weeklyJson === 'string' ? req.body.weeklyJson : ''
  if (!weeklyJson.trim()) {
    res.status(400).json({ error: 'weeklyJson string required' })
    return
  }
  try {
    JSON.parse(weeklyJson)
  } catch {
    res.status(400).json({ error: 'weeklyJson must be valid JSON' })
    return
  }
  try {
    await upsertMerchantWeeklyJson(pool, merchantId, kind, weeklyJson.trim())
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (/FK_merchant_hours_business|FOREIGN KEY|merchant_operating_hours/i.test(msg)) {
      res.status(400).json({ error: 'Unknown merchant id (no matching business). Run merchant seed / link businesses first.' })
      return
    }
    res.status(500).json({ error: msg })
  }
}

adminMerchantHoursRouter.put('/:merchantId/:kind', putMerchantHoursKind)
adminMerchantHoursRouter.patch('/:merchantId/:kind', putMerchantHoursKind)

/** Public read-only hours for storefront (no auth). */
export const storefrontMerchantHoursRouter = Router()

storefrontMerchantHoursRouter.get('/:merchantId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const merchantId = Number(req.params.merchantId)
  if (!Number.isInteger(merchantId) || merchantId < 0) {
    res.status(400).json({ error: 'Invalid merchantId' })
    return
  }
  try {
    const general = await getMerchantWeeklyJson(pool, merchantId, 'general')
    const liquor = await getMerchantWeeklyJson(pool, merchantId, 'liquor')
    res.json({ payTodayMerchantId: merchantId, generalWeeklyJson: general, liquorWeeklyJson: liquor })
  } catch {
    res.json({ payTodayMerchantId: merchantId, generalWeeklyJson: null, liquorWeeklyJson: null })
  }
})
