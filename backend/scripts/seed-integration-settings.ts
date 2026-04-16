/**
 * Upsert dbo.integration_settings from a JSON file (env overrides for Keycloak, PayToday, notify, etc.).
 *
 * Usage:
 *   1) Copy backend/scripts/integration-settings.seed.example.json → backend/scripts/integration-settings.seed.json
 *   2) Fill in non-empty values (omit keys you don't need, or use "")
 *   3) npm run db:seed-integration
 *
 * Requires: SQL_CONNECTION_STRING in .env and migration 009 applied (npm run db:migrate).
 */
import { readFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import { sqlErrorMentionsMissingObject } from '../src/db/sqlDriverError.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const seedPath = path.join(__dirname, 'integration-settings.seed.json')
const examplePath = path.join(__dirname, 'integration-settings.seed.example.json')

function stringifyValue(val: unknown): string | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number' && Number.isFinite(val)) return String(val)
  if (typeof val === 'string') {
    const t = val.trim()
    return t === '' ? null : t
  }
  return JSON.stringify(val)
}

async function main(): Promise<void> {
  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env (repo root), then retry.')
    process.exit(1)
  }

  let raw: string
  try {
    raw = await readFile(seedPath, 'utf8')
  } catch {
    console.error(`Missing ${seedPath}`)
    console.error(`Copy the example file and edit:`)
    console.error(`  copy backend\\scripts\\integration-settings.seed.example.json backend\\scripts\\integration-settings.seed.json`)
    console.error(`(PowerShell: Copy-Item ... )`)
    try {
      await copyFile(examplePath, seedPath)
      console.error(`\nCreated integration-settings.seed.json from the example — edit it, then run this command again.`)
    } catch (e) {
      console.error('Could not auto-create seed file:', e)
    }
    process.exit(1)
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch (e) {
    console.error('Invalid JSON in integration-settings.seed.json:', e)
    process.exit(1)
  }

  const entries: { key: string; value: string }[] = []
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith('_')) continue
    const value = stringifyValue(val)
    if (value === null) continue
    if (key.length > 128) {
      console.warn(`Skipping key longer than 128 chars: ${key.slice(0, 40)}…`)
      continue
    }
    entries.push({ key, value })
  }

  if (entries.length === 0) {
    console.error('No non-empty settings in integration-settings.seed.json — add at least one value.')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    for (const { key, value } of entries) {
      try {
        await pool
          .request()
          .input('k', key)
          .input('v', value)
          .query(`
            MERGE dbo.integration_settings AS t
            USING (SELECT @k AS setting_key, @v AS setting_value) AS s
            ON t.setting_key = s.setting_key
            WHEN MATCHED THEN UPDATE SET setting_value = s.setting_value, updated_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (s.setting_key, s.setting_value);
          `)
        console.log(`OK  ${key}`)
      } catch (e) {
        if (sqlErrorMentionsMissingObject(e, 'integration_settings')) {
          console.error('Table dbo.integration_settings does not exist. Run: npm run db:migrate')
          process.exit(1)
        }
        throw e
      }
    }
  } finally {
    await pool.close()
  }

  console.log(`\nDone. ${entries.length} row(s) upserted. Restart the API (or wait ~60s) so the in-memory settings cache reloads.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
