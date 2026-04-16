import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', '..')
const outPath = path.join(__dirname, 'paytoday-database-all-in-one.sql')

const header = `/*
================================================================================
  PayToday Store — ALL-IN-ONE Microsoft SQL Server script
================================================================================
  What this file does:
    1) Creates database [paytoday] if missing (comment out if you use an existing DB).
    2) Drops and recreates core schema + seed data (same as paytoday-full-setup.sql), including
       dbo.notification_outbox, dbo.user_notifications, and two seed outbox rows for hub demo templates.
    3) Applies incremental migrations 002–009 (idempotent where objects already exist).

  How to run:
    • SSMS: open this file, then Execute (F5).
    • sqlcmd: sqlcmd -S YOURSERVER -E -i paytoday-database-all-in-one.sql

  Demo login after seed (local bcrypt auth):
    demo@paytoday.local  /  PayToday123!

  After this script, "npm run db:migrate" will skip versions 001–009 when the
  schema_migrations rows at the end are present.

  WARNING: The first section DROPS existing PayToday tables in [paytoday].
================================================================================
*/

`

const footer = `
/* ---- Record migration versions (so Node migrate.ts skips 001–009) ---- */
IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NOT NULL
BEGIN
  ;WITH v(version) AS (
    SELECT N'001_product_brands' UNION ALL
    SELECT N'002_user_notifications' UNION ALL
    SELECT N'003_hub_payment_methods' UNION ALL
    SELECT N'004_hub_tables_bootstrap' UNION ALL
    SELECT N'005_inventory_reservation_lines' UNION ALL
    SELECT N'006_hub_payment_category_items_drilldown' UNION ALL
    SELECT N'007_orders_paytoday_intent_token' UNION ALL
    SELECT N'008_users_keycloak' UNION ALL
    SELECT N'009_integration_settings'
  )
  INSERT INTO dbo.schema_migrations (version)
  SELECT v.version FROM v
  WHERE NOT EXISTS (SELECT 1 FROM dbo.schema_migrations m WHERE m.version = v.version);
END;
GO

PRINT N'All-in-one PayToday database script finished.';
GO
`

function readUtf8(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const setup = readUtf8('backend/scripts/paytoday-full-setup.sql')
const migrationFiles = [
  'backend/migrations/002_user_notifications.sql',
  'backend/migrations/003_hub_payment_methods.sql',
  'backend/migrations/004_hub_tables_bootstrap.sql',
  'backend/migrations/005_inventory_reservation_lines.sql',
  'backend/migrations/006_hub_payment_category_items_drilldown.sql',
  'backend/migrations/007_orders_paytoday_intent_token.sql',
  'backend/migrations/008_users_keycloak.sql',
  'backend/migrations/009_integration_settings.sql',
]

let body = header + setup.trimEnd() + '\n\nGO\n\n'
body += '/* ---- Migrations 002–009 (idempotent on top of full setup) ---- */\n\n'

for (const f of migrationFiles) {
  body += readUtf8(f).trimEnd() + '\n\nGO\n\n'
}

body += footer.trim() + '\n'

fs.writeFileSync(outPath, body, 'utf8')
console.log('Wrote', outPath, '(' + Buffer.byteLength(body, 'utf8') + ' bytes)')
