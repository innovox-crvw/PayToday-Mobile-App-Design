/**
 * Write catalog-100-products.csv (100 rows, mixed categories including liquor).
 *
 *   npm run db:generate-catalog-csv
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog100Csv, buildCatalog100Products } from './lib/catalog100Products.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'data', 'seed')
const outPath = path.join(outDir, 'catalog-100-products.csv')
const templatePath = path.join(
  __dirname,
  '..',
  '..',
  'frontend',
  'public',
  'templates',
  'catalog-100-products.csv',
)

async function main(): Promise<void> {
  const rows = buildCatalog100Products()
  const csv = buildCatalog100Csv()
  await mkdir(outDir, { recursive: true })
  await writeFile(outPath, csv, 'utf8')
  await mkdir(path.dirname(templatePath), { recursive: true })
  await writeFile(templatePath, csv, 'utf8')
  console.log(`Wrote ${rows.length} products to:`)
  console.log(`  ${outPath}`)
  console.log(`  ${templatePath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
