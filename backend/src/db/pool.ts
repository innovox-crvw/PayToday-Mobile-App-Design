import sql from 'mssql'
import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import { connectMssql } from './mssqlConnectConfig.js'
import { formatSqlDriverError } from './sqlDriverError.js'

let pool: ConnectionPool | null = null
let lastConnectFailLog = 0
/** Last driver error when opening SQL (for /api/health and API responses in dev). */
let lastSqlConnectError: string | null = null

export function getLastSqlConnectError(): string | null {
  return lastSqlConnectError
}
/** After a failed connect, skip new attempts until this time (reduces latency per request while SQL is down). */
let reconnectNotBefore = 0

export type GetSqlPoolOptions = {
  /** When true, attempt a fresh TCP connect even during the short post-failure backoff (store/cart/checkout). */
  eager?: boolean
}

/**
 * Returns a connected pool, or `null` if SQL is not configured or connection failed.
 * Failed connections do not throw — callers fall back to in-memory behaviour where supported.
 */
export async function getSqlPool(opts?: GetSqlPoolOptions): Promise<ConnectionPool | null> {
  if (!env.sqlConnectionString?.trim()) {
    return null
  }

  if (pool?.connected) {
    return pool
  }

  if (pool && !pool.connected) {
    try {
      await pool.close()
    } catch {
      /* ignore */
    }
    pool = null
  }

  if (Date.now() < reconnectNotBefore && !opts?.eager) {
    return null
  }

  try {
    pool = await connectMssql(env.sqlConnectionString)
    /* Avoid leaving DML uncommitted when IMPLICIT_TRANSACTIONS is ON for the login. */
    await pool.request().query(`SET IMPLICIT_TRANSACTIONS OFF;`)
    reconnectNotBefore = 0
    lastSqlConnectError = null
    return pool
  } catch (err) {
    reconnectNotBefore = Date.now() + 1500
    try {
      await sql.close()
    } catch {
      /* ignore */
    }
    try {
      const v8 = await import('mssql/msnodesqlv8')
      await v8.default.close()
    } catch {
      /* ignore */
    }
    pool = null
    const now = Date.now()
    const errMsg = formatSqlDriverError(err)
    lastSqlConnectError = errMsg
    if (now - lastConnectFailLog > 20_000) {
      lastConnectFailLog = now
      console.warn(
        '[sql] Cannot reach MS SQL — using in-memory catalogue and memory cart until the server is available:',
        errMsg,
      )
    }
    return null
  }
}

export async function closeSqlPool(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
  }
  try {
    await sql.close()
  } catch {
    /* ignore */
  }
  try {
    const v8 = await import('mssql/msnodesqlv8')
    await v8.default.close()
  } catch {
    /* ignore */
  }
}
