/* RBAC core: roles, permissions, role<->permission mapping, user<->role grants, direct-permission grants, audit log. */

IF OBJECT_ID(N'dbo.rbac_roles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rbac_roles (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_rbac_roles PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    code NVARCHAR(80) NOT NULL,
    display_name NVARCHAR(200) NOT NULL,
    description NVARCHAR(1000) NULL,
    is_system BIT NOT NULL CONSTRAINT DF_rbac_roles_is_system DEFAULT (0),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_rbac_roles_created_at DEFAULT (SYSUTCDATETIME())
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_rbac_roles_code ON dbo.rbac_roles (code);

  INSERT INTO dbo.rbac_roles (code, display_name, is_system) VALUES
    (N'admin',    N'Administrator', 1),
    (N'staff',    N'Staff',         1),
    (N'merchant', N'Merchant',      1),
    (N'customer', N'Customer',      1);
END;
GO

IF OBJECT_ID(N'dbo.rbac_permissions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rbac_permissions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_rbac_permissions PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    code NVARCHAR(200) NOT NULL,
    description NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_rbac_permissions_created_at DEFAULT (SYSUTCDATETIME())
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_rbac_permissions_code ON dbo.rbac_permissions (code);

  INSERT INTO dbo.rbac_permissions (code, description) VALUES
    (N'admin.access',          N'Access admin panel'),
    (N'orders.view',           N'View orders'),
    (N'orders.manage',         N'Manage orders'),
    (N'products.view',         N'View products'),
    (N'products.manage',       N'Manage products'),
    (N'users.view',            N'View users'),
    (N'users.manage',          N'Manage users'),
    (N'reports.view',          N'View reports'),
    (N'fulfillment.view',      N'View fulfillment tasks'),
    (N'fulfillment.manage',    N'Manage fulfillment tasks');
END;
GO

IF OBJECT_ID(N'dbo.rbac_role_permissions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rbac_role_permissions (
    role_id UNIQUEIDENTIFIER NOT NULL,
    permission_id UNIQUEIDENTIFIER NOT NULL,
    granted_at DATETIME2 NOT NULL CONSTRAINT DF_rbac_rp_granted_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_rbac_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT FK_rbac_rp_role FOREIGN KEY (role_id) REFERENCES dbo.rbac_roles (id) ON DELETE CASCADE,
    CONSTRAINT FK_rbac_rp_perm FOREIGN KEY (permission_id) REFERENCES dbo.rbac_permissions (id) ON DELETE CASCADE
  );

  /* Grant all core permissions to the admin role */
  INSERT INTO dbo.rbac_role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM dbo.rbac_roles r
  CROSS JOIN dbo.rbac_permissions p
  WHERE r.code = N'admin';
END;
GO

IF OBJECT_ID(N'dbo.rbac_user_roles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rbac_user_roles (
    user_id UNIQUEIDENTIFIER NOT NULL,
    role_id UNIQUEIDENTIFIER NOT NULL,
    granted_by NVARCHAR(36) NULL,
    granted_at DATETIME2 NOT NULL CONSTRAINT DF_rbac_ur_granted_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_rbac_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT FK_rbac_ur_role FOREIGN KEY (role_id) REFERENCES dbo.rbac_roles (id) ON DELETE CASCADE
  );
  CREATE NONCLUSTERED INDEX IX_rbac_user_roles_user ON dbo.rbac_user_roles (user_id);
END;
GO

IF OBJECT_ID(N'dbo.rbac_direct_permissions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rbac_direct_permissions (
    user_id UNIQUEIDENTIFIER NOT NULL,
    permission_id UNIQUEIDENTIFIER NOT NULL,
    granted_by NVARCHAR(36) NULL,
    expires_at DATETIME2 NULL,
    granted_at DATETIME2 NOT NULL CONSTRAINT DF_rbac_dp_granted_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_rbac_direct_permissions PRIMARY KEY (user_id, permission_id),
    CONSTRAINT FK_rbac_dp_perm FOREIGN KEY (permission_id) REFERENCES dbo.rbac_permissions (id) ON DELETE CASCADE
  );
  CREATE NONCLUSTERED INDEX IX_rbac_direct_permissions_user ON dbo.rbac_direct_permissions (user_id);
END;
GO

IF OBJECT_ID(N'dbo.rbac_permission_audit', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.rbac_permission_audit (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_rbac_permission_audit PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    action NVARCHAR(20) NOT NULL,
    target_user_id UNIQUEIDENTIFIER NULL,
    role_id UNIQUEIDENTIFIER NULL,
    permission_id UNIQUEIDENTIFIER NULL,
    performed_by NVARCHAR(36) NULL,
    detail NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_rbac_audit_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_rbac_audit_action CHECK (action IN (N'grant_role', N'revoke_role', N'grant_perm', N'revoke_perm'))
  );
  CREATE NONCLUSTERED INDEX IX_rbac_perm_audit_user ON dbo.rbac_permission_audit (user_id, created_at DESC);
END;
GO
