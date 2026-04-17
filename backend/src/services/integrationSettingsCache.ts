import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import { fetchIntegrationSettingsMap } from '../repos/integrationSettingsRepo.js'

const TTL_MS = 60_000

let cache: { at: number; map: Map<string, string> } | null = null

/** In-memory cache so each request does not hit SQL for every setting read. */
export async function getIntegrationSettingsMap(pool: ConnectionPool | null): Promise<Map<string, string>> {
  if (!pool) return new Map()
  if (env.integrationUseEnvOnly) {
    return new Map()
  }
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) {
    return cache.map
  }
  const map = await fetchIntegrationSettingsMap(pool)
  cache = { at: now, map }
  return map
}

export function clearIntegrationSettingsCache(): void {
  cache = null
}
