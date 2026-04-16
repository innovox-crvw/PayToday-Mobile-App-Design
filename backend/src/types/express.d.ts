import type { JwtPayload } from './roles.js'

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export {}
