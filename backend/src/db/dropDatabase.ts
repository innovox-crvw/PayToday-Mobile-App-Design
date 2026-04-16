/**
 * Drop the application database named in SQL_CONNECTION_STRING (connects via master).
 * Usage: npm run db:drop
 *
 * If you use Docker for SQL, remove the data volume with your compose stack (e.g. docker compose down -v).
 */
import { env } from '../config/env.js'
import { parseSqlConnection } from './connectionString.js'
import { connectMssql } from './mssqlConnectConfig.js'

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
  if (databaseName.toLowerCase() === 'master' || databaseName.toLowerCase() === 'model' || databaseName.toLowerCase() === 'msdb') {
    console.error('Refusing to drop a system database.')
    process.exit(1)
  }

  const pool = await connectMssql(masterConnectionString)
  try {
    /* Same ODBC batch-splitting issue as ensureDatabase — avoid DECLARE across statements. */
    const bracketed = `[${databaseName}]`
    await pool.request().query(`
      IF DB_ID(N'${databaseName}') IS NOT NULL
      BEGIN
        EXEC(N'ALTER DATABASE ${bracketed} SET SINGLE_USER WITH ROLLBACK IMMEDIATE');
        EXEC(N'DROP DATABASE ${bracketed}');
      END
    `)
    console.log(`Database "${databaseName}" dropped (if it existed).`)
  } finally {
    await pool.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
