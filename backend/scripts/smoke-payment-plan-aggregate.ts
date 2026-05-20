/**
 * Reproduce / isolate nested-aggregate errors for payment plans.
 * Run from backend/: npx tsx scripts/smoke-payment-plan-aggregate.ts
 */
import { getSqlPool } from '../src/db/pool.js'
import { formatSqlDriverError } from '../src/db/sqlDriverError.js'

async function runStep(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`OK  ${label}`)
  } catch (e) {
    console.error(`FAIL ${label}`)
    console.error('     ', formatSqlDriverError(e))
  }
}

async function main(): Promise<void> {
  const pool = await getSqlPool()
  if (!pool) {
    console.error('No SQL pool — set SQL_CONNECTION_STRING in .env')
    process.exit(1)
  }

  const cols = await pool.request().query(`
    SELECT c.name, t.name AS data_type, c.is_computed
    FROM sys.columns c
    JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans')
    ORDER BY c.column_id
  `)
  console.log('\n--- order_payment_plans columns ---')
  console.table(cols.recordset)

  const triggers = await pool.request().query(`
    SELECT OBJECT_NAME(t.parent_id) AS on_table, t.name AS trigger_name
    FROM sys.triggers t
    WHERE t.parent_id IN (
      OBJECT_ID(N'dbo.order_payment_plans'),
      OBJECT_ID(N'dbo.order_payment_plan_instalments')
    )
  `)
  console.log('\n--- triggers (should be empty after 077) ---')
  console.table(triggers.recordset)

  const views = await pool.request().query(`
    SELECT v.name
    FROM sys.views v
    INNER JOIN sys.sql_modules m ON m.object_id = v.object_id
    WHERE m.definition LIKE N'%order_payment_plan%'
  `)
  console.log('\n--- views mentioning payment plans ---')
  console.table(views.recordset)

  const orderRow = await pool.request().query<{ id: string }>(`
    SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.orders ORDER BY created_at DESC
  `)
  const orderId = orderRow.recordset[0]?.id
  if (!orderId) {
    console.warn('\nNo orders in DB — skipping INSERT smoke test')
    process.exit(0)
  }

  const { createPaymentPlanInTransaction } = await import('../src/services/paymentPlanService.js')

  await runStep('INSERT payment plan via paymentPlanService (rolled back)', async () => {
    const tx = pool.transaction()
    await tx.begin()
    try {
      const planR = await createPaymentPlanInTransaction(tx, {
        orderId,
        planType: 'monthly',
        totalInstalments: 3,
        totalCents: 300,
        currency: 'NAD',
      })
      if (!planR.planId) throw new Error('No plan id returned')
    } finally {
      await tx.rollback()
    }
  })

  await runStep('Admin list query (instalments.ts)', async () => {
    await pool.request().input('st', null).query(`
      SELECT CAST(p.id AS NVARCHAR(36)) AS id,
        p.instalment_cents,
        (SELECT COUNT(1) FROM dbo.order_payment_plan_instalments i
          WHERE i.plan_id = p.id AND i.status = N'overdue') AS overdue_count
      FROM dbo.order_payment_plans p
      WHERE @st IS NULL OR p.status = @st
    `)
  })

  await runStep('Admin overview inventory KPIs', async () => {
    await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.product_variants) AS variantCount,
        (SELECT COUNT(*)
         FROM dbo.product_variants v
         LEFT JOIN (
           SELECT variant_id, SUM(quantity) AS sumQty
           FROM dbo.inventory_quantity
           GROUP BY variant_id
         ) q ON q.variant_id = v.id
         WHERE v.low_stock_threshold IS NOT NULL
           AND ISNULL(q.sumQty, 0) <= v.low_stock_threshold) AS lowStockVariantCount
    `)
  })

  console.log('\nDone. If INSERT fails but list query passes, check triggers / legacy columns.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
