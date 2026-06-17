import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  createSplitBill,
  getSplitBillForUser,
  getWalletSettings,
  patchWalletSettings,
} from '../../services/walletExtrasService.js'

export const walletExtrasRouter = Router()

walletExtrasRouter.get('/settings', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const settings = await getWalletSettings(pool, req.user.sub)
  res.json(settings)
})

walletExtrasRouter.patch('/settings', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const body = req.body as Record<string, unknown>
  const result = await patchWalletSettings(pool, req.user.sub, {
    roundUpEnabled: typeof body.roundUpEnabled === 'boolean' ? body.roundUpEnabled : undefined,
    roundUpIncrementCents:
      typeof body.roundUpIncrementCents === 'number' && Number.isFinite(body.roundUpIncrementCents)
        ? body.roundUpIncrementCents
        : typeof body.roundUpIncrementCents === 'string' && body.roundUpIncrementCents.trim()
          ? Number(body.roundUpIncrementCents)
          : undefined,
  })
  if ('error' in result) {
    res.status(503).json({ error: result.error })
    return
  }
  res.json(result)
})

walletExtrasRouter.get('/savings', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const settings = await getWalletSettings(pool, req.user.sub)
  res.json({
    savingsBalanceCents: settings.savingsBalanceCents,
    roundUpEnabled: settings.roundUpEnabled,
    roundUpIncrementCents: settings.roundUpIncrementCents,
    walletExtrasAvailable: settings.walletExtrasAvailable,
  })
})

walletExtrasRouter.post('/split-bills', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const body = req.body as Record<string, unknown>
  const totalCents = Number(body.totalCents)
  const creatorShareCents = Number(body.creatorShareCents)
  const participants = Array.isArray(body.participants)
    ? (body.participants as { displayName?: string; shareCents?: number }[]).map((p) => ({
        displayName: String(p.displayName ?? ''),
        shareCents: Number(p.shareCents),
      }))
    : []
  const result = await createSplitBill(pool, req.user.sub, {
    totalCents,
    currency: typeof body.currency === 'string' ? body.currency : 'NAD',
    creatorShareCents,
    participants,
    orderId: typeof body.orderId === 'string' ? body.orderId : null,
    reference: typeof body.reference === 'string' ? body.reference : null,
  })
  if (!result.ok) {
    res.status(400).json({ error: result.error })
    return
  }
  res.status(201).json({ splitBillId: result.splitBillId })
})

walletExtrasRouter.get('/split-bills/:id', requireAuth, async (req, res) => {
  const pool = await getSqlPool({ eager: true })
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database unavailable' })
    return
  }
  const id = String(req.params.id ?? '').trim()
  const bill = await getSplitBillForUser(pool, req.user.sub, id)
  if (!bill) {
    res.status(404).json({ error: 'Split bill not found' })
    return
  }
  res.json(bill)
})
