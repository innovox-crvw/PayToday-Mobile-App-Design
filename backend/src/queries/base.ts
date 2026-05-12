import type { IResult } from 'mssql'
import type { SqlExecutor } from '../db/sqlExecutor.js'

export type { SqlExecutor } from '../db/sqlExecutor.js'

export type SqlNamedParamValue = string | number | boolean | Date | Buffer | null
export type SqlNamedParams = Record<string, SqlNamedParamValue>

export async function runQuery<T>(
  executor: SqlExecutor,
  sql: string,
  params?: SqlNamedParams,
): Promise<T[]> {
  const request = executor.request()
  for (const [key, value] of Object.entries(params ?? {})) {
    request.input(key, value)
  }
  const result = (await request.query<T>(sql)) as IResult<T>
  return result.recordset
}
