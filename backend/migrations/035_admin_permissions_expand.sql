/* Expand admin RBAC: add shipping, disputes, merchant-hours, and catalogue-admin permissions. */

SET NOCOUNT ON;

/* Add new permissions (skip if code already exists). */
IF OBJECT_ID(N'dbo.rbac_permissions', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'shipping.view')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'shipping.view', N'View shipping zones and rates');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'shipping.manage')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'shipping.manage', N'Manage shipping zones and rates');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'disputes.view')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'disputes.view', N'View order disputes');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'disputes.manage')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'disputes.manage', N'Manage and resolve order disputes');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'merchant_hours.view')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'merchant_hours.view', N'View merchant operating hours');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'merchant_hours.manage')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'merchant_hours.manage', N'Manage merchant operating hours');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'catalogue.import')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'catalogue.import', N'Bulk import products via CSV');

  IF NOT EXISTS (SELECT 1 FROM dbo.rbac_permissions WHERE code = N'promotions.manage')
    INSERT INTO dbo.rbac_permissions (code, description) VALUES (N'promotions.manage', N'Manage store promotions and banners');
END;
GO

/* Grant all permissions that the admin role doesn't yet have. */
IF OBJECT_ID(N'dbo.rbac_role_permissions', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.rbac_roles', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.rbac_permissions', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.rbac_role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM dbo.rbac_roles r
  CROSS JOIN dbo.rbac_permissions p
  WHERE r.code = N'admin'
    AND NOT EXISTS (
      SELECT 1 FROM dbo.rbac_role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );
END;
GO
