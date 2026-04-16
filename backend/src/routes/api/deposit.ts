import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { listLocations } from '../../services/depositService.js'

export const depositRouter = Router()

depositRouter.get('/locations', async (_req, res) => {
  const pool = await getSqlPool()
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const items = await listLocations(pool)
  res.json({ items })
})
