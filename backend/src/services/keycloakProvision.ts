import type { ConnectionPool } from 'mssql'
import {
  findUserById,
  findUserByKeycloakSub,
  findUserByEmailLower,
  linkKeycloakSubToUser,
  insertUserFromKeycloak,
  syncKeycloakEmailVerified,
  type UserRow,
} from '../repos/usersRepo.js'
import { KeycloakAuthError } from './keycloakClient.js'

/**
 * Find-or-create a local `dbo.users` row for a Keycloak subject.
 *
 * PayToday users are always provisioned as `customer`; staff access (`admin` / `ops` / `fulfillment`)
 * is granted by an admin editing `users.role` in-app. Existing rows are never role-updated here.
 */
export async function upsertUserFromKeycloakProfile(
  pool: ConnectionPool,
  input: { keycloakSub: string; email: string; fullName: string | null; emailVerified: boolean },
): Promise<UserRow> {
  const bySub = await findUserByKeycloakSub(pool, input.keycloakSub)
  if (bySub) {
    await syncKeycloakEmailVerified(pool, bySub.id, input.emailVerified)
    const row = await findUserById(pool, bySub.id)
    return row ?? bySub
  }

  const byEmail = await findUserByEmailLower(pool, input.email)
  if (byEmail?.keycloak_sub && byEmail.keycloak_sub !== input.keycloakSub) {
    throw new KeycloakAuthError('That email is already linked to another Keycloak account.', 409)
  }
  if (byEmail && !byEmail.keycloak_sub) {
    await linkKeycloakSubToUser(pool, byEmail.id, input.keycloakSub)
    await syncKeycloakEmailVerified(pool, byEmail.id, input.emailVerified)
    const row = await findUserById(pool, byEmail.id)
    if (!row) throw new KeycloakAuthError('User update failed.', 500)
    return row
  }

  const id = await insertUserFromKeycloak(pool, {
    email: input.email,
    fullName: input.fullName,
    keycloakSub: input.keycloakSub,
    role: 'customer',
    emailVerified: input.emailVerified,
  })
  const row = await findUserById(pool, id)
  if (!row) throw new KeycloakAuthError('User creation failed.', 500)
  return row
}
