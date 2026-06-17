import type { ConnectionPool } from 'mssql'
import { columnExists } from '../db/columnExists.js'

export interface RbacRole {
  id: string
  code: string
  display_name: string
  description: string | null
  is_system: boolean
}

export interface RbacPermission {
  id: string
  code: string
  description: string | null
}

export async function listRoles(pool: ConnectionPool): Promise<RbacRole[]> {
  const hasDesc = await columnExists(pool, 'rbac_roles.description')
  const r = await pool.request().query<RbacRole>(
    hasDesc
      ? `
    SELECT CAST(id AS NVARCHAR(36)) AS id, code, display_name, description,
      CAST(is_system AS BIT) AS is_system
    FROM dbo.rbac_roles ORDER BY display_name
  `
      : `
    SELECT CAST(id AS NVARCHAR(36)) AS id, code, display_name,
      CAST(NULL AS NVARCHAR(1000)) AS description,
      CAST(is_system AS BIT) AS is_system
    FROM dbo.rbac_roles ORDER BY display_name
  `,
  )
  return r.recordset
}

export async function listPermissions(pool: ConnectionPool): Promise<RbacPermission[]> {
  const hasDesc = await columnExists(pool, 'rbac_permissions.description')
  const r = await pool.request().query<RbacPermission>(
    hasDesc
      ? `
    SELECT CAST(id AS NVARCHAR(36)) AS id, code, description
    FROM dbo.rbac_permissions ORDER BY code
  `
      : `
    SELECT CAST(id AS NVARCHAR(36)) AS id, code,
      CAST(NULL AS NVARCHAR(1000)) AS description
    FROM dbo.rbac_permissions ORDER BY code
  `,
  )
  return r.recordset
}

export async function getUserRoles(pool: ConnectionPool, userId: string): Promise<RbacRole[]> {
  const hasDesc = await columnExists(pool, 'rbac_roles.description')
  const r = await pool
    .request()
    .input('uid', userId)
    .query<RbacRole>(
      hasDesc
        ? `
      SELECT CAST(ro.id AS NVARCHAR(36)) AS id, ro.code, ro.display_name, ro.description,
        CAST(ro.is_system AS BIT) AS is_system
      FROM dbo.rbac_user_roles ur
      INNER JOIN dbo.rbac_roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = @uid
      ORDER BY ro.display_name
    `
        : `
      SELECT CAST(ro.id AS NVARCHAR(36)) AS id, ro.code, ro.display_name,
        CAST(NULL AS NVARCHAR(1000)) AS description,
        CAST(ro.is_system AS BIT) AS is_system
      FROM dbo.rbac_user_roles ur
      INNER JOIN dbo.rbac_roles ro ON ro.id = ur.role_id
      WHERE ur.user_id = @uid
      ORDER BY ro.display_name
    `,
    )
  return r.recordset
}

export async function getUserPermissions(pool: ConnectionPool, userId: string): Promise<string[]> {
  const r = await pool
    .request()
    .input('uid', userId)
    .query<{ code: string }>(`
      SELECT DISTINCT p.code
      FROM dbo.rbac_user_roles ur
      INNER JOIN dbo.rbac_role_permissions rp ON rp.role_id = ur.role_id
      INNER JOIN dbo.rbac_permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = @uid
      UNION
      SELECT p.code
      FROM dbo.rbac_direct_permissions dp
      INNER JOIN dbo.rbac_permissions p ON p.id = dp.permission_id
      WHERE dp.user_id = @uid
        AND (dp.expires_at IS NULL OR dp.expires_at > SYSUTCDATETIME())
    `)
  return r.recordset.map((x) => x.code)
}

export async function hasPermission(pool: ConnectionPool, userId: string, code: string): Promise<boolean> {
  const r = await pool
    .request()
    .input('uid', userId)
    .input('code', code)
    .query<{ n: number }>(`
      SELECT COUNT(1) AS n
      FROM (
        SELECT p.code
        FROM dbo.rbac_user_roles ur
        INNER JOIN dbo.rbac_role_permissions rp ON rp.role_id = ur.role_id
        INNER JOIN dbo.rbac_permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = @uid AND p.code = @code
        UNION ALL
        SELECT p.code
        FROM dbo.rbac_direct_permissions dp
        INNER JOIN dbo.rbac_permissions p ON p.id = dp.permission_id
        WHERE dp.user_id = @uid AND p.code = @code
          AND (dp.expires_at IS NULL OR dp.expires_at > SYSUTCDATETIME())
      ) x
    `)
  return (r.recordset[0]?.n ?? 0) > 0
}

export async function grantRoleToUser(
  pool: ConnectionPool,
  userId: string,
  roleId: string,
  grantedBy: string | null,
): Promise<void> {
  await pool
    .request()
    .input('uid', userId)
    .input('rid', roleId)
    .input('by', grantedBy)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.rbac_user_roles WHERE user_id = @uid AND role_id = @rid)
        INSERT INTO dbo.rbac_user_roles (user_id, role_id, granted_by) VALUES (@uid, @rid, @by)
    `)
}

export async function revokeRoleFromUser(pool: ConnectionPool, userId: string, roleId: string): Promise<void> {
  await pool
    .request()
    .input('uid', userId)
    .input('rid', roleId)
    .query(`DELETE FROM dbo.rbac_user_roles WHERE user_id = @uid AND role_id = @rid`)
}

export async function listAuditLog(
  pool: ConnectionPool,
  limit = 100,
): Promise<
  {
    id: string
    user_id: string
    user_email: string | null
    action: string
    target_user_id: string | null
    target_email: string | null
    role_code: string | null
    permission_code: string | null
    performed_by: string | null
    detail: string | null
    created_at: string
  }[]
> {
  const r = await pool.request().input('lim', limit).query<{
    id: string; user_id: string; user_email: string | null; action: string;
    target_user_id: string | null; target_email: string | null; role_code: string | null;
    permission_code: string | null; performed_by: string | null; detail: string | null; created_at: string
  }>(`
    SELECT TOP (@lim)
      CAST(a.id AS NVARCHAR(36)) AS id,
      CAST(a.user_id AS NVARCHAR(36)) AS user_id,
      u.email AS user_email,
      a.action,
      CAST(a.target_user_id AS NVARCHAR(36)) AS target_user_id,
      tu.email AS target_email,
      ro.code AS role_code,
      pe.code AS permission_code,
      a.performed_by,
      a.detail,
      CONVERT(NVARCHAR(30), a.created_at, 127) AS created_at
    FROM dbo.rbac_permission_audit a
    LEFT JOIN dbo.users u ON u.id = a.user_id
    LEFT JOIN dbo.users tu ON tu.id = a.target_user_id
    LEFT JOIN dbo.rbac_roles ro ON ro.id = a.role_id
    LEFT JOIN dbo.rbac_permissions pe ON pe.id = a.permission_id
    ORDER BY a.created_at DESC
  `)
  return r.recordset
}
