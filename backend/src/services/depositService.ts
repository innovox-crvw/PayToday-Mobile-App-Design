import type { ConnectionPool, Transaction } from 'mssql'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { isUuidString } from '../repos/inventoryRepo.js'

export type DepositLocationRow = { id: string; name: string; addressSummary: string | null }

export type DepositBoxRow = {
  id: string
  locationId: string
  code: string
  capacity: number
  currentLoad: number
  available: number
  widthMm: number | null
  depthMm: number | null
  heightMm: number | null
}

export async function listLocations(pool: ConnectionPool): Promise<DepositLocationRow[]> {
  const r = await pool.request().query<{ id: string; name: string; address_summary: string | null }>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, name, address_summary FROM dbo.deposit_locations ORDER BY name
  `)
  return r.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    addressSummary: row.address_summary,
  }))
}

export async function listLocationsWithBoxes(pool: ConnectionPool): Promise<
  Array<DepositLocationRow & { boxes: DepositBoxRow[] }>
> {
  const locs = await listLocations(pool)
  if (locs.length === 0) return []
  const r = await pool.request().query<{
    id: string
    location_id: string
    code: string
    capacity: number
    current_load: number
    width_mm: number | null
    depth_mm: number | null
    height_mm: number | null
  }>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id,
           CAST(location_id AS NVARCHAR(36)) AS location_id,
           code, capacity, current_load,
           width_mm, depth_mm, height_mm
    FROM dbo.deposit_boxes
    ORDER BY location_id, code
  `)
  const byLoc = new Map<string, DepositBoxRow[]>()
  for (const row of r.recordset) {
    const b: DepositBoxRow = {
      id: row.id,
      locationId: row.location_id,
      code: row.code,
      capacity: row.capacity,
      currentLoad: row.current_load,
      available: Math.max(0, row.capacity - row.current_load),
      widthMm: row.width_mm != null ? Number(row.width_mm) : null,
      depthMm: row.depth_mm != null ? Number(row.depth_mm) : null,
      heightMm: row.height_mm != null ? Number(row.height_mm) : null,
    }
    const arr = byLoc.get(row.location_id) ?? []
    arr.push(b)
    byLoc.set(row.location_id, arr)
  }
  return locs.map((l) => ({ ...l, boxes: byLoc.get(l.id) ?? [] }))
}

export async function createDepositLocation(
  pool: ConnectionPool,
  input: { name: string; addressSummary: string | null },
): Promise<{ id: string }> {
  const name = input.name.trim()
  if (!name) {
    throw new Error('name required')
  }
  const r = await pool
    .request()
    .input('name', name.slice(0, 200))
    .input('addr', input.addressSummary?.trim() ? input.addressSummary.trim().slice(0, 500) : null)
    .query<{ id: string }>(`
      INSERT INTO dbo.deposit_locations (name, address_summary)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@name, @addr)
    `)
  const id = r.recordset[0]?.id
  if (!id) {
    throw new Error('Insert failed')
  }
  return { id }
}

