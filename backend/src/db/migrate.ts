/**
 * Run pending SQL migrations against MS SQL Server.
 * Usage: SQL_CONNECTION_STRING="..." npx tsx backend/src/db/migrate.ts
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../config/env.js'
import { connectMssql } from './mssqlConnectConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(__dirname, '../../migrations')

/** SSMS-style batch separator — required after DDL before statements that reference new columns. */
function splitSqlBatches(sql: string): string[] {
  return sql
    .split(/\r?\n\s*GO\s*\r?\n/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const BOOTSTRAP = `
IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.schema_migrations (
    version NVARCHAR(64) NOT NULL PRIMARY KEY,
    applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
`

async function main(): Promise<void> {
  if (!env.sqlConnectionString) {
    console.error('Set SQL_CONNECTION_STRING to run migrations.')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    await pool.request().query(BOOTSTRAP)

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const version = file.replace(/\.sql$/u, '')
      const check = await pool.request().input('v', version).query(`SELECT 1 AS ok FROM dbo.schema_migrations WHERE version = @v`)
      if (check.recordset.length > 0) {
        console.log(`skip ${file}`)
        continue
      }

      const fullPath = path.join(migrationsDir, file)
      const body = await readFile(fullPath, 'utf8')
      console.log(`apply ${file}`)
      const batches = splitSqlBatches(body)
      for (let i = 0; i < batches.length; i += 1) {
        await pool.request().query(batches[i])
      }
      await pool.request().input('v', version).query(`INSERT INTO dbo.schema_migrations (version) VALUES (@v)`)
    }

    console.log('Migrations complete.')
  } finally {
    await pool.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
