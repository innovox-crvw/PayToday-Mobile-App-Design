import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { JwtPayload, UserRole } from '../types/roles.js'

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[env.cookieName] as string | undefined
  if (!token) {
    next()
    return
  }
  try {
    req.user = jwt.verify(token, env.jwtSecret) as JwtPayload
  } catch {
    req.user = undefined
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
