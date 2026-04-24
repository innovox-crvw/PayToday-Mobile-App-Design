import { Router } from 'express'
import { getSqlPool } from '../../db/pool.js'
import { requireAuth } from '../../middleware/auth.js'
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from '../../repos/addressesRepo.js'
import { INPUT_LIMITS, parseAddressTextLine, parseOptionalCountryCode } from '../../lib/inputValidators.js'

export const addressesRouter = Router()
addressesRouter.use(requireAuth)

function parseAddressBody(body: unknown):
  | {
      ok: true
      value: {
        label: string | null
        line1: string
        line2: string | null
        city: string
        region: string | null
        postalCode: string | null
        country: string
        isDefault: boolean
      }
    }
  | { ok: false; error: string; field?: string } {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const line1 = parseAddressTextLine(b.line1, 'line1', INPUT_LIMITS.addressLineMax, true)
  if (!line1.ok) return { ok: false, error: line1.message, field: line1.field }
  const city = parseAddressTextLine(b.city, 'city', INPUT_LIMITS.cityMax, true)
  if (!city.ok) return { ok: false, error: city.message, field: city.field }
  let label: string | null = null
  if (typeof b.label === 'string' && b.label.trim()) {
    const lr = parseAddressTextLine(b.label, 'label', INPUT_LIMITS.labelMax, true)
    if (!lr.ok) return { ok: false, error: lr.message, field: lr.field }
    label = lr.value
  }
  let line2: string | null = null
  if (typeof b.line2 === 'string' && b.line2.trim()) {
    const l2 = parseAddressTextLine(b.line2, 'line2', INPUT_LIMITS.addressLineMax, true)
    if (!l2.ok) return { ok: false, error: l2.message, field: l2.field }
    line2 = l2.value
  }
  let region: string | null = null
  if (typeof b.region === 'string' && b.region.trim()) {
    const rr = parseAddressTextLine(b.region, 'region', INPUT_LIMITS.regionMax, true)
    if (!rr.ok) return { ok: false, error: rr.message, field: rr.field }
    region = rr.value
  }
  let postalCode: string | null = null
  if (typeof b.postalCode === 'string' && b.postalCode.trim()) {
    const pr = parseAddressTextLine(b.postalCode, 'postalCode', INPUT_LIMITS.postalMax, true)
    if (!pr.ok) return { ok: false, error: pr.message, field: pr.field }
    postalCode = pr.value
  }
  const cr = parseOptionalCountryCode(b.country, 'country')
  if (!cr.ok) return { ok: false, error: cr.message, field: cr.field }
  return {
    ok: true,
    value: {
      label,
      line1: line1.value,
      line2,
      city: city.value,
      region,
      postalCode,
      country: cr.value,
      isDefault: Boolean(b.isDefault),
    },
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
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, field: parsed.field, code: 'validation_error' })
    return
  }
  const id = await createAddress(pool, req.user.sub, parsed.value)
  res.status(201).json({ id })
})

addressesRouter.patch('/:id', async (req, res) => {
  const pool = await getSqlPool()
  if (!pool || !req.user) {
    res.status(503).json({ error: 'Database not configured' })
    return
  }
  const parsed = parseAddressBody(req.body)
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, field: parsed.field, code: 'validation_error' })
    return
  }
  const ok = await updateAddress(pool, req.user.sub, String(req.params.id), parsed.value)
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
