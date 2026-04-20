import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from '../../repos/addressesRepo.js'

export const addressesRouter = Router()
addressesRouter.use(requireAuth)

function parseAddressBody(body: unknown): {
  label: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postalCode: string | null
  country: string
  isDefault: boolean
} | null {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const line1 = typeof b.line1 === 'string' ? b.line1.trim() : ''
  const city = typeof b.city === 'string' ? b.city.trim() : ''
  if (!line1 || !city) return null
  return {
    label: typeof b.label === 'string' ? b.label.trim() || null : null,
    line1,
    line2: typeof b.line2 === 'string' ? b.line2.trim() || null : null,
    city,
    region: typeof b.region === 'string' ? b.region.trim() || null : null,
    postalCode: typeof b.postalCode === 'string' ? b.postalCode.trim() || null : null,
    country: typeof b.country === 'string' && b.country.trim() ? b.country.trim() : 'NA',
    isDefault: Boolean(b.isDefault),
  }
}

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
  const parsed = parseAddressBody(req.body)
  if (!parsed) {
    res.status(400).json({ error: 'line1 and city required' })
    return
  }
  const id = await createAddress(pool, req.user.sub, parsed)
  res.status(201).json({ id })
})

addressesRouter.patch('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const parsed = parseAddressBody(req.body)
  if (!parsed) {
    res.status(400).json({ error: 'line1 and city required' })
    return
  }
  const ok = await updateAddress(pool, req.user.sub, String(req.params.id), parsed)
  if (!ok) {
    res.status(404).json({ error: 'Address not found' })
    return
  }
  res.json({ ok: true })
})

addressesRouter.delete('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  try {
    const ok = await deleteAddress(pool, req.user.sub, String(req.params.id))
    if (!ok) {
      res.status(404).json({ error: 'Address not found' })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/FK_|REFERENCE|constraint/i.test(msg)) {
      res.status(409).json({ error: 'This address is linked to an existing order and cannot be removed.' })
      return
    }
    throw e
  }
})

addressesRouter.post('/:id/default', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const ok = await setDefaultAddress(pool, req.user.sub, String(req.params.id))
  if (!ok) {
    res.status(404).json({ error: 'Address not found' })
    return
  }
  res.json({ ok: true })
})
