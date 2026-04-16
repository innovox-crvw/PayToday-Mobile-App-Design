import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import { createAddress, listAddresses } from '../../repos/addressesRepo.js'

export const addressesRouter = Router()
addressesRouter.use(requireAuth)

addressesRouter.get('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const rows = await listAddresses(pool, req.user.sub)
  res.json({ items: rows })
})

addressesRouter.post('/', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const line1 = typeof req.body?.line1 === 'string' ? req.body.line1 : ''
  const city = typeof req.body?.city === 'string' ? req.body.city : ''
  if (!line1 || !city) {
    res.status(400).json({ error: 'line1 and city required' })
    return
  }
  const id = await createAddress(pool, req.user.sub, {
    label: typeof req.body?.label === 'string' ? req.body.label : null,
    line1,
    line2: typeof req.body?.line2 === 'string' ? req.body.line2 : null,
    city,
    region: typeof req.body?.region === 'string' ? req.body.region : null,
    postalCode: typeof req.body?.postalCode === 'string' ? req.body.postalCode : null,
    country: typeof req.body?.country === 'string' ? req.body.country : 'NA',
    isDefault: Boolean(req.body?.isDefault),
  })
  res.status(201).json({ id })
})
