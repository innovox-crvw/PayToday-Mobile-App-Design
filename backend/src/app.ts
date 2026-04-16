import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import path from 'node:path'
import { env } from './config/env.js'
import { apiRouter } from './routes/api/index.js'
import { paytodayWebhookRouter } from './routes/webhooks/paytoday.js'
import { gatewaySeparateApiLayer, spaHistoryFallback, spaStaticAssets } from './middleware/frontBackendSeparation.js'

function resolveSpaDist(raw: string | undefined): string | undefined {
  const s = raw?.trim()
  if (!s) return undefined
  return path.isAbsolute(s) ? s : path.resolve(process.cwd(), s)
}

export function createApp(): express.Express {
  const app = express()

  const spaDist = resolveSpaDist(env.spaStaticRoot)

  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  )
  app.use(cookieParser())

  app.use(gatewaySeparateApiLayer({ spaDistAbsolute: spaDist }))

  app.use(
    '/api/webhooks/paytoday',
    express.raw({ type: '*/*', limit: '2mb' }),
    paytodayWebhookRouter,
  )

  app.use(express.json({ limit: '1mb' }))

  app.use('/api', apiRouter)

  if (spaDist && fs.existsSync(path.join(spaDist, 'index.html'))) {
    app.use(spaStaticAssets(spaDist))
    app.use(spaHistoryFallback(spaDist))
  }

  return app
}
