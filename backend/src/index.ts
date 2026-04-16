import { env } from './config/env.js'
import { createApp } from './app.js'
import { getLastSqlConnectError, getSqlPool } from './db/pool.js'
import { startNotificationWorker } from './services/notificationWorker.js'

const app = createApp()

app.listen(env.port, async () => {
  console.log(`PayToday Store API listening on http://localhost:${env.port}`)
  if (!env.sqlConnectionString?.trim()) {
    console.log('Database: off (in-memory catalogue only). Set SQL_CONNECTION_STRING in .env for MS SQL.')
    return
  }
  const pool = await getSqlPool({ eager: true })
  if (pool?.connected) {
    console.log('Database: MS SQL connected.')
  } else {
    console.log('Database: MS SQL not reachable — in-memory catalogue + memory cart until SQL is available on your connection string.')
    const err = getLastSqlConnectError()
    if (err) console.log('  Last SQL error:', err)
    console.log(`  Diagnostics: http://localhost:${env.port}/api/health (see databaseError + sqlHints in development).`)
    console.log('Checkout will return 503 until SQL accepts connections (set SQL_CONNECTION_STRING in .env, then npm run db:setup).')
  }
  /* Drain notification_outbox whenever SQL is configured — ticks no-op until getSqlPool() connects. */
  if (env.sqlConnectionString?.trim()) {
    startNotificationWorker(getSqlPool)
    console.log('Notification worker: started (30s interval; requires pool for each tick).')
  }
})
