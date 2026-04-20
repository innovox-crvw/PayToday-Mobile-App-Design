import type { ConnectionPool } from 'mssql'
import type { SqlExecutor } from '../db/sqlExecutor.js'
import { env } from '../config/env.js'
import { getCartLines, sumVariantStockAcrossWarehouses } from './cartService.js'
import { getVariantInventoryPolicy } from '../repos/productsRepo.js'

export async function validateShippingAddressComplete(
  pool: ConnectionPool,
  userId: string,
  addressId: string,
): Promise<void> {
  const r = await pool
    .request()
    .input('uid', userId)
    .input('aid', addressId)
    .query<{ line1: string; city: string; postal_code: string | null }>(`
      SELECT line1, city, postal_code
      FROM dbo.addresses
      WHERE id = @aid AND user_id = @uid
    `)
  const row = r.recordset[0]
  if (!row) {
    throw new Error('Delivery address not found')
  }
  if (!row.line1?.trim()) {
    throw new Error('Delivery address must include a street line')
  }
  if (!row.city?.trim()) {
    throw new Error('Delivery address must include a city')
  }
  if (!String(row.postal_code ?? '').trim()) {
    throw new Error('Delivery address must include a postal code')
  }
}

export async function validateDepositLocationExists(pool: ConnectionPool, locationId: string): Promise<void> {
  const r = await pool
    .request()
    .input('id', locationId)
    .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.deposit_locations WHERE id = @id`)
  if (Number(r.recordset[0]?.c ?? 0) === 0) {
    throw new Error('Selected pickup location is not available')
  }
}

type CartLineRow = Awaited<ReturnType<typeof getCartLines>>[number]

/**
 * Loads cart lines and validates: non-empty, active products, quantity bounds, stock (track policy).
 * Returns lines for order creation (price snapshots from cart).
 */
export async function validateCartAndReturnLines(
  executor: SqlExecutor,
  cartId: string,
): Promise<CartLineRow[]> {
  const lines = await getCartLines(executor, cartId)
  if (lines.length === 0) {
    throw new Error('Cart is empty')
  }

  const inactive = await executor
    .request()
    .input('cid', cartId)
    .query<{ variant_id: string }>(`
      SELECT CAST(cl.variant_id AS NVARCHAR(36)) AS variant_id
      FROM dbo.cart_lines cl
      INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE cl.cart_id = @cid AND p.is_active = 0
    `)
  if (inactive.recordset.length > 0) {
    throw new Error('Your cart contains a product that is no longer available. Remove it and try again.')
  }

  const minQ = env.cartLineMinQty
  const maxQ = env.cartLineMaxQty
  const pool = executor as unknown as ConnectionPool

  for (const l of lines) {
    if (l.quantity < minQ) {
      throw new Error(`Quantity must be at least ${minQ} for each line`)
    }
    if (l.quantity > maxQ) {
      throw new Error(`Quantity cannot exceed ${maxQ} per line`)
    }

    const pol = await getVariantInventoryPolicy(pool, l.variantId)
    if (pol === 'not_tracked' || pol === 'continue') {
      continue
    }
    const stock = await sumVariantStockAcrossWarehouses(pool, l.variantId)
    if (stock < l.quantity) {
      throw new Error(
        stock <= 0
          ? 'An item in your cart is out of stock'
          : `Only ${stock} units available for one or more items`,
      )
    }
  }

  return lines
}
