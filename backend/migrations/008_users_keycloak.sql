/* Keycloak / OIDC users: password not used; link by keycloak_sub */
ALTER TABLE dbo.users ALTER COLUMN password_hash NVARCHAR(500) NULL;
GO

IF COL_LENGTH('dbo.users', 'keycloak_sub') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD keycloak_sub NVARCHAR(255) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_users_keycloak_sub' AND object_id = OBJECT_ID('dbo.users'))
BEGIN
  CREATE UNIQUE INDEX UQ_users_keycloak_sub ON dbo.users(keycloak_sub) WHERE keycloak_sub IS NOT NULL;
END;
GO
