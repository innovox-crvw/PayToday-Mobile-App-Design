import type { ConnectionPool } from 'mssql'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

export async function listLocations(pool: ConnectionPool): Promise<{ id: string; name: string; addressSummary: string | null }[]> {
  const r = await pool.request().query<{ id: string; name: string; address_summary: string | null }>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, name, address_summary FROM dbo.deposit_locations ORDER BY name
  `)
  return r.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    addressSummary: row.address_summary,
  }))
}

/** Pick a box with spare capacity, bump load, store hashed one-time code. Returns plaintext code once. */
export async function allocatePickupCode(pool: ConnectionPool, orderId: string, locationId: string): Promise<string> {
  const box = await pool
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
  const codeHash = crypto.createHash('sha256').update(plain).digest()
  const expires = new Date(Date.now() + env.pickupCodeTtlHours * 60 * 60 * 1000)

  await pool
    .request()
    .input('boxId', boxId)
    .query(`UPDATE dbo.deposit_boxes SET current_load = current_load + 1 WHERE id = @boxId`)

  await pool
    .request()
    .input('orderId', orderId)
    .input('boxId', boxId)
    .input('hash', codeHash)
    .input('expires', expires)
    .query(`
      INSERT INTO dbo.pickup_codes (order_id, box_id, code_hash, expires_at)
      VALUES (@orderId, @boxId, @hash, @expires)
    `)

  return plain
}
