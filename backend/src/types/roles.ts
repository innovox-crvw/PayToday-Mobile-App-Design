export type UserRole = 'customer' | 'admin' | 'ops' | 'fulfillment'

export interface JwtPayload {
  sub: string
  email: string
  role: UserRole
  iat?: number
  exp?: number
}
