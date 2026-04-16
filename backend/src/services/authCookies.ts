import type { CookieOptions } from 'express'
import { env } from '../config/env.js'

function secureDefault(): boolean {
  return env.nodeEnv === 'production' || env.cookieSameSite === 'none'
}

export function accessTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: secureDefault(),
    maxAge: 24 * 60 * 60 * 1000,
  }
}

export function refreshTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: secureDefault(),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  }
}