export async function updateDepositLocation(
  pool: ConnectionPool,
  locationId: string,
  input: { name?: string; addressSummary?: string | null },
): Promise<void> {
  if (!isUuidString(locationId)) {
    throw new Error('Invalid location id')
  }
  const chk = await pool.request().input('id', locationId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.deposit_locations WHERE id = @id`)
  if (Number(chk.recordset[0]?.c ?? 0) === 0) {
    throw new Error('Location not found')
  }
  if (input.name !== undefined) {
    const n = input.name.trim()
    if (!n) {
      throw new Error('name cannot be empty')
    }
    await pool
      .request()
      .input('id', locationId)
      .input('name', n.slice(0, 200))
      .query(`UPDATE dbo.deposit_locations SET name = @name WHERE id = @id`)
  }
  if (input.addressSummary !== undefined) {
    const a = input.addressSummary?.trim() ? input.addressSummary.trim().slice(0, 500) : null
    await pool.request().input('id', locationId).input('addr', a).query(`UPDATE dbo.deposit_locations SET address_summary = @addr WHERE id = @id`)
  }
}

function parsePositiveMmOrNull(v: unknown): number | null {
  if (v === null) return null
  if (v === undefined) {
    throw new Error('widthMm, depthMm, and heightMm must be positive integers or null')
  }
  const n = Number(v)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error('widthMm, depthMm, and heightMm must be positive integers when set')
  }
  return n
}

/** Either omit all three keys, or send all three (each number ≥1, or all null to clear stored dimensions). */
function normalizeBoxDims3(input: { widthMm?: number | null; depthMm?: number | null; heightMm?: number | null }): {
  w: number | null
  d: number | null
  h: number | null
} {
  if (input.widthMm === undefined && input.depthMm === undefined && input.heightMm === undefined) {
    return { w: null, d: null, h: null }
  }
  if (input.widthMm === undefined || input.depthMm === undefined || input.heightMm === undefined) {
    throw new Error('Provide widthMm, depthMm, and heightMm together, or omit all three')
  }
  const w = parsePositiveMmOrNull(input.widthMm)
  const d = parsePositiveMmOrNull(input.depthMm)
  const h = parsePositiveMmOrNull(input.heightMm)
  const nums = [w, d, h].filter((x): x is number => typeof x === 'number')
  if (nums.length > 0 && nums.length < 3) {
    throw new Error('Either set all three interior dimensions (mm) or set all three to null')
  }
  return { w, d, h }
}

export async function createDepositBox(
  pool: ConnectionPool,
  locationId: string,
  input: { code: string; capacity: number; widthMm?: number | null; depthMm?: number | null; heightMm?: number | null },
): Promise<{ id: string }> {
  if (!isUuidString(locationId)) {
    throw new Error('Invalid location id')
  }
  const code = input.code.trim().slice(0, 40)
  if (!code) {
    throw new Error('code required')
  }
  const cap = Number(input.capacity)
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error('capacity must be a positive integer')
  }
  const loc = await pool.request().input('id', locationId).query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.deposit_locations WHERE id = @id`)
  if (Number(loc.recordset[0]?.c ?? 0) === 0) {
    throw new Error('Location not found')
  }
  const dup = await pool
    .request()
    .input('lid', locationId)
    .input('code', code)
    .query<{ c: number }>(
      `SELECT COUNT_BIG(1) AS c FROM dbo.deposit_boxes WHERE location_id = @lid AND LOWER(LTRIM(RTRIM(code))) = LOWER(LTRIM(RTRIM(@code)))`,
    )
  if (Number(dup.recordset[0]?.c ?? 0) > 0) {
    throw new Error('A box with this code already exists at this location')
  }
  const { w: widthMm, d: depthMm, h: heightMm } = normalizeBoxDims3({
    widthMm: input.widthMm,
    depthMm: input.depthMm,
    heightMm: input.heightMm,
  })
  const r = await pool
    .request()
    .input('lid', locationId)
    .input('code', code)
    .input('cap', cap)
    .input('wm', widthMm)
    .input('dm', depthMm)
    .input('hm', heightMm)
    .query<{ id: string }>(`
      INSERT INTO dbo.deposit_boxes (location_id, code, capacity, current_load, width_mm, depth_mm, height_mm)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@lid, @code, @cap, 0, @wm, @dm, @hm)
    `)
  const id = r.recordset[0]?.id
  if (!id) {
    throw new Error('Insert failed')
  }
  return { id }
}

