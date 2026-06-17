import type { SqlExecutor } from '../db/sqlExecutor.js'

export type { SqlExecutor }

/** Values bound as `@name` parameters on a `mssql` request. */
export type SqlNamedParams = Record<string, string | number | boolean | Date | null | undefined>

export async function runQuery<T>(executor: SqlExecutor, sql: string, params?: SqlNamedParams): Promise<T[]> {
  const req = executor.request()
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val === undefined) continue
      req.input(key, val)
    }
  }
  const result = await req.query<T>(sql)
  return result.recordset
}
