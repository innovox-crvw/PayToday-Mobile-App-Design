/**
 * Backfill dbo.product_variants package columns where all four are currently NULL.
 *
 * Defaults are read from environment (integers, mm / grams):
 *   PT_SEED_PACKAGE_LENGTH_MM  (default 120)
 *   PT_SEED_PACKAGE_WIDTH_MM   (default 80)
 *   PT_SEED_PACKAGE_HEIGHT_MM  (default 60)
 *   PT_SEED_GROSS_WEIGHT_G     (default 250)
 *
 * Usage (from repo root, with .env containing SQL_CONNECTION_STRING):
 *   npx tsx backend/scripts/seed-variant-package-dimensions.ts
 *   npx tsx backend/scripts/seed-variant-package-dimensions.ts --dry-run
 *
 * Requires migration 019 (package_length_mm, …) applied.
 */
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'

function intEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim()
  if (!v) return fallback
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  return n
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env at the repo root, then retry.')
    process.exit(1)
  }

  const lengthMm = intEnv('PT_SEED_PACKAGE_LENGTH_MM', 120)
  const widthMm = intEnv('PT_SEED_PACKAGE_WIDTH_MM', 80)
  const heightMm = intEnv('PT_SEED_PACKAGE_HEIGHT_MM', 60)
  const grossG = intEnv('PT_SEED_GROSS_WEIGHT_G', 250)

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    const countRes = await pool.request().query<{ c: number }>(`
      SELECT COUNT_BIG(1) AS c
      FROM dbo.product_variants
      WHERE package_length_mm IS NULL
        AND package_width_mm IS NULL
        AND package_height_mm IS NULL
        AND gross_weight_g IS NULL
    `)
    const n = Number(countRes.recordset[0]?.c ?? 0)
    console.log(`Variants with all package columns NULL: ${n}`)
    console.log(`Would set: L=${lengthMm}mm W=${widthMm}mm H=${heightMm}mm weight=${grossG}g`)

    if (dry) {
      console.log('--dry-run: no UPDATE executed.')
      return
    }

    if (n === 0) {
      console.log('Nothing to update.')
      return
    }

    const upd = await pool
      .request()
      .input('l', lengthMm)
      .input('w', widthMm)
      .input('h', heightMm)
      .input('g', grossG)
      .query(`
        UPDATE dbo.product_variants
        SET
          package_length_mm = @l,
          package_width_mm = @w,
          package_height_mm = @h,
          gross_weight_g = @g
        WHERE package_length_mm IS NULL
          AND package_width_mm IS NULL
          AND package_height_mm IS NULL
          AND gross_weight_g IS NULL
      `)

    const affected = upd.rowsAffected[0] ?? 0
    console.log(`Updated ${affected} row(s).`)
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
