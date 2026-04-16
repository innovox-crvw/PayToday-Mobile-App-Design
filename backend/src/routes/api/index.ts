import { Router } from 'express'
import { sendCsrfToken, verifyCsrf } from '../../middleware/csrf.js'
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js'
import { env } from '../../config/env.js'
import { getLastSqlConnectError, getSqlPool } from '../../db/pool.js'
import { productsRouter } from './products.js'
import { authRouter } from './auth.js'
import { cartRouter } from './cart.js'
import { checkoutRouter } from './checkout.js'
import { addressesRouter } from './addresses.js'
import { adminProductsRouter } from './adminProducts.js'
import { depositRouter } from './deposit.js'
import { fulfillmentRouter } from './fulfillment.js'
import { ordersRouter } from './orders.js'
import { paymentReturnRouter } from './paymentReturn.js'
import { adminOrdersRouter } from './adminOrders.js'
import { adminInventoryRouter } from './adminInventory.js'
import { returnsRouter, adminReturnsRouter } from './returns.js'
import { storefrontPublicRouter } from './storefrontPublic.js'
import { notificationsRouter } from './notifications.js'
import { hubDemoPaymentRouter } from './hubDemoPayment.js'
import { walletRouter } from './wallet.js'

export const apiRouter = Router()

apiRouter.use(optionalAuth)

apiRouter.get('/health', async (_req, res) => {
  const body: {
    ok: true
    service: string
    database: 'off' | 'connected' | 'unreachable'
    databaseError?: string
    sqlHints?: string[]
  } = {
    ok: true,
    service: 'paytoday-store-api',
    database: 'off',
  }
  if (!env.sqlConnectionString?.trim()) {
    res.json(body)
    return
  }
  try {
    const pool = await getSqlPool({ eager: true })
    body.database = pool?.connected ? 'connected' : 'unreachable'
  } catch {
    body.database = 'unreachable'
  }
  if (body.database === 'unreachable' && env.nodeEnv === 'development') {
    const err = getLastSqlConnectError()
    if (err) body.databaseError = err
    body.sqlHints = [
      'Named instance (e.g. \\SQLEXPRESS): start the SQL Server Browser service on the SQL machine, or set SQL_SERVER_TCP=host,port in .env (port from SQL Server Configuration Manager → TCP/IP → IPAll).',
      'Connecting to another machine: Windows Integrated auth from Node often fails; set SQL_USER and SQL_PASSWORD in .env for SQL authentication.',
      'TLS: keep SQL_TRUST_SERVER_CERTIFICATE=true (or TrustServerCertificate=yes) for dev certificates.',
    ]
  }
  res.json(body)
})

apiRouter.get('/csrf', sendCsrfToken)

/** Public merchandising + shipping config (no CSRF). */
apiRouter.use('/', storefrontPublicRouter)

/** PayToday browser return — no CSRF (GET redirect). */
apiRouter.use('/payments', paymentReturnRouter)

apiRouter.use(verifyCsrf)

apiRouter.use('/auth', authRouter)
apiRouter.use('/notifications', notificationsRouter)
apiRouter.use('/wallet', walletRouter)
apiRouter.use('/hub', hubDemoPaymentRouter)
apiRouter.use('/products', productsRouter)
apiRouter.use('/cart', cartRouter)
apiRouter.use('/checkout', checkoutRouter)
apiRouter.use('/addresses', addressesRouter)
apiRouter.use('/admin/products', adminProductsRouter)
apiRouter.use('/deposit', depositRouter)
apiRouter.use('/fulfillment', fulfillmentRouter)
apiRouter.use('/orders', ordersRouter)
apiRouter.use('/returns', returnsRouter)
apiRouter.use('/admin/orders', adminOrdersRouter)
apiRouter.use('/admin/returns', adminReturnsRouter)
apiRouter.use('/admin/inventory', adminInventoryRouter)

apiRouter.get('/admin/ping', requireAuth, requireRole('admin', 'ops', 'fulfillment'), (_req, res) => {
  res.json({ ok: true })
})

/** Unknown `/api/*` — JSON only; never fall through to the SPA static stack. */
apiRouter.use((_req, res) => {
  res.status(404).type('application/json').json({
    error: 'NOT_FOUND',
    message: 'No handler for this API path.',
  })
})
