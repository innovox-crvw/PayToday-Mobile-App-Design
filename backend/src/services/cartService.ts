import type { ConnectionPool } from 'mssql'
import type { SqlExecutor } from '../db/sqlExecutor.js'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { getVariantInventoryPolicy } from '../repos/productsRepo.js'

const CART_COOKIE = 'pt_cart_session'

export { CART_COOKIE }

export async function getOrCreateCartId(
  pool: ConnectionPool,
  sessionToken: string | undefined,
  userId: string | undefined,
): Promise<{ cartId: string; sessionToken: string }> {
  let token = sessionToken
  if (!token) {
    token = crypto.randomBytes(24).toString('hex')
  }

  if (userId) {
    const existing = await pool
      .request()
      .input('userId', userId)
      .query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.carts WHERE user_id = @userId ORDER BY updated_at DESC`)
    if (existing.recordset[0]) {
      await pool.request().input('cid', existing.recordset[0].id).query(`UPDATE dbo.carts SET updated_at = SYSUTCDATETIME() WHERE id = @cid`)
      return { cartId: existing.recordset[0].id, sessionToken: token }
    }
  }

  if (token) {
    const guest = await pool
      .request()
      .input('st', token)
      .query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.carts WHERE session_token = @st`)
    if (guest.recordset[0]) {
      if (userId) {
        await pool
          .request()
          .input('cid', guest.recordset[0].id)
          .input('userId', userId)
          .query(`UPDATE dbo.carts SET user_id = @userId, session_token = NULL, updated_at = SYSUTCDATETIME() WHERE id = @cid`)
      } else {
        await pool.request().input('cid', guest.recordset[0].id).query(`UPDATE dbo.carts SET updated_at = SYSUTCDATETIME() WHERE id = @cid`)
      }
      return { cartId: guest.recordset[0].id, sessionToken: token }
    }
  }

  const ins = await pool
    .request()
    .input('st', userId ? null : token)
    .input('userId', userId ?? null)
    .query<{ id: string }>(`
      INSERT INTO dbo.carts (session_token, user_id) OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@st, @userId)
    `)
  return { cartId: ins.recordset[0].id, sessionToken: token }
}

function weightedUnitPriceCents(q1: number, p1: number, q2: number, p2: number): number {
  const t = q1 + q2
  if (t <= 0) return p1
  return Math.round((p1 * q1 + p2 * q2) / t)
}

