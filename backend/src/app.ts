import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import { env } from './config/env.js'
import { apiRouter } from './routes/api/index.js'
import { paytodayWebhookRouter } from './routes/webhooks/paytoday.js'
import { gatewaySeparateApiLayer } from './middleware/frontBackendSeparation.js'

export function createApp(): express.Express {
  const app = express()

  if (env.trustProxy) {
    app.set('trust proxy', 1)
  }

  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  )
  app.use(cookieParser())

  /* Defense-in-depth: even though the API binds to loopback and Nginx only proxies /api/*,
   * any non-/api request that reaches Express returns a JSON 404 instead of leaking handler
   * names or HTML error pages. The SPA is served by Nginx from frontend/dist; this process
   * never serves static HTML/JS/CSS. */
  app.use(gatewaySeparateApiLayer())

  app.use(
    '/api/webhooks/paytoday',
    express.raw({ type: '*/*', limit: '2mb' }),
    paytodayWebhookRouter,
  )

  /** Alias: same handler as /api/webhooks/paytoday (raw body + HMAC). */
  app.use(
    '/api/payments/webhook',
    express.raw({ type: '*/*', limit: '2mb' }),
    paytodayWebhookRouter,
  )

  app.use(express.json({ limit: '1mb' }))

  try {
    fs.mkdirSync(env.productImageUploadDir, { recursive: true })
  } catch {
    /* ignore — upload route will retry mkdir */
  }
  app.use(
    '/api/uploads/products',
    express.static(env.productImageUploadDir, { index: false, maxAge: '1d', fallthrough: false }),
  )

  app.use('/api', apiRouter)

  return app
}
