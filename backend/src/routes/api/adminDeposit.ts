import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import {
  allocatePickupCode,
  createDepositBox,
  createDepositLocation,
  listDepositBoxOrdersForPickup,
  listLocationsWithBoxes,
  updateDepositBox,
  updateDepositLocation,
} from '../../services/depositService.js'
import { resolveOrderNotificationTarget } from '../../services/orderNotificationEmail.js'
import { enqueueNotification } from '../../services/notifications.js'
import { resolveOutboxChannel } from '../../services/notificationRouting.js'
import { isUuidString } from '../../repos/inventoryRepo.js'

export const adminDepositRouter = Router()
adminDepositRouter.use(requireAuth, requireRole('admin', 'ops', 'fulfillment'))

adminDepositRouter.get('/overview', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    const locations = await listLocationsWithBoxes(pool)
    res.json({ locations })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminDepositRouter.get('/pickup-orders', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50
  try {
    const items = await listDepositBoxOrdersForPickup(pool, limit)
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed' })
  }
})

adminDepositRouter.post('/locations', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const name = typeof req.body?.name === 'string' ? req.body.name : ''
  const addressSummary = typeof req.body?.addressSummary === 'string' ? req.body.addressSummary : null
  try {
    const ids = await createDepositLocation(pool, { name, addressSummary })
    res.status(201).json(ids)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

adminDepositRouter.patch('/locations/:locationId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const locationId = String(req.params.locationId ?? '')
  if (!isUuidString(locationId)) {
    res.status(400).json({ error: 'Invalid location id' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: { name?: string; addressSummary?: string | null } = {}
  if (Object.prototype.hasOwnProperty.call(body, 'name') && typeof body.name === 'string') {
    patch.name = body.name
  }
  if (Object.prototype.hasOwnProperty.call(body, 'addressSummary')) {
    patch.addressSummary = typeof body.addressSummary === 'string' ? body.addressSummary : null
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'Provide name and/or addressSummary' })
    return
  }
  try {
    await updateDepositLocation(pool, locationId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Location not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

adminDepositRouter.post('/locations/:locationId/boxes', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const locationId = String(req.params.locationId ?? '')
  if (!isUuidString(locationId)) {
    res.status(400).json({ error: 'Invalid location id' })
    return
  }
  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  const capacity = Number(req.body?.capacity ?? NaN)
  const body = req.body as Record<string, unknown>
  let dimIn: { widthMm?: number | null; depthMm?: number | null; heightMm?: number | null } = {}
  if (Object.prototype.hasOwnProperty.call(body, 'widthMm') || Object.prototype.hasOwnProperty.call(body, 'depthMm') || Object.prototype.hasOwnProperty.call(body, 'heightMm')) {
    if (
      !Object.prototype.hasOwnProperty.call(body, 'widthMm') ||
      !Object.prototype.hasOwnProperty.call(body, 'depthMm') ||
      !Object.prototype.hasOwnProperty.call(body, 'heightMm')
    ) {
      res.status(400).json({ error: 'When setting dimensions, send widthMm, depthMm, and heightMm together' })
      return
    }
    dimIn = {
      widthMm: body.widthMm as number | null,
      depthMm: body.depthMm as number | null,
      heightMm: body.heightMm as number | null,
    }
  }
  try {
    const ids = await createDepositBox(pool, locationId, {
      code,
      capacity,
      ...dimIn,
    })
    res.status(201).json(ids)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' })
  }
})

adminDepositRouter.patch('/boxes/:boxId', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const boxId = String(req.params.boxId ?? '')
  if (!isUuidString(boxId)) {
    res.status(400).json({ error: 'Invalid box id' })
    return
  }
  const body = req.body as Record<string, unknown>
  const patch: {
    code?: string
    capacity?: number
    widthMm?: number | null
    depthMm?: number | null
    heightMm?: number | null
  } = {}
  if (Object.prototype.hasOwnProperty.call(body, 'code') && typeof body.code === 'string') {
    patch.code = body.code
  }
  if (Object.prototype.hasOwnProperty.call(body, 'capacity')) {
    patch.capacity = Number(body.capacity)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'widthMm') || Object.prototype.hasOwnProperty.call(body, 'depthMm') || Object.prototype.hasOwnProperty.call(body, 'heightMm')) {
    if (
      !Object.prototype.hasOwnProperty.call(body, 'widthMm') ||
      !Object.prototype.hasOwnProperty.call(body, 'depthMm') ||
      !Object.prototype.hasOwnProperty.call(body, 'heightMm')
    ) {
      res.status(400).json({ error: 'When updating dimensions, send widthMm, depthMm, and heightMm together (null clears all)' })
      return
    }
    patch.widthMm = body.widthMm as number | null
    patch.depthMm = body.depthMm as number | null
    patch.heightMm = body.heightMm as number | null
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'Provide code, capacity, and/or widthMm+depthMm+heightMm' })
    return
  }
  try {
    await updateDepositBox(pool, boxId, patch)
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed'
    if (msg === 'Box not found') {
      res.status(404).json({ error: msg })
      return
    }
    res.status(400).json({ error: msg })
  }
})

/** Allocate pickup code + send pickup_code_ready notification (same behaviour as fulfillment route). */
adminDepositRouter.post('/orders/:orderId/pickup-code', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const orderId = String(req.params.orderId ?? '')
  const locationId = typeof req.body?.locationId === 'string' ? req.body.locationId : ''
  if (!isUuidString(orderId)) {
    res.status(400).json({ error: 'Invalid order id' })
    return
  }
  if (!locationId || !isUuidString(locationId)) {
    res.status(400).json({ error: 'locationId required' })
    return
  }
  try {
    const { pickupCode, expiresAt } = await allocatePickupCode(pool, orderId, locationId)
    const target = await resolveOrderNotificationTarget(pool, orderId)
    const channel = await resolveOutboxChannel(pool, target?.userId ?? null, target?.guestEmail ?? null, 'pickup_code_ready')
    await enqueueNotification(pool, {
      userId: target?.userId ?? null,
      email: target?.email ?? null,
      channel,
      templateKey: 'pickup_code_ready',
      payload: JSON.stringify({ orderId, code: pickupCode, expiresAt: expiresAt.toISOString() }),
    })
    res.json({ pickupCode, expiresAt: expiresAt.toISOString() })
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Allocation failed' })
  }
})
