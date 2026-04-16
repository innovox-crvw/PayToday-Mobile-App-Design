import type { ConnectionPool } from 'mssql'
import sql from 'mssql'

/** Key-value ADO-style connection string (keys lowercased). */
function parseAdoMap(cs: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const segment of cs.split(';')) {
    const s = segment.trim()
    if (!s) continue
    const i = s.indexOf('=')
    if (i === -1) continue
    map.set(s.slice(0, i).trim().toLowerCase(), s.slice(i + 1).trim())
  }
  return map
}

function isWindowsTrusted(m: Map<string, string>): boolean {
  const tc = (m.get('trusted_connection') ?? '').toLowerCase()
  if (tc === 'yes' || tc === 'true' || tc === 'sspi') return true
  const isc = (m.get('integrated security') ?? '').toLowerCase()
  return isc === 'true' || isc === 'yes' || isc === 'sspi'
}

/** `.env` often uses `Server=host\\INSTANCE`; dotenv may leave two backslashes — collapse for parsing. */
function normalizeAdoServerHostInstance(server: string): string {
  return server.trim().replace(/\\+/g, '\\')
}

/** `host`, optional `port` (from `host,1433`), or `instanceName` (from `host\\INSTANCE`). */
function parseServerSegment(server: string): { host: string; port?: number; instanceName?: string } {
  const s = normalizeAdoServerHostInstance(server)
  const comma = s.indexOf(',')
  if (comma > 0) {
    const p = s.slice(comma + 1).trim()
    if (/^\d+$/.test(p)) {
      return { host: s.slice(0, comma).trim(), port: parseInt(p, 10) }
    }
  }
  const bs = s.indexOf('\\')
  if (bs > 0) {
    return { host: s.slice(0, bs).trim(), instanceName: s.slice(bs + 1).trim() }
  }
  return { host: s }
}

export type MssqlInstanceConfig = {
  user?: string
  password?: string
  server: string
  port?: number
  database?: string
  connectionTimeout?: number
  authentication?: { type: 'default' }
  options?: {
    encrypt?: boolean
    trustServerCertificate?: boolean
    instanceName?: string
  }
}

/** ADO connection strings often use `yes`/`no`; Tedious-style uses `true`/`false`. */
function adoBool(v: string | undefined, defaultVal: boolean): boolean {
  if (v === undefined || v.trim() === '') return defaultVal
  const s = v.trim().toLowerCase()
  if (['true', '1', 'yes', 'sspi'].includes(s)) return true
  if (['false', '0', 'no'].includes(s)) return false
  return defaultVal
}

function commonOptions(
  m: Map<string, string>,
): { encrypt: boolean; trustServerCertificate: boolean; connectionTimeout: number; database?: string } {
  const encrypt = adoBool(m.get('encrypt'), true)
  const trust = adoBool(m.get('trustservercertificate'), false)
  const sec = parseInt(m.get('connection timeout') ?? '30', 10)
  const connectionTimeout = Number.isFinite(sec) && sec > 0 ? sec * 1000 : 30_000
  const database = m.get('database') ?? m.get('initial catalog')
  return { encrypt, trustServerCertificate: trust, connectionTimeout, database }
}

/** True when the string uses `Trusted_Connection` / `Integrated Security` (not supported by Tedious — use `connectMssql`). */
export function connectionUsesWindowsIntegrated(connectionString: string): boolean {
  return isWindowsTrusted(parseAdoMap(connectionString.trim()))
}

/**
 * Pool config for `mssql/msnodesqlv8` (Windows integrated auth).
 * Uses an explicit ODBC connection string so we do not depend on "SQL Server Native Client 11.0"
 * (often missing on Windows 10/11). Override driver with env `SQL_ODBC_DRIVER` if needed.
 */
export function toMsnodesqlv8PoolConfig(connectionString: string): {
  connectionString: string
  driver: 'msnodesqlv8'
  connectionTimeout: number
} {
  const cs = connectionString.trim()
  const m = parseAdoMap(cs)
  const serverRaw = m.get('server') ?? m.get('data source')
  if (!serverRaw) {
    throw new Error('Connection string must include Server (or Data Source).')
  }
  const serverNorm = normalizeAdoServerHostInstance(serverRaw)
  const { encrypt, trustServerCertificate, connectionTimeout, database } = commonOptions(m)
  const parsed = parseServerSegment(serverNorm)
  const db = (database ?? 'paytoday').trim()
  const serverPart = parsed.instanceName
    ? `${parsed.host}\\${parsed.instanceName}`
    : `${parsed.host},${parsed.port ?? 1433}`
  const odbcDriver = process.env.SQL_ODBC_DRIVER?.trim() || 'ODBC Driver 17 for SQL Server'
  const odbcParts = [
    `Driver={${odbcDriver}}`,
    `Server=${serverPart}`,
    `Database=${db}`,
    'Trusted_Connection=yes',
    `Encrypt=${encrypt ? 'yes' : 'no'}`,
  ]
  if (trustServerCertificate) {
    odbcParts.push('TrustServerCertificate=yes')
  }
  return {
    connectionString: `${odbcParts.join(';')};`,
    driver: 'msnodesqlv8',
    connectionTimeout,
  }
}

/**
 * Tedious (`mssql` default) config for **SQL authentication** and `host\INSTANCE` (no Windows trusted).
 */
export function toMssqlConnectArg(connectionString: string): string | MssqlInstanceConfig {
  const cs = connectionString.trim()
  const m = parseAdoMap(cs)
  const serverRaw = m.get('server') ?? m.get('data source')
  if (!serverRaw) return cs

  const serverNorm = normalizeAdoServerHostInstance(serverRaw)

  if (isWindowsTrusted(m)) {
    return cs
  }

  const { encrypt, trustServerCertificate, connectionTimeout, database } = commonOptions(m)

  const comma = serverNorm.indexOf(',')
  if (comma > 0 && /^\d+$/.test(serverNorm.slice(comma + 1).trim())) {
    return cs
  }

  const bs = serverNorm.indexOf('\\')
  if (bs <= 0) return cs

  const host = serverNorm.slice(0, bs).trim()
  const instanceName = serverNorm.slice(bs + 1).trim()
  if (!host || !instanceName) return cs

  const user = m.get('user id') ?? m.get('uid')
  const password = m.get('password') ?? m.get('pwd')

  const cfg: MssqlInstanceConfig = {
    server: host,
    connectionTimeout,
    options: {
      encrypt,
      trustServerCertificate,
      instanceName,
    },
  }
  if (user) cfg.user = user
  if (password !== undefined) cfg.password = password
  if (database) cfg.database = database
  return cfg
}

/**
 * Opens a pool via Tedious (SQL auth) or **msnodesqlv8** when `Trusted_Connection` / integrated security is set (Windows only).
 */
export async function connectMssql(connectionString: string): Promise<ConnectionPool> {
  const cs = connectionString.trim()
  if (connectionUsesWindowsIntegrated(cs)) {
    const v8 = await import('mssql/msnodesqlv8')
    return v8.default.connect(toMsnodesqlv8PoolConfig(cs) as never)
  }
  return sql.connect(toMssqlConnectArg(cs) as never) as Promise<ConnectionPool>
}
