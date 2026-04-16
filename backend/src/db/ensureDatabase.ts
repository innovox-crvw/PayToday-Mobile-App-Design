/**
 * Create the application database on the server if it does not exist (connects via master).
 * Uses the same SQL_CONNECTION_STRING as the app; Database= value is the DB to create.
 *
 * Usage: npm run db:prepare
 */
import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import { parseSqlConnection } from './connectionString.js'
import { connectMssql } from './mssqlConnectConfig.js'

async function connectWithRetry(connectionString: string, label: string): Promise<ConnectionPool> {
  const attempts = 30
  const delayMs = 2000
  let last: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      const pool = await connectMssql(connectionString)
      if (i > 0) console.log(`${label}: connected after ${i + 1} attempt(s).`)
      return pool
    } catch (e) {
      last = e
      if (i < attempts - 1) {
        console.log(`${label}: waiting for SQL Server (${i + 1}/${attempts})…`)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  const err = last instanceof Error ? last.message : String(last)
  if (err.includes('1433') || err.includes('ESOCKET')) {
    console.error(
      '\nTip: SQL Express uses a dynamic port. Either start the Windows service "SQL Server Browser",\n' +
        'or run: npm run db:tcp-port   (then set SQL_SERVER_TCP=127.0.0.1,<port> in .env)\n' +
        'Also enable TCP/IP: SQL Server Configuration Manager -> Protocols for SQLEXPRESS -> TCP/IP -> Enabled.\n',
    )
  }
  throw last
}

async function main(): Promise<void> {
  if (!env.sqlConnectionString) {
    console.error('Set SQL_CONNECTION_STRING in .env (see .env.example).')
    process.exit(1)
  }

  const { masterConnectionString, databaseName } = parseSqlConnection(env.sqlConnectionString)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
    console.error(`Refusing unsafe database name: ${databaseName}`)
    process.exit(1)
  }

  const pool = await connectWithRetry(masterConnectionString, 'SQL Server')
  try {
    /* ODBC/msnodesqlv8 may split on `;`, breaking DECLARE + IF batches — use one statement.
     * `databaseName` is validated above (alphanumeric + underscore only). */
    const bracketed = `[${databaseName}]`
    await pool.request().query(`
      IF DB_ID(N'${databaseName}') IS NULL
        CREATE DATABASE ${bracketed}
    `)
    console.log(`Database "${databaseName}" is ready.`)
  } finally {
    await pool.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