export async function updateDepositBox(
  pool: ConnectionPool,
  boxId: string,
  input: { code?: string; capacity?: number; widthMm?: number | null; depthMm?: number | null; heightMm?: number | null },
): Promise<void> {
  if (!isUuidString(boxId)) {
    throw new Error('Invalid box id')
  }
  const tx = pool.transaction()
  await tx.begin()
  try {
    const cur = await tx
      .request()
      .input('id', boxId)
      .query<{
        location_id: string
        code: string
        capacity: number
        current_load: number
        width_mm: number | null
        depth_mm: number | null
        height_mm: number | null
      }>(
        `SELECT CAST(location_id AS NVARCHAR(36)) AS location_id, code, capacity, current_load,
                width_mm, depth_mm, height_mm
         FROM dbo.deposit_boxes WHERE id = @id`,
      )
    const row = cur.recordset[0]
    if (!row) {
      throw new Error('Box not found')
    }
    if (input.code !== undefined) {
      const c = input.code.trim().slice(0, 40)
      if (!c) {
        throw new Error('code cannot be empty')
      }
      const dup = await tx
        .request()
        .input('bid', boxId)
        .input('lid', row.location_id)
        .input('code', c)
        .query<{ c: number }>(
          `SELECT COUNT_BIG(1) AS c FROM dbo.deposit_boxes WHERE location_id = @lid AND id <> @bid AND LOWER(LTRIM(RTRIM(code))) = LOWER(LTRIM(RTRIM(@code)))`,
        )
      if (Number(dup.recordset[0]?.c ?? 0) > 0) {
        throw new Error('Another box at this location already uses this code')
      }
      await tx.request().input('id', boxId).input('code', c).query(`UPDATE dbo.deposit_boxes SET code = @code WHERE id = @id`)
    }
    if (input.capacity !== undefined) {
      const cap = Number(input.capacity)
      if (!Number.isInteger(cap) || cap < 1) {
        throw new Error('capacity must be a positive integer')
      }
      if (cap < row.current_load) {
        throw new Error('capacity cannot be less than current load')
      }
      await tx.request().input('id', boxId).input('cap', cap).query(`UPDATE dbo.deposit_boxes SET capacity = @cap WHERE id = @id`)
    }
    if (input.widthMm !== undefined || input.depthMm !== undefined || input.heightMm !== undefined) {
      if (input.widthMm === undefined || input.depthMm === undefined || input.heightMm === undefined) {
        throw new Error('When updating dimensions, send widthMm, depthMm, and heightMm together (use null to clear all)')
      }
      const merged = normalizeBoxDims3(input)
      await tx
        .request()
        .input('id', boxId)
        .input('wm', merged.w)
        .input('dm', merged.d)
        .input('hm', merged.h)
        .query(`UPDATE dbo.deposit_boxes SET width_mm = @wm, depth_mm = @dm, height_mm = @hm WHERE id = @id`)
    }
    await tx.commit()
  } catch (e) {
    await tx.rollback()
    throw e
  }
}

export type DepositPickupOrderRow = {
  orderId: string
  status: string
  totalCents: number
  currency: string
  createdAt: string
  depositLocationId: string | null
  depositLocationName: string | null
  activePickupCodes: number
}

export async function listDepositBoxOrdersForPickup(pool: ConnectionPool, limit: number): Promise<DepositPickupOrderRow[]> {
  const take = Math.min(Math.max(Number(limit) || 40, 1), 200)
  const r = await pool.request().input('lim', take).query<{
    orderId: string
    status: string
    total_cents: number
    currency: string
    created_at: Date
    deposit_location_id: string | null
    deposit_location_name: string | null
    active_pickup_codes: number
  }>(`
    SELECT TOP (@lim)
      CAST(o.id AS NVARCHAR(36)) AS orderId,
      o.status,
      o.total_cents,
      o.currency,
      o.created_at,
      CAST(o.deposit_location_id AS NVARCHAR(36)) AS deposit_location_id,
      dl.name AS deposit_location_name,
      ISNULL((
        SELECT COUNT_BIG(1) FROM dbo.pickup_codes pc
        WHERE pc.order_id = o.id AND pc.used_at IS NULL AND pc.expires_at > SYSUTCDATETIME()
      ), 0) AS active_pickup_codes
    FROM dbo.orders o
    LEFT JOIN dbo.deposit_locations dl ON dl.id = o.deposit_location_id
    WHERE o.delivery_method = N'deposit_box'
      AND o.status IN (N'paid', N'processing')
    ORDER BY o.created_at DESC
  `)
  return r.recordset.map((row) => ({
    orderId: row.orderId,
    status: row.status,
    totalCents: row.total_cents,
    currency: row.currency,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    depositLocationId: row.deposit_location_id,
    depositLocationName: row.deposit_location_name,
    activePickupCodes: Number(row.active_pickup_codes ?? 0),
  }))
}

/** Self-service pickup codes shown on the order page expire after this many seconds. */
export const CUSTOMER_PICKUP_CODE_TTL_SECONDS = 30

export type AllocatePickupResult = {
  pickupCode: string
  expiresAt: Date
}

async function assertOrderEligibleForDepositPickup(transaction: Transaction, orderId: string): Promise<void> {
  const o = await transaction
    .request()
    .input('oid', orderId)
    .query<{ status: string; delivery_method: string }>(
      `SELECT status, delivery_method FROM dbo.orders WHERE id = @oid`,
    )
  const row = o.recordset[0]
  if (!row) {
    throw new Error('Order not found')
  }
  if (String(row.delivery_method).toLowerCase() !== 'deposit_box') {
    throw new Error('Pickup codes are only for deposit-box (locker) orders')
  }
  const st = String(row.status).toLowerCase()
  if (st !== 'paid' && st !== 'processing') {
    throw new Error('Order must be paid or processing before a pickup code is issued')
  }
}

