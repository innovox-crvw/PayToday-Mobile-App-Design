/**
 * Helpers for MS SQL connection strings (mssql / node driver format).
 */

export function parseSqlConnection(connectionString: string): {
  masterConnectionString: string
  databaseName: string
} {
  const cs = connectionString.trim()
  const dbMatch = cs.match(/(?:;|^)\s*(?:Database|Initial Catalog)\s*=\s*([^;]+?)\s*(?=;|$)/i)
  const databaseName = (dbMatch?.[1] ?? 'paytoday').trim()
  const withoutDb = cs
    .replace(/(?:;|^)\s*(?:Database|Initial Catalog)\s*=[^;]*/gi, '')
    .replace(/;+/g, ';')
    .replace(/^;|;$/g, '')
  const masterConnectionString = `${withoutDb}${withoutDb.endsWith(';') ? '' : ';'}Database=master`
  return { masterConnectionString, databaseName }
}
