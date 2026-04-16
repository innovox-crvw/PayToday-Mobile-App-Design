import type { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

const CSRF_COOKIE = 'pt_csrf'
const CSRF_HEADER = 'x-csrf-token'

function secureCookie(): boolean {
  return env.nodeEnv === 'production' || env.cookieSameSite === 'none'
}

/** Returns a new CSRF token and sets the double-submit cookie. */
export function sendCsrfToken(_req: Request, res: Response): void {
  const token = crypto.randomBytes(32).toString('hex')
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: env.cookieSameSite,
    secure: secureCookie(),
    maxAge: 12 * 60 * 60 * 1000,
  })
  res.json({ csrfToken: token })
}

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next()
    return
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined
  const headerToken = req.get(CSRF_HEADER)
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF validation failed' })
    return
  }
  next()
}

export { CSRF_COOKIE, CSRF_HEADER }