/** Frees box capacity for any unused pickup rows (including expired) tied to this order. */
export async function revokeUnusedPickupCodesForOrder(transaction: Transaction, orderId: string): Promise<void> {
  const rows = await transaction
    .request()
    .input('oid', orderId)
    .query<{ id: string; box_id: string }>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, CAST(box_id AS NVARCHAR(36)) AS box_id
      FROM dbo.pickup_codes
      WHERE order_id = @oid AND used_at IS NULL
    `)
  for (const r of rows.recordset) {
    await transaction
      .request()
      .input('bid', r.box_id)
      .query(
        `UPDATE dbo.deposit_boxes SET current_load = CASE WHEN current_load > 0 THEN current_load - 1 ELSE 0 END WHERE id = @bid`,
      )
    await transaction.request().input('pid', r.id).query(`DELETE FROM dbo.pickup_codes WHERE id = @pid`)
  }
}

async function allocatePickupCodeInTransaction(
  transaction: Transaction,
  orderId: string,
  locationId: string,
  expiresAt: Date,
): Promise<string> {
  const box = await transaction
    .request()
    .input('loc', locationId)
    .query<{ id: string }>(`
      SELECT TOP 1 CAST(b.id AS NVARCHAR(36)) AS id
      FROM dbo.deposit_boxes b
      WHERE b.location_id = @loc AND b.current_load < b.capacity
      ORDER BY b.code
    `)
  const boxId = box.recordset[0]?.id
  if (!boxId) {
    throw new Error('No deposit box capacity at this location')
  }

  const plain = `${crypto.randomInt(100000, 999999)}`
  const codeHash = crypto.createHash('sha256').update(plain, 'utf8').digest()

  const upd = await transaction
    .request()
    .input('boxId', boxId)
    .query(`UPDATE dbo.deposit_boxes SET current_load = current_load + 1 WHERE id = @boxId AND current_load < capacity`)
  if ((upd.rowsAffected[0] ?? 0) === 0) {
    throw new Error('Box capacity changed — retry')
  }

  await transaction
    .request()
    .input('orderId', orderId)
    .input('boxId', boxId)
    .input('hash', codeHash)
    .input('expires', expiresAt)
    .query(`
      INSERT INTO dbo.pickup_codes (order_id, box_id, code_hash, expires_at)
      VALUES (@orderId, @boxId, @hash, @expires)
    `)

  return plain
}

/**
 * Staff allocation: revokes any prior unused codes for the order, then issues a new code (TTL from env).
 */
export async function allocatePickupCode(
  pool: ConnectionPool,
  orderId: string,
  locationId: string,
): Promise<AllocatePickupResult> {
  if (!isUuidString(orderId) || !isUuidString(locationId)) {
    throw new Error('Invalid id')
  }
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    await revokeUnusedPickupCodesForOrder(transaction, orderId)
    await assertOrderEligibleForDepositPickup(transaction, orderId)
    const expiresAt = new Date(Date.now() + env.pickupCodeTtlHours * 60 * 60 * 1000)
    const pickupCode = await allocatePickupCodeInTransaction(transaction, orderId, locationId, expiresAt)
    await transaction.commit()
    return { pickupCode, expiresAt }
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

/**
 * Customer self-service on the order page: uses the order's checkout deposit location; code valid for {@link CUSTOMER_PICKUP_CODE_TTL_SECONDS}.
 */
export async function allocateCustomerVolatilePickupCode(pool: ConnectionPool, orderId: string): Promise<AllocatePickupResult> {
  if (!isUuidString(orderId)) {
    throw new Error('Invalid order id')
  }
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    await revokeUnusedPickupCodesForOrder(transaction, orderId)
    await assertOrderEligibleForDepositPickup(transaction, orderId)
    const locRow = await transaction
      .request()
      .input('oid', orderId)
      .query<{ deposit_location_id: string | null }>(
        `SELECT CAST(deposit_location_id AS NVARCHAR(36)) AS deposit_location_id FROM dbo.orders WHERE id = @oid`,
      )
    const locationId = locRow.recordset[0]?.deposit_location_id
    if (!locationId) {
      throw new Error('This order has no deposit location — contact support or place a new pickup order.')
    }
    const expiresAt = new Date(Date.now() + CUSTOMER_PICKUP_CODE_TTL_SECONDS * 1000)
    const pickupCode = await allocatePickupCodeInTransaction(transaction, orderId, locationId, expiresAt)
    await transaction.commit()
    return { pickupCode, expiresAt }
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}
