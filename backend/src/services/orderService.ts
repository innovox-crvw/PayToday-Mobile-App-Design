import type { ConnectionPool, Transaction } from 'mssql'
import { getCartLines } from './cartService.js'

export async function createOrderFromCart(
  pool: ConnectionPool,
  cartId: string,
  input: {
    userId: string | undefined
    guestEmail: string | null
    deliveryMethod: 'home' | 'deposit_box'
    shippingAddressId: string | null
    depositLocationId: string | null
    subtotalCents: number
    shippingCents: number
    taxCents: number
    checkoutIdempotencyKey: string | null
  },
): Promise<{ orderId: string; totalCents: number; currency: string }> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const lines = await getCartLines(transaction, cartId)
    if (lines.length === 0) {
      throw new Error('Cart is empty')
    }

    let computedSubtotal = 0
    let currency = lines[0]?.currency ?? 'NAD'
    for (const l of lines) {
      computedSubtotal += l.unitPriceCents * l.quantity
      currency = l.currency
    }

    if (computedSubtotal !== input.subtotalCents) {
      throw new Error('Cart total changed — refresh and try again')
    }

    const wh = await transaction
      .request()
      .query<{ id: string }>(`SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`)
    const warehouseId = wh.recordset[0]?.id

    if (warehouseId) {
      for (const l of lines) {
        const inv = await transaction
          .request()
          .input('vid', l.variantId)
          .input('wid', warehouseId)
          .query<{ quantity: number }>(
            `SELECT quantity FROM dbo.inventory_quantity WHERE variant_id = @vid AND warehouse_id = @wid`,
          )
        const q = inv.recordset[0]?.quantity ?? 0
        if (q < l.quantity) {
          throw new Error('Insufficient stock for one or more items')
        }
      }
    }

    const totalCents = input.subtotalCents + input.shippingCents + input.taxCents

    const o = await transaction
      .request()
      .input('userId', input.userId ?? null)
      .input('guestEmail', input.guestEmail)
      .input('deliveryMethod', input.deliveryMethod)
      .input('shippingAddressId', input.shippingAddressId)
      .input('depositLocationId', input.depositLocationId)
      .input('subtotal', input.subtotalCents)
      .input('shipping', input.shippingCents)
      .input('tax', input.taxCents)
      .input('total', totalCents)
      .input('currency', currency)
      .input('idem', input.checkoutIdempotencyKey)
      .query<{ id: string }>(`
      INSERT INTO dbo.orders (
        user_id, guest_email, status, delivery_method, shipping_address_id, deposit_location_id,
        subtotal_cents, shipping_cents, tax_cents, total_cents, currency, checkout_idempotency_key
      )
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (
        @userId, @guestEmail, N'pending_payment', @deliveryMethod, @shippingAddressId, @depositLocationId,
        @subtotal, @shipping, @tax, @total, @currency, @idem
      )
    `)
    const orderId = o.recordset[0].id

    for (const l of lines) {
      await transaction
        .request()
        .input('orderId', orderId)
        .input('variantId', l.variantId)
        .input('qty', l.quantity)
        .input('unit', l.unitPriceCents)
        .query(`
        INSERT INTO dbo.order_lines (order_id, variant_id, quantity, unit_price_cents)
        VALUES (@orderId, @variantId, @qty, @unit)
      `)
    }

    if (warehouseId) {
      for (const l of lines) {
        const upd = transaction.request()
        upd.input('vid', l.variantId)
        upd.input('wid', warehouseId)
        upd.input('qty', l.quantity)
        upd.input('oid', orderId)
        const dec = await upd.query(`
        UPDATE dbo.inventory_quantity
        SET quantity = quantity - @qty
        WHERE variant_id = @vid AND warehouse_id = @wid AND quantity >= @qty
      `)
        if ((dec.rowsAffected[0] ?? 0) === 0) {
          throw new Error('Insufficient stock while reserving inventory')
        }
        await transaction
          .request()
          .input('oid', orderId)
          .input('vid', l.variantId)
          .input('wid', warehouseId)
          .input('qty', l.quantity)
          .query(`
          INSERT INTO dbo.inventory_reservations (order_id, variant_id, warehouse_id, quantity)
          VALUES (@oid, @vid, @wid, @qty)
        `)
        await transaction
          .request()
          .input('vid', l.variantId)
          .input('wid', warehouseId)
          .input('delta', -l.quantity)
          .input('oid', orderId)
          .query(`
          INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
          VALUES (@vid, @wid, @delta, N'order_reserved', N'order', @oid)
        `)
      }
    }

    await transaction.request().input('cartId', cartId).query(`DELETE FROM dbo.cart_lines WHERE cart_id = @cartId`)
    await transaction.request().input('cartId', cartId).query(`DELETE FROM dbo.carts WHERE id = @cartId`)

    await transaction
      .request()
      .input('orderId', orderId)
      .query(`
      INSERT INTO dbo.fulfillment_tasks (order_id, stage) VALUES (@orderId, N'pending')
    `)

    await transaction.commit()
    return { orderId, totalCents, currency }
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