export async function mergeGuestCartIntoUser(pool: ConnectionPool, sessionToken: string, userId: string): Promise<void> {
  const g = await pool
    .request()
    .input('st', sessionToken)
    .query<{ id: string }>(`SELECT CAST(id AS NVARCHAR(36)) AS id FROM dbo.carts WHERE session_token = @st`)
  const guestCartId = g.recordset[0]?.id
  if (!guestCartId) return

  const u = await pool
    .request()
    .input('userId', userId)
    .query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.carts WHERE user_id = @userId ORDER BY updated_at DESC`)
  let userCartId = u.recordset[0]?.id

  if (!userCartId) {
    const ins = await pool
      .request()
      .input('userId', userId)
      .query<{ id: string }>(`
        INSERT INTO dbo.carts (user_id) OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id VALUES (@userId)
      `)
    userCartId = ins.recordset[0].id
  }

  try {
    const guestLines = await pool.request().input('guestCartId', guestCartId).query<{
      variant_id: string
      quantity: number
      unit_price_cents: number | null
      line_currency: string | null
      price_cents: number
      currency: string
    }>(`
      SELECT CAST(cl.variant_id AS NVARCHAR(36)) AS variant_id,
             cl.quantity,
             cl.unit_price_cents,
             LTRIM(RTRIM(cl.line_currency)) AS line_currency,
             v.price_cents,
             v.currency
      FROM dbo.cart_lines cl
      INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
      WHERE cl.cart_id = @guestCartId
    `)

    for (const line of guestLines.recordset) {
      const gSnap = line.unit_price_cents ?? line.price_cents
      const gCur = (line.line_currency ?? line.currency ?? 'NAD').trim().slice(0, 3).toUpperCase() || 'NAD'

      const existing = await pool
        .request()
        .input('ucid', userCartId)
        .input('vid', line.variant_id)
        .query<{ quantity: number; unit_price_cents: number | null; line_currency: string | null }>(`
          SELECT cl.quantity, cl.unit_price_cents, LTRIM(RTRIM(cl.line_currency)) AS line_currency
          FROM dbo.cart_lines cl
          WHERE cl.cart_id = @ucid AND cl.variant_id = @vid
        `)

      const ex = existing.recordset[0]
      if (ex) {
        const uSnap = ex.unit_price_cents ?? gSnap
        const newQty = ex.quantity + line.quantity
        const newUnit = weightedUnitPriceCents(ex.quantity, uSnap, line.quantity, gSnap)
        await pool
          .request()
          .input('ucid', userCartId)
          .input('vid', line.variant_id)
          .input('qty', newQty)
          .input('up', newUnit)
          .input('cur', gCur)
          .query(`
            UPDATE dbo.cart_lines
            SET quantity = @qty, unit_price_cents = @up, line_currency = @cur
            WHERE cart_id = @ucid AND variant_id = @vid
          `)
      } else {
        await pool
          .request()
          .input('ucid', userCartId)
          .input('vid', line.variant_id)
          .input('qty', line.quantity)
          .input('up', gSnap)
          .input('cur', gCur)
          .query(`
            INSERT INTO dbo.cart_lines (cart_id, variant_id, quantity, unit_price_cents, line_currency)
            VALUES (@ucid, @vid, @qty, @up, @cur)
          `)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/unit_price_cents|line_currency|Invalid column name/i.test(msg)) throw e
    const lines = await pool
      .request()
      .input('guestCartId', guestCartId)
      .query<{ variant_id: string; quantity: number }>(`SELECT CAST(variant_id AS NVARCHAR(36)) AS variant_id, quantity FROM dbo.cart_lines WHERE cart_id = @guestCartId`)

    for (const line of lines.recordset) {
      await pool
        .request()
        .input('userCartId', userCartId)
        .input('variantId', line.variant_id)
        .input('qty', line.quantity)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.cart_lines WHERE cart_id = @userCartId AND variant_id = @variantId)
            UPDATE dbo.cart_lines SET quantity = quantity + @qty WHERE cart_id = @userCartId AND variant_id = @variantId
          ELSE
            INSERT INTO dbo.cart_lines (cart_id, variant_id, quantity) VALUES (@userCartId, @variantId, @qty)
        `)
    }
  }

  await pool.request().input('guestCartId', guestCartId).query(`DELETE FROM dbo.cart_lines WHERE cart_id = @guestCartId`)
  await pool.request().input('guestCartId', guestCartId).query(`DELETE FROM dbo.carts WHERE id = @guestCartId`)
}

export async function getCartLines(
  executor: SqlExecutor,
  cartId: string,
): Promise<
  {
    lineId: string
    variantId: string
    quantity: number
    sku: string
    name: string
    unitPriceCents: number
    currency: string
  }[]
> {
  try {
    const r = await executor.request().input('cartId', cartId).query<{
      lineId: string
      variantId: string
      quantity: number
      sku: string
      variantName: string
      snap_cents: number
      price_cents: number
      line_curr: string | null
      currency: string
      productName: string
    }>(`
      SELECT CAST(cl.variant_id AS NVARCHAR(36)) AS lineId,
             CAST(cl.variant_id AS NVARCHAR(36)) AS variantId,
             cl.quantity,
             v.sku,
             v.name AS variantName,
             COALESCE(cl.unit_price_cents, v.price_cents) AS snap_cents,
             v.price_cents,
             LTRIM(RTRIM(cl.line_currency)) AS line_curr,
             v.currency,
             p.name AS productName
      FROM dbo.cart_lines cl
      INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE cl.cart_id = @cartId
    `)
    return r.recordset.map((row) => {
      const cur = (row.line_curr ?? row.currency ?? 'NAD').trim().slice(0, 3).toUpperCase() || 'NAD'
      return {
        lineId: row.lineId,
        variantId: row.variantId,
        quantity: row.quantity,
        sku: row.sku,
        name: `${row.productName} — ${row.variantName}`,
        unitPriceCents: row.snap_cents,
        currency: cur,
      }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/unit_price_cents|line_currency|Invalid column name/i.test(msg)) throw e
    const r = await executor.request().input('cartId', cartId).query<{
      lineId: string
      variantId: string
      quantity: number
      sku: string
      variantName: string
      price_cents: number
      currency: string
      productName: string
    }>(`
      SELECT CAST(cl.variant_id AS NVARCHAR(36)) AS lineId,
             CAST(cl.variant_id AS NVARCHAR(36)) AS variantId,
             cl.quantity,
             v.sku,
             v.name AS variantName,
             v.price_cents,
             v.currency,
             p.name AS productName
      FROM dbo.cart_lines cl
      INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE cl.cart_id = @cartId
    `)
    return r.recordset.map((row) => ({
      lineId: row.lineId,
      variantId: row.variantId,
      quantity: row.quantity,
      sku: row.sku,
      name: `${row.productName} — ${row.variantName}`,
      unitPriceCents: row.price_cents,
      currency: row.currency.trim(),
    }))
  }
}

export async function sumVariantStockAcrossWarehouses(pool: ConnectionPool, variantId: string): Promise<number> {
  const r = await pool
    .request()
    .input('vid', variantId)
    .query<{ q: number }>(
      `SELECT ISNULL(SUM(CAST(iq.quantity AS BIGINT)), 0) AS q FROM dbo.inventory_quantity iq WHERE iq.variant_id = @vid`,
    )
  const n = Number(r.recordset[0]?.q ?? 0)
  return Number.isFinite(n) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, n)) : 0
}

