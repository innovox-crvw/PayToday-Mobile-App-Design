/**
 * Wipe all products (optional) and import catalog-100-products.csv.
 *
 *   npm run db:migrate
 *   npm run db:generate-catalog-csv
 *   npm run db:reset-catalog -- --wipe
 *
 * Flags:
 *   --wipe     Run wipe-catalog-keep-users.sql before import
 *   --file=    Custom CSV path (default: backend/data/seed/catalog-100-products.csv)
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import { applyProductBulkCsvImport } from '../src/services/productBulkCsvImport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function argValue(prefix: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`))
  return hit ? hit.slice(prefix.length + 1).trim() : null
}

async function runWipe(pool: Awaited<ReturnType<typeof connectMssql>>): Promise<void> {
  const wipePath = path.join(__dirname, 'wipe-catalog-keep-users.sql')
  const sql = await readFile(wipePath, 'utf8')
  console.log('Running wipe-catalog-keep-users.sql…')
  await pool.request().query(sql)
  console.log('Catalogue wiped (products and dependent rows).')
}

async function main(): Promise<void> {
  const wipe = process.argv.includes('--wipe')
  const fileArg = argValue('--file')
  const defaultCsv = path.join(__dirname, '..', 'data', 'seed', 'catalog-100-products.csv')
  const csvPath = fileArg ? path.resolve(fileArg) : defaultCsv

  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env at the repo root, then retry.')
    process.exit(1)
  }

  let csv: string
  try {
    csv = await readFile(csvPath, 'utf8')
  } catch {
    console.error(`CSV not found: ${csvPath}`)
    console.error('Run: npm run db:generate-catalog-csv')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    if (wipe) await runWipe(pool)
    const result = await applyProductBulkCsvImport(pool, csv)
    if (!result.ok) {
      console.error('Import failed:')
      for (const e of result.rowErrors) {
        console.error(`  line ${e.line} sku=${e.sku}: ${e.message}`)
      }
      process.exit(1)
    }
    console.log(`Imported ${result.applied} products from ${csvPath}`)
  } finally {
    await pool.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
