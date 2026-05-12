import type { ConnectionPool } from 'mssql'
import { findUserById } from '../repos/usersRepo.js'
import { env } from '../config/env.js'

export function computeIsAdultFromDob(dob: Date | null | undefined, at: Date = new Date()): boolean {
  if (!dob || !(dob instanceof Date) || Number.isNaN(dob.getTime())) return false
  let age = at.getUTCFullYear() - dob.getUTCFullYear()
  const m = at.getUTCMonth() - dob.getUTCMonth()
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1
  return age >= 18
}

/** Used by catalogue and cart when `LIQUOR_GATING_ENABLED` is true. */
export async function sessionIsAdultForLiquor(pool: ConnectionPool, jwtSub: string | undefined): Promise<boolean> {
  if (!env.liquorGatingEnabled) return true
  const sub = jwtSub?.trim()
  if (!sub) return false
  const row = await findUserById(pool, sub)
  const dobRaw = row?.date_of_birth
  const dob = dobRaw ? (dobRaw instanceof Date ? dobRaw : new Date(String(dobRaw))) : null
  return computeIsAdultFromDob(dob)
}

export async function cartContainsAlcohol(pool: ConnectionPool, cartId: string): Promise<boolean> {
  const r = await pool.request().input('cid', cartId).query<{ c: number }>(`
    SELECT COUNT_BIG(1) AS c
    FROM dbo.cart_lines cl
    INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
    INNER JOIN dbo.products p ON p.id = v.product_id
    WHERE cl.cart_id = @cid AND ISNULL(p.contains_alcohol, 0) = 1
  `)
  return Number(r.recordset[0]?.c ?? 0) > 0
}

export async function assertAdultForAlcoholCart(
  pool: ConnectionPool,
  cartId: string,
  userId: string | null | undefined,
): Promise<void> {
  const has = await cartContainsAlcohol(pool, cartId)
  if (!has) return
  if (!userId) {
    throw new Error('Sign in and add your date of birth on your profile to purchase alcohol.')
  }
  const row = await pool
    .request()
    .input('id', userId)
    .query<{ date_of_birth: Date | null }>(`SELECT date_of_birth FROM dbo.users WHERE id = @id`)
  const dob = row.recordset[0]?.date_of_birth
  const d = dob ? (dob instanceof Date ? dob : new Date(String(dob))) : null
  if (!computeIsAdultFromDob(d)) {
    throw new Error('You must be 18 or older to purchase alcohol. Update your date of birth in Profile.')
  }
}