async function restoreReservedLinesInTransaction(
  transaction: Transaction,
  orderId: string,
): Promise<void> {
  const rows = await transaction
    .request()
    .input('oid', orderId)
    .query<{ variant_id: string; warehouse_id: string; quantity: number }>(`
        SELECT CAST(variant_id AS NVARCHAR(36)) AS variant_id,
               CAST(warehouse_id AS NVARCHAR(36)) AS warehouse_id,
               quantity
        FROM dbo.inventory_reservations
        WHERE order_id = @oid
      `)

  for (const row of rows.recordset) {
    await transaction
      .request()
      .input('vid', row.variant_id)
      .input('wid', row.warehouse_id)
      .input('qty', row.quantity)
      .query(`
        UPDATE dbo.inventory_quantity
        SET quantity = quantity + @qty
        WHERE variant_id = @vid AND warehouse_id = @wid
      `)
    await transaction
      .request()
      .input('vid', row.variant_id)
      .input('wid', row.warehouse_id)
      .input('qty', row.quantity)
      .input('oid', orderId)
      .query(`
        INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
        VALUES (@vid, @wid, @qty, N'order_reserve_released', N'order', @oid)
      `)
  }

  await transaction.request().input('oid', orderId).query(`DELETE FROM dbo.inventory_reservations WHERE order_id = @oid`)
}

/** Standalone release (e.g. tooling); prefer {@link cancelUnshippedOrderAdmin} for admin cancel. */
export async function releaseCheckoutInventoryForOrder(pool: ConnectionPool, orderId: string): Promise<void> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    await restoreReservedLinesInTransaction(transaction, orderId)
    await transaction.commit()
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

/**
 * Cancel an order that is not yet shipped/delivered: restores checkout-reserved stock when still pending_payment.
 */
export async function cancelUnshippedOrderAdmin(pool: ConnectionPool, orderId: string): Promise<void> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const cur = await transaction
      .request()
      .input('oid', orderId)
      .query<{ status: string }>(`SELECT status FROM dbo.orders WITH (UPDLOCK, ROWLOCK) WHERE id = @oid`)
    const st = cur.recordset[0]?.status
    if (!st) {
      throw new Error('Order not found')
    }
    if (st === 'shipped' || st === 'delivered' || st === 'cancelled') {
      throw new Error('Cannot cancel this order')
    }
    if (st === 'pending_payment') {
      await restoreReservedLinesInTransaction(transaction, orderId)
    }
    await transaction
      .request()
      .input('oid', orderId)
      .query(
        `UPDATE dbo.orders SET status = N'cancelled', cancelled_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @oid`,
      )
    await transaction.commit()
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

async function reservationLineCount(transaction: Transaction, orderId: string): Promise<number> {
  const r = await transaction
    .request()
    .input('oid', orderId)
    .query<{ c: number }>(
      `SELECT COUNT_BIG(1) AS c FROM dbo.inventory_reservations WHERE order_id = @oid AND variant_id IS NOT NULL`,
    )
  return Number(r.recordset[0]?.c ?? 0)
}

/**
 * Confirms payment: clears reservation metadata. Inventory was already decremented at checkout.
 * Legacy orders (no reservation rows) still deduct inventory here.
 */
export async function markOrderPaid(pool: ConnectionPool, orderId: string): Promise<void> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const reqLock = transaction.request()
    reqLock.input('oid', orderId)
    const statusRow = await reqLock.query<{ status: string }>(
      `SELECT status FROM dbo.orders WITH (UPDLOCK, ROWLOCK) WHERE id = @oid`,
    )
    const status = statusRow.recordset[0]?.status
    if (!status) {
      throw new Error('Order not found')
    }
    if (status === 'paid' || status === 'shipped' || status === 'delivered') {
      await transaction.commit()
      return
    }
    if (status !== 'pending_payment' && status !== 'draft') {
      throw new Error(`Order cannot be paid from status ${status}`)
    }

    const wh = await transaction.request().query<{ id: string }>(
      `SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.warehouses ORDER BY code`,
    )
    const warehouseId = wh.recordset[0]?.id
    if (!warehouseId) {
      throw new Error('No warehouse configured')
    }

    const reservedCount = await reservationLineCount(transaction, orderId)

    if (reservedCount > 0) {
      await transaction.request().input('oid', orderId).query(`DELETE FROM dbo.inventory_reservations WHERE order_id = @oid`)
    } else {
      const lines = await transaction
        .request()
        .input('oid', orderId)
        .query<{ variant_id: string; quantity: number }>(`
        SELECT CAST(variant_id AS NVARCHAR(36)) AS variant_id, quantity FROM dbo.order_lines WHERE order_id = @oid
      `)

      for (const line of lines.recordset) {
        const upd = transaction.request()
        upd.input('vid', line.variant_id)
        upd.input('wid', warehouseId)
        upd.input('qty', line.quantity)
        upd.input('oid', orderId)
        const result = await upd.query(`
        UPDATE dbo.inventory_quantity
        SET quantity = quantity - @qty
        WHERE variant_id = @vid AND warehouse_id = @wid AND quantity >= @qty
      `)
        const affected = result.rowsAffected[0] ?? 0
        if (affected === 0) {
          throw new Error('Insufficient stock at payment capture')
        }
        await transaction
          .request()
          .input('vid', line.variant_id)
          .input('wid', warehouseId)
          .input('delta', -line.quantity)
          .input('oid', orderId)
          .query(`
          INSERT INTO dbo.stock_movements (variant_id, warehouse_id, delta_qty, reason, reference_type, reference_id)
          VALUES (@vid, @wid, @delta, N'sale', N'order', @oid)
        `)
      }
    }

    await transaction
      .request()
      .input('oid', orderId)
      .query(`UPDATE dbo.orders SET status = N'paid', updated_at = SYSUTCDATETIME() WHERE id = @oid`)

    await transaction
      .request()
      .input('oid', orderId)
      .query(`UPDATE dbo.fulfillment_tasks SET stage = N'pending', updated_at = SYSUTCDATETIME() WHERE order_id = @oid`)

    await transaction.commit()
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}
