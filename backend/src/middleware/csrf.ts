import type { Request, Response, NextFunction } from 'express'
import crypto from 'node:crypto'
import { env } from '../config/env.js'

const CSRF_COOKIE = 'pt_csrf'
const CSRF_HEADER = 'x-csrf-token'

function requestIsHttps(req: Request): boolean {
  if (req.secure) return true
  const xf = req.get('x-forwarded-proto')
  if (!xf) return false
  return xf.split(',')[0]?.trim() === 'https'
}

/**
 * SameSite=None requires Secure; browsers drop the cookie on plain HTTP, which breaks mobile/LAN dev.
 * Fall back to Lax + non-secure on HTTP so the double-submit cookie still sticks.
 */
function csrfCookieOptions(req: Request): {
  httpOnly: boolean
  sameSite: 'strict' | 'lax' | 'none'
  secure: boolean
  maxAge: number
  path: string
} {
  const https = requestIsHttps(req)
  let sameSite = env.cookieSameSite
  let secure: boolean
  if (sameSite === 'none') {
    secure = https
    if (!https) {
      sameSite = 'lax'
      secure = false
    }
  } else {
    secure = env.nodeEnv === 'production' && https
  }
  return {
    httpOnly: false,
    sameSite,
    secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  }
}

/** Returns a new CSRF token and sets the double-submit cookie. */
export function sendCsrfToken(req: Request, res: Response): void {
  const token = crypto.randomBytes(32).toString('hex')
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions(req))
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
