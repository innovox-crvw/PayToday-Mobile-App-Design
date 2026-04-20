/**
 * Ephemeral cart when MS SQL is unavailable. Without the database, variant metadata cannot be resolved,
 * so new lines cannot be added and existing sessions show no priced lines.
 */
import crypto from 'node:crypto'

export interface MemoryCartLine {
  lineId: string
  variantId: string
  quantity: number
  sku: string
  name: string
  unitPriceCents: number
  currency: string
}

const linesBySession = new Map<string, Map<string, number>>()

export function ensureMemoryCartSession(sessionToken: string | undefined): { sessionToken: string; cartId: string } {
  const token = sessionToken ?? crypto.randomBytes(24).toString('hex')
  if (!linesBySession.has(token)) linesBySession.set(token, new Map())
  return { sessionToken: token, cartId: `memory:${token.slice(0, 12)}` }
}

export function getMemoryCartLines(_sessionToken: string): MemoryCartLine[] {
  return []
}

export function upsertMemoryCartLine(sessionToken: string, variantId: string, quantity: number): boolean {
  if (quantity > 0) return false
  if (!linesBySession.has(sessionToken)) return true
  linesBySession.get(sessionToken)!.delete(variantId)
  return true
}

export function clearMemoryCartLines(sessionToken: string): void {
  const m = linesBySession.get(sessionToken)
  if (m) m.clear()
}
