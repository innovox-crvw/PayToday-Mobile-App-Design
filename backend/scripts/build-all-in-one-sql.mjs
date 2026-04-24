import fs from 'node:fs'
import path from 'path'
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
    2) Drops and recreates core schema + seed data (same as paytoday-full-setup.sql).

  After SSMS/sqlcmd runs this file, apply newer schema from the repo with:
    npm run db:migrate

  Demo login after seed (local bcrypt auth):
    demo@paytoday.local  /  PayToday123!

  Then run from the repo (with .env / SQL_CONNECTION_STRING):

    npm run db:migrate

  Do not pre-fill dbo.schema_migrations here — migrate.ts must apply incremental migrations.

  WARNING: The first section DROPS existing PayToday tables in [paytoday].
================================================================================
*/

`

const footer = `
PRINT N'All-in-one seed complete. From repo: npm run db:migrate';
GO
`

function readUtf8(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

const setup = readUtf8('backend/scripts/paytoday-full-setup.sql')
const body = `${header}${setup.trimEnd()}\n\nGO\n\n${footer.trim()}\n`

fs.writeFileSync(outPath, body, 'utf8')
console.log('Wrote', outPath, '(' + Buffer.byteLength(body, 'utf8') + ' bytes)')
