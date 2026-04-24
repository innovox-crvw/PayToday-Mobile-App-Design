/**
 * Dev reset: runs backend/scripts/paytoday-full-setup.sql against SQL Server (schema + seed users/products).
 * Connects with Database=master so CREATE DATABASE / USE [paytoday] batches work.
 *
 * Requires SQL_CONNECTION_STRING in .env (repo root). Same driver rules as the API (Windows integrated or SQL auth).
 *
 * Usage: npm run db:bootstrap
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../src/config/env.js'
import { parseSqlConnection } from '../src/db/connectionString.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function splitSqlBatches(sql: string): string[] {
  return sql
    .split(/\r?\n\s*GO\s*\r?\n/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function main(): Promise<void> {
  if (!env.sqlConnectionString) {
    console.error('Set SQL_CONNECTION_STRING in .env (see .env.example).')
    process.exit(1)
  }

  const setupPath = path.join(__dirname, 'paytoday-full-setup.sql')
  const body = await readFile(setupPath, 'utf8')
  const batches = splitSqlBatches(body)
  if (batches.length === 0) {
    console.error(`No SQL batches found in ${setupPath}`)
    process.exit(1)
  }

  const { masterConnectionString } = parseSqlConnection(env.sqlConnectionString)
  console.log(`Applying ${batches.length} batch(es) from paytoday-full-setup.sql (dev reset)…`)

  const pool = await connectMssql(masterConnectionString)
  try {
    for (let i = 0; i < batches.length; i += 1) {
      const n = i + 1
      process.stdout.write(`  batch ${n}/${batches.length}… `)
      await pool.request().query(batches[i]!)
      console.log('ok')
    }
  } finally {
    await pool.close()
  }

  console.log('Bootstrap complete. Run npm run db:migrate for any migrations newer than this script snapshot.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
