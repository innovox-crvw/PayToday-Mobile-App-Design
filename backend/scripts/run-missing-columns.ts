/**
 * Runs backend/scripts/paytoday-add-missing-columns.sql batch-by-batch (GO split),
 * same way as npm run db:migrate. Replaces the first USE […] with your connection string database.
 *
 * Usage: SQL_CONNECTION_STRING="..." npx tsx backend/scripts/run-missing-columns.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDotenvFiles } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function splitSqlBatches(sql: string): string[] {
  return sql
    .split(/\r?\n\s*GO\s*\r?\n/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function initialCatalogFromConnectionString(cs: string): string | null {
  const m = cs.match(/(?:Initial Catalog|Database)\s*=\s*([^;]+)/i)
  const v = m?.[1]?.trim()
  return v && v.length > 0 ? v : null
}

function rewriteFirstUseDatabase(batches: string[], db: string): string[] {
  if (batches.length === 0) return batches
  const esc = db.replace(/]/g, ']]')
  const first = batches[0].replace(/^\s*USE\s+\[[^\]]+\]\s*;?/iu, `USE [${esc}];`)
  return [first, ...batches.slice(1)]
}

async function main(): Promise<void> {
  loadDotenvFiles()
  const cs = process.env.SQL_CONNECTION_STRING?.trim()
  if (!cs) {
    console.error('Set SQL_CONNECTION_STRING in .env (or env) first.')
    process.exit(1)
  }

  const sqlPath = path.join(__dirname, 'paytoday-add-missing-columns.sql')
  const body = readFileSync(sqlPath, 'utf8')
  let batches = splitSqlBatches(body)
  const db = initialCatalogFromConnectionString(cs)
  if (db) {
    batches = rewriteFirstUseDatabase(batches, db)
    console.log(`Database context: [${db}] (from connection string)`)
  } else {
    console.warn('Could not parse Initial Catalog / Database from SQL_CONNECTION_STRING — script USE line unchanged.')
  }

  const pool = await connectMssql(cs)
  try {
    for (let i = 0; i < batches.length; i += 1) {
      const b = batches[i]
      const preview = b.replace(/\s+/g, ' ').slice(0, 72)
      console.log(`apply batch ${i + 1}/${batches.length}: ${preview}…`)
      await pool.request().query(b)
    }
    console.log('paytoday-add-missing-columns.sql completed successfully.')
  } finally {
    await pool.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
