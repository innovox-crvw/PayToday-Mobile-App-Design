/**
 * Step through checkout SQL to find nested-aggregate failures.
 * Run: npm run db:smoke-checkout
 */
import { getSqlPool } from '../src/db/pool.js'
import { formatSqlDriverError } from '../src/db/sqlDriverError.js'
import { getCartLines } from '../src/services/cartService.js'
import { assertCheckoutAllowedByMerchantHours } from '../src/services/merchantHoursService.js'
import { createOrderFromCart } from '../src/services/orderService.js'
import { validateCartAndReturnLines } from '../src/services/checkoutValidation.js'

async function step(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn()
    console.log(`OK  ${label}`)
    return true
  } catch (e) {
    console.error(`FAIL ${label}`)
    console.error('     ', formatSqlDriverError(e))
    return false
  }
}

async function main(): Promise<void> {
  const pool = await getSqlPool()
  if (!pool) {
    console.error('No SQL pool')
    process.exit(1)
  }

  const objs = await pool.request().query(`
    SELECT OBJECT_NAME(c.object_id) AS table_name, c.name AS column_name, cc.definition
    FROM sys.computed_columns cc
    INNER JOIN sys.columns c ON c.object_id = cc.object_id AND c.column_id = cc.column_id
    WHERE OBJECT_NAME(c.object_id) IN (
      N'orders', N'order_lines', N'inventory_quantity', N'inventory_reservations',
      N'stock_movements', N'carts', N'cart_lines', N'payments', N'users'
    )
    ORDER BY table_name, column_name
  `)
  console.log('\n--- computed columns on checkout tables ---')
  console.table(objs.recordset)

  const tr = await pool.request().query(`
    SELECT OBJECT_NAME(t.parent_id) AS on_table, t.name AS trigger_name
    FROM sys.triggers t
    WHERE OBJECT_NAME(t.parent_id) IN (
      N'orders', N'order_lines', N'inventory_quantity', N'inventory_reservations',
      N'stock_movements', N'carts', N'cart_lines', N'payments'
    )
  `)
  console.log('\n--- triggers on checkout tables ---')
  console.table(tr.recordset)

  const cart = await pool.request().query<{ id: string }>(`
    SELECT TOP 1 CAST(c.id AS NVARCHAR(36)) AS id
    FROM dbo.carts c
    INNER JOIN dbo.cart_lines cl ON cl.cart_id = c.id
    ORDER BY c.updated_at DESC
  `)
  const cartId = cart.recordset[0]?.id
  if (!cartId) {
    console.warn('No cart with lines — add items to cart first')
    process.exit(0)
  }
  console.log('\nUsing cart', cartId)

  await step('getCartLines', async () => {
    const lines = await getCartLines(pool, cartId)
    if (!lines.length) throw new Error('empty')
  })

  await step('assertCheckoutAllowedByMerchantHours', async () => {
    await assertCheckoutAllowedByMerchantHours(pool, cartId, {
      deliveryMethod: 'store_pickup',
      scheduling: {
        deliveryScheduledFor: null,
        homeDeliveryWindowStart: null,
        homeDeliveryWindowEnd: null,
        homeDeliveryWindowLabel: null,
      },
    })
  })

  const lines = await getCartLines(pool, cartId)
  let subtotal = 0
  for (const l of lines) subtotal += l.unitPriceCents * l.quantity

  await step('validateCartAndReturnLines (in tx)', async () => {
    const tx = pool.transaction()
    await tx.begin()
    try {
      await validateCartAndReturnLines(tx, cartId)
      await tx.rollback()
    } catch (e) {
      await tx.rollback()
      throw e
    }
  })

  await step('INSERT dbo.orders (rolled back)', async () => {
    const tx = pool.transaction()
    await tx.begin()
    try {
      await tx
        .request()
        .input('sub', subtotal)
        .input('total', subtotal)
        .query(`
          INSERT INTO dbo.orders (
            user_id, guest_email, status, delivery_method,
            subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents, currency
          )
          VALUES (NULL, N'smoke@test.local', N'pending_payment', N'store_pickup',
            @sub, 0, 0, 0, @total, N'NAD')
        `)
    } finally {
      await tx.rollback()
    }
  })

  const cart2 = await pool.request().query<{ id: string }>(`
    SELECT TOP 1 CAST(c.id AS NVARCHAR(36)) AS id
    FROM dbo.carts c INNER JOIN dbo.cart_lines cl ON cl.cart_id = c.id
    ORDER BY c.updated_at DESC
  `)
  const cartId2 = cart2.recordset[0]?.id
  if (cartId2) {
    await step('createOrderFromCart on disposable cart (consumes cart)', async () => {
      const lines2 = await getCartLines(pool, cartId2)
      let sub2 = 0
      for (const l of lines2) sub2 += l.unitPriceCents * l.quantity
      await createOrderFromCart(pool, cartId2, {
        userId: undefined,
        guestEmail: 'smoke@test.local',
        deliveryMethod: 'store_pickup',
        shippingAddressId: null,
        depositLocationId: null,
        subtotalCents: sub2,
        shippingCents: 0,
        taxCents: 0,
        checkoutIdempotencyKey: `smoke-${Date.now()}`,
      })
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
