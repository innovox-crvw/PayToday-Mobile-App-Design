import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js'
import {
  createOrderDispute,
  listDisputesAdmin,
  listDisputesForOrder,
  updateDisputeAdmin,
} from '../../services/disputeService.js'

export const disputesRouter = Router()

function guestEmailFromBody(req: { body?: unknown }): string {
  const b = req.body && typeof (req.body as { email?: unknown }).email === 'string' ? (req.body as { email: string }).email : ''
  return b.trim().toLowerCase()
}

function guestEmailFromQuery(req: { query: unknown }): string {
  const q = typeof (req.query as { email?: unknown }).email === 'string' ? String((req.query as { email: string }).email) : ''
  return q.trim().toLowerCase()
}

/** Customer / guest: list disputes for an order they can access. */
disputesRouter.get('/for-order/:orderId', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId)
  const guestQ = guestEmailFromQuery(req)
  const u = req.user
  try {
    const items = await listDisputesForOrder(pool, orderId, u?.sub, guestQ)
    res.json({ items })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'Forbidden' || msg === 'Guest email must match the order') {
      res.status(403).json({ error: msg })
      return
    }
    if (msg === 'Order not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

/** Customer / guest: open a dispute (one active open or in_review per order). */
disputesRouter.post('/', optionalAuth, async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const u = req.user
  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : ''
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
  const description =
    typeof req.body?.description === 'string' ? req.body.description : req.body?.description == null ? '' : ''
  const guestBody = guestEmailFromBody(req)

  if (!u && !guestBody) {
    res.status(400).json({ error: 'email is required on the request body for guest dispute requests' })
    return
  }
  if (!orderId || !reason.trim()) {
    res.status(400).json({ error: 'orderId and reason are required' })
    return
  }

  try {
    const { disputeId } = await createOrderDispute(pool, {
      orderId,
      userId: u?.sub ?? null,
      guestEmailNorm: u ? null : guestBody,
      reason,
      description: description.trim() || null,
      variantId: typeof req.body?.variantId === 'string' && req.body.variantId.trim() ? req.body.variantId.trim() : null,
    })
    res.status(201).json({ ok: true, disputeId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'Forbidden' || msg === 'Guest email must match the order') {
      res.status(403).json({ error: msg })
      return
    }
    if (msg === 'Order not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

export const adminDisputesRouter = Router()
adminDisputesRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminDisputesRouter.get('/', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const items = await listDisputesAdmin(pool)
  res.json({ items })
})

adminDisputesRouter.patch('/:disputeId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const disputeId = String(req.params.disputeId)
  const status = typeof req.body?.status === 'string' ? req.body.status : ''
  const adminResolutionNote = req.body?.adminResolutionNote
  if (!status.trim()) {
    res.status(400).json({ error: 'status is required' })
    return
  }
  try {
    await updateDisputeAdmin(pool, disputeId, {
      status,
      adminResolutionNote:
        adminResolutionNote === undefined
          ? undefined
          : adminResolutionNote === null
            ? null
            : String(adminResolutionNote),
    })
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    if (msg === 'Invalid status') {
      res.status(400).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})
