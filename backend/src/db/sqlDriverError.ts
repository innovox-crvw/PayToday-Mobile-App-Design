/** msnodesqlv8 / mssql often reject with a plain object; `String(err)` becomes `[object Object]`. */
export function formatSqlDriverError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err !== null && typeof err === 'object') {
    const o = err as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    const orig = o.originalError
    if (orig !== null && typeof orig === 'object') {
      const oe = orig as Record<string, unknown>
      if (typeof oe.message === 'string' && oe.message.trim()) return oe.message
    }
    if (typeof o.code === 'string' || typeof o.number === 'number') {
      const parts = [o.code, o.number, o.message, o.state].filter((x) => x !== undefined && x !== '')
      if (parts.length) return parts.map(String).join(' ')
    }
    try {
      return JSON.stringify(o)
    } catch {
      /* fall through */
    }
  }
  return String(err)
}

/** True when SQL Server reports a missing table/view (e.g. schema not fully migrated). */
export function sqlErrorMentionsMissingObject(err: unknown, nameFragment: string): boolean {
  const m = formatSqlDriverError(err).toLowerCase()
  const frag = nameFragment.trim().toLowerCase()
  if (!frag) return false
  return (m.includes('invalid object name') || m.includes('does not exist')) && m.includes(frag)
}

/** SQL Server: 207 = invalid column name (ODBC may nest message under originalError). */
export function sqlServerErrorNumber(err: unknown): number | undefined {
  if (err === null || typeof err !== 'object') return undefined
  const o = err as Record<string, unknown>
  if (typeof o.number === 'number' && Number.isFinite(o.number)) return o.number
  const orig = o.originalError
  if (orig !== null && typeof orig === 'object') {
    const oe = orig as Record<string, unknown>
    if (typeof oe.number === 'number' && Number.isFinite(oe.number)) return oe.number
    const info = oe.info as Record<string, unknown> | undefined
    if (info && typeof info.number === 'number' && Number.isFinite(info.number)) return info.number
  }
  return undefined
}

/** True when a column is missing (e.g. hub table exists but migration 003/004 not applied yet). */
export function sqlErrorMentionsInvalidColumn(err: unknown, columnName: string): boolean {
  const m = formatSqlDriverError(err).toLowerCase()
  const col = columnName.trim().toLowerCase()
  if (!col) return false
  if (!m.includes(col)) return false
  if (sqlServerErrorNumber(err) === 207) return true
  return m.includes('invalid column name') || m.includes('invalid column')
}
