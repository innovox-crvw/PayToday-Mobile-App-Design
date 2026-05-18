/* Add shipping.view / shipping.manage permissions and grant them to the admin role. */

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.rbac_permissions', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'shipping.view')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'shipping.view', N'View shipping zones and rates');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'shipping.manage')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'shipping.manage', N'Manage shipping zones and rates');
END;
GO

IF OBJECT_ID(N'dbo.rbac_role_permissions', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.rbac_roles', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.rbac_permissions', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.rbac_role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM dbo.rbac_roles r
  CROSS JOIN dbo.rbac_permissions p
  WHERE r.code = N'admin'
    AND p.code IN (N'shipping.view', N'shipping.manage')
    AND NOT EXISTS (
      SELECT 1 FROM dbo.rbac_role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );
END;
GO
