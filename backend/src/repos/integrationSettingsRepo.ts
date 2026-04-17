import type { ConnectionPool } from 'mssql'
import { formatSqlDriverError, sqlErrorMentionsMissingObject } from '../db/sqlDriverError.js'

/** Key/value overrides for integration env (see integrationRuntimeConfig.ts). */
export async function fetchIntegrationSettingsMap(pool: ConnectionPool): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  try {
    const r = await pool.request().query<{ setting_key: string; setting_value: string | null }>(`
      SELECT setting_key, setting_value FROM dbo.integration_settings
    `)
    for (const row of r.recordset) {
      const k = row.setting_key?.trim()
      const v = row.setting_value
      if (!k) continue
      if (v == null) continue
      const t = String(v).trim()
      if (t === '') continue
      m.set(k, t)
    }
  } catch (e) {
    if (sqlErrorMentionsMissingObject(e, 'integration_settings')) {
      return m
    }
    const msg = formatSqlDriverError(e).toLowerCase()
    /* Some drivers/locales omit the exact phrase `invalid object name`. */
    if (msg.includes('integration_settings') && (msg.includes('invalid object') || msg.includes('could not find'))) {
      return m
    }
    console.warn('[integration_settings] load failed:', formatSqlDriverError(e))
  }
  return m
}
