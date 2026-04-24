import type { ConnectionPool } from 'mssql'
import type { Request } from 'express'
import type { UserRole } from '../types/roles.js'
import { sqlUserIdFromJwtUser } from './authUserId.js'
import { listMerchantsForUser } from '../repos/usersRepo.js'

/**
 * Merchant scope for admin catalogue, inventory, and overview stats.
 * - `ops`: always full (all merchants).
 * - `admin` or `fulfillment` with at least one linked merchant: restricted to those PayToday merchant ids.
 * - `admin` / `fulfillment` with zero links: full (legacy platform / warehouse-wide).
 */
export function effectiveAdminProductMerchantScope(
  role: UserRole | undefined,
  linkedMerchantIds: number[],
): number[] | undefined {
  if (role === 'ops') return undefined
  if (linkedMerchantIds.length > 0 && (role === 'admin' || role === 'fulfillment')) {
    return linkedMerchantIds
  }
  return undefined
}

export function isPayTodayMerchantIdAllowedForScope(
  scope: number[] | undefined,
  merchantId: number | null | undefined,
): boolean {
  if (!scope?.length) return true
  if (merchantId == null || !Number.isInteger(merchantId)) return false
  return scope.includes(merchantId)
}

export async function resolveAdminMerchantScopeFromRequest(
  pool: ConnectionPool,
  req: Request,
): Promise<{ scope: number[] | undefined; uid: string | null }> {
  const uid = sqlUserIdFromJwtUser(req.user)
  let linked: number[] = []
  if (uid) {
    const merchants = await listMerchantsForUser(pool, uid)
    linked = merchants.map((m) => m.payTodayMerchantId)
  }
  const scope = effectiveAdminProductMerchantScope(req.user?.role, linked)
  return { scope, uid }
}
