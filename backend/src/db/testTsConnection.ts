/**
 * TypeScript SQL connectivity check — same path as the API (`connectMssql` + `.env`).
 * Run: npm run db:test-ts
 *
 * Windows integrated auth (`Trusted_Connection=yes`) uses `mssql/msnodesqlv8` (not Tedious).
 */
import { env } from '../config/env.js'
import {
  connectMssql,
  connectionUsesWindowsIntegrated,
  toMsnodesqlv8PoolConfig,
  toMssqlConnectArg,
} from './mssqlConnectConfig.js'
import { formatSqlDriverError } from './sqlDriverError.js'

function redactConfig(c: unknown): string {
  const s = JSON.stringify(c, (_k, v) => (typeof v === 'string' && /pwd|password/i.test(_k) ? '***' : v))
  return s ?? String(c)
}

async function main(): Promise<void> {
  if (!env.sqlConnectionString) {
    console.error('Set SQL_CONNECTION_STRING or SQL_SERVER (+ SQL_DATABASE) in .env (repo root).')
    process.exit(1)
  }

  const arg = connectionUsesWindowsIntegrated(env.sqlConnectionString)
    ? toMsnodesqlv8PoolConfig(env.sqlConnectionString)
    : toMssqlConnectArg(env.sqlConnectionString)
  console.log('Resolved driver config:', redactConfig(arg))

  try {
    const pool = await connectMssql(env.sqlConnectionString)
    try {
      const r = await pool.request().query(`SELECT DB_NAME() AS database_name, SUSER_SNAME() AS login_name`)
      const row = r.recordset[0] as { database_name: string; login_name: string }
      console.log('Connected.')
      console.log('  Current database:', row.database_name)
      console.log('  Login:', row.login_name)
    } finally {
      await pool.close()
    }
  } catch (e) {
    const msg = formatSqlDriverError(e)
    console.error('Connection failed:', msg)
    process.exit(1)
  }
}

main()