async function maxPurchasableQuantity(pool: ConnectionPool, variantId: string): Promise<number> {
  const pol = await getVariantInventoryPolicy(pool, variantId)
  if (pol === 'not_tracked' || pol === 'continue') {
    return Number.MAX_SAFE_INTEGER
  }
  return sumVariantStockAcrossWarehouses(pool, variantId)
}

export async function upsertCartLine(pool: ConnectionPool, cartId: string, variantId: string, quantity: number): Promise<void> {
  const minQ = env.cartLineMinQty
  const maxQ = env.cartLineMaxQty
  if (quantity > 0 && (quantity < minQ || quantity > maxQ)) {
    throw new Error(`Quantity must be between ${minQ} and ${maxQ}`)
  }
  if (quantity <= 0) {
    await pool.request().input('cartId', cartId).input('variantId', variantId).query(`DELETE FROM dbo.cart_lines WHERE cart_id = @cartId AND variant_id = @variantId`)
    return
  }
  const available = await maxPurchasableQuantity(pool, variantId)
  if (quantity > available) {
    throw new Error(available <= 0 ? 'This item is out of stock' : `Only ${available} in stock`)
  }
  try {
    await pool
      .request()
      .input('cartId', cartId)
      .input('variantId', variantId)
      .input('qty', quantity)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.cart_lines WHERE cart_id = @cartId AND variant_id = @variantId)
          UPDATE dbo.cart_lines SET quantity = @qty WHERE cart_id = @cartId AND variant_id = @variantId
        ELSE
          INSERT INTO dbo.cart_lines (cart_id, variant_id, quantity, unit_price_cents, line_currency)
          SELECT @cartId, @variantId, @qty, v.price_cents, v.currency
          FROM dbo.product_variants v WHERE v.id = @variantId
      `)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/unit_price_cents|line_currency|Invalid column name/i.test(msg)) throw e
    await pool
      .request()
      .input('cartId', cartId)
      .input('variantId', variantId)
      .input('qty', quantity)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.cart_lines WHERE cart_id = @cartId AND variant_id = @variantId)
          UPDATE dbo.cart_lines SET quantity = @qty WHERE cart_id = @cartId AND variant_id = @variantId
        ELSE
          INSERT INTO dbo.cart_lines (cart_id, variant_id, quantity) VALUES (@cartId, @variantId, @qty)
      `)
  }
  await pool.request().input('cartId', cartId).query(`UPDATE dbo.carts SET updated_at = SYSUTCDATETIME() WHERE id = @cartId`)
}

/** Remove all lines from a cart (cart row kept for stable cookie / session). */
export async function clearCartLines(pool: ConnectionPool, cartId: string): Promise<void> {
  await pool.request().input('cartId', cartId).query(`DELETE FROM dbo.cart_lines WHERE cart_id = @cartId`)
  await pool.request().input('cartId', cartId).query(`UPDATE dbo.carts SET updated_at = SYSUTCDATETIME() WHERE id = @cartId`)
}
