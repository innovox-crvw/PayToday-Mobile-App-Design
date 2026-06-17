/**
 * Set compare_at_price_cents on variants so products appear in the home Super deals rail.
 *
 *   npm run db:backfill-super-deals
 *   npm run db:backfill-super-deals -- --dry-run
 */
import { env } from '../src/config/env.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'
import { superDealCompareAtForSku } from '../src/lib/superDealDiscounts.js'

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')

  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env at the repo root, then retry.')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    const rows = await pool.request().query<{ variant_id: string; sku: string; price_cents: number }>(`
      SELECT CAST(v.id AS NVARCHAR(36)) AS variant_id, v.sku, v.price_cents
      FROM dbo.product_variants v
      INNER JOIN dbo.products p ON p.id = v.product_id
      WHERE p.is_active = 1
    `)

    let updated = 0
    let skipped = 0
    for (const row of rows.recordset) {
      const compareAt = superDealCompareAtForSku(row.sku, Number(row.price_cents))
      if (compareAt == null) {
        skipped++
        continue
      }
      if (dry) {
        console.log(`${row.sku}: sale ${row.price_cents} → was ${compareAt}`)
        updated++
        continue
      }
      try {
        await pool
          .request()
          .input('vid', row.variant_id)
          .input('cmp', compareAt)
          .query(`UPDATE dbo.product_variants SET compare_at_price_cents = @cmp WHERE id = @vid`)
        updated++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/compare_at_price_cents|Invalid column name/i.test(msg)) {
          console.error('compare_at_price_cents column missing. Run: npm run db:migrate')
          process.exit(1)
        }
        throw e
      }
    }

    console.log(
      dry
        ? `Would set compare-at on ${updated} variant(s) (${skipped} without a super-deal SKU map).`
        : `Super deals: updated ${updated} variant(s); ${skipped} unchanged.`,
    )
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
