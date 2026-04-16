import type { JwtPayload } from '../types/roles.js'

/** MS SQL `uniqueidentifier` user id from JWT, or null if token is not a persisted account (e.g. demo `sub`). */
export function sqlUserIdFromJwtUser(user: JwtPayload | undefined): string | null {
  const sub = user?.sub?.trim()
  if (!sub) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sub)) return null
  return sub
}
