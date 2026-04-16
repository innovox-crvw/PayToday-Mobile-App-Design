import type { Response } from 'express'
import type { ConnectionPool } from 'mssql'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { UserRole } from '../types/roles.js'
import { insertRefreshToken } from '../repos/refreshTokensRepo.js'
import { accessTokenCookieOptions, refreshTokenCookieOptions } from './authCookies.js'

export function issueAccessToken(userId: string, email: string, role: UserRole): string {
  return jwt.sign({ sub: userId, email, role }, env.jwtSecret, { expiresIn: '24h' })
}

export async function setAuthCookiesForUser(
  res: Response,
  pool: ConnectionPool,
  userId: string,
  email: string,
  role: UserRole,
): Promise<void> {
  const access = issueAccessToken(userId, email, role)
  res.cookie(env.cookieName, access, accessTokenCookieOptions())
  const rawRefresh = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(rawRefresh, 'utf8').digest()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await insertRefreshToken(pool, userId, hash, expiresAt)
  res.cookie(env.refreshCookieName, rawRefresh, refreshTokenCookieOptions())
}
