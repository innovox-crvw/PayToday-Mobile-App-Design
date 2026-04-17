import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js'
import {
  approveReturnCase,
  completeReturnCaseRefund,
  createReturnCase,
  getReturnCaseAdmin,
  listReturnCasesAdmin,
  receiveReturnCase,
  rejectReturnCase,
  returnCaseAnalytics,
} from '../../services/returnService.js'

export const returnsRouter = Router()

function guestEmailFromBody(req: { body?: unknown }): string {
  const b = req.body && typeof (req.body as { email?: unknown }).email === 'string' ? (req.body as { email: string }).email : ''
  return b.trim().toLowerCase()
}

type ReturnLineBody = { productId?: unknown; variantId?: unknown; quantity?: unknown }

function parseReturnLines(body: unknown): { productId: string; variantId: string; quantity: number }[] {
  if (!body || typeof body !== 'object') return []
  const raw = (body as { lines?: unknown }).lines
  if (!Array.isArray(raw)) return []
  const out: { productId: string; variantId: string; quantity: number }[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as ReturnLineBody
    const productId = typeof r.productId === 'string' ? r.productId.trim() : ''
    const variantId = typeof r.variantId === 'string' ? r.variantId.trim() : ''
    const quantity = typeof r.quantity === 'number' ? r.quantity : Number(r.quantity)
    if (!productId || !variantId) continue
    if (!Number.isFinite(quantity) || quantity < 1) continue
    out.push({ productId, variantId, quantity: Math.floor(quantity) })
  }
  return out
}

function parseImageUrls(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null
  const raw = (body as { imageUrls?: unknown }).imageUrls
  if (!Array.isArray(raw)) return null
  const urls: string[] = []
  for (const u of raw.slice(0, 8)) {
    if (typeof u === 'string' && u.trim().length > 0 && u.length < 2000) urls.push(u.trim())
  }
  return urls.length ? urls : null
}

/** Customer / guest: structured return request (no inventory change until admin marks received). */
returnsRouter.post('/request', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const u = req.user
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : ''
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
  const lines = parseReturnLines(req.body)
  const imageUrls = parseImageUrls(req.body)
  const guestEmail = guestEmailFromBody(req)

  if (!u && !guestEmail) {
    res.status(400).json({ error: 'email is required on the request body for guest return requests' })
    return
  }

  if (!orderId || !reason.trim()) {
    res.status(400).json({ error: 'orderId and reason are required' })
    return
  }
  if (lines.length === 0) {
    res.status(400).json({ error: 'lines[] is required with productId, variantId, and quantity per row' })
    return
  }

  try {
    const { returnCaseId } = await createReturnCase(pool, {
      orderId,
      userId: u?.sub ?? null,
      guestEmailNorm: u ? null : guestEmail,
      reason: reason.trim(),
      lines,
      imageUrls,
    })
    res.status(201).json({ ok: true, returnCaseId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'Forbidden' || msg === 'Guest email must match the order') {
      res.status(403).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

export const adminReturnsRouter = Router()
adminReturnsRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminReturnsRouter.get('/analytics', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const counts = await returnCaseAnalytics(pool)
  res.json({ counts })
})

adminReturnsRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const items = await listReturnCasesAdmin(pool)
  res.json({ items })
})

adminReturnsRouter.get('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const detail = await getReturnCaseAdmin(pool, String(req.params.id))
  if (!detail) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(detail)
})

adminReturnsRouter.post('/:id/approve', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    await approveReturnCase(pool, String(req.params.id))
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminReturnsRouter.post('/:id/reject', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const rejectionReason =
    typeof req.body?.reason === 'string'
      ? req.body.reason
      : typeof req.body?.rejectionReason === 'string'
        ? req.body.rejectionReason
        : ''
  try {
    await rejectReturnCase(pool, String(req.params.id), rejectionReason)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminReturnsRouter.post('/:id/receive', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    await receiveReturnCase(pool, String(req.params.id))
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminReturnsRouter.post('/:id/complete-refund', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    const result = await completeReturnCaseRefund(pool, String(req.params.id))
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})
