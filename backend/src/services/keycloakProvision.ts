import type { ConnectionPool } from 'mssql'
import type { UserRole } from '../types/roles.js'
import {
  findUserById,
  findUserByKeycloakSub,
  findUserByEmailLower,
  linkKeycloakSubToUser,
  insertUserFromKeycloak,
  type UserRow,
} from '../repos/usersRepo.js'
import { KeycloakAuthError } from './keycloakOidc.js'

export async function upsertUserFromKeycloakProfile(
  pool: ConnectionPool,
  input: { keycloakSub: string; email: string; fullName: string | null; role: UserRole },
): Promise<UserRow> {
  const bySub = await findUserByKeycloakSub(pool, input.keycloakSub)
  if (bySub) return bySub

  const byEmail = await findUserByEmailLower(pool, input.email)
  if (byEmail?.keycloak_sub && byEmail.keycloak_sub !== input.keycloakSub) {
    throw new KeycloakAuthError('That email is already linked to another Keycloak account.', 409)
  }
  if (byEmail && !byEmail.keycloak_sub) {
    await linkKeycloakSubToUser(pool, byEmail.id, input.keycloakSub)
    const row = await findUserById(pool, byEmail.id)
    if (!row) throw new KeycloakAuthError('User update failed.', 500)
    return row
  }

  const id = await insertUserFromKeycloak(pool, {
    email: input.email,
    fullName: input.fullName,
    keycloakSub: input.keycloakSub,
    role: input.role,
  })
  const row = await findUserById(pool, id)
  if (!row) throw new KeycloakAuthError('User creation failed.', 500)
  return row
}
