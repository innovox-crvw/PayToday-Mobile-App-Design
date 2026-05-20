/**
 * Stamp pay_today_merchant_id on catalog products by category (multi-store pickup demo).
 *
 *   npm run db:assign-catalog-merchants
 */
import { env } from '../src/config/env.js'
import { CATEGORY_PICKUP_STORE } from '../src/lib/catalogPickupStores.js'
import { connectMssql } from '../src/db/mssqlConnectConfig.js'

async function main(): Promise<void> {
  if (!env.sqlConnectionString?.trim()) {
    console.error('Set SQL_CONNECTION_STRING in .env')
    process.exit(1)
  }

  const pool = await connectMssql(env.sqlConnectionString)
  try {
    let updated = 0
    for (const [slug, store] of Object.entries(CATEGORY_PICKUP_STORE)) {
      const r = await pool
        .request()
        .input('mid', store.merchantId)
        .input('slug', slug)
        .query(`
          UPDATE p
          SET pay_today_merchant_id = @mid
          FROM dbo.products p
          INNER JOIN dbo.categories c ON c.id = p.category_id
          WHERE c.slug = @slug
        `)
      const n = r.rowsAffected[0] ?? 0
      if (n > 0) {
        console.log(`${slug}: ${n} product(s) → merchant ${store.merchantId} (${store.storeName})`)
        updated += n
      }
    }
    console.log(`Updated ${updated} product row(s).`)
  } finally {
    await pool.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
