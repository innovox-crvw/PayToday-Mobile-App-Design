/* Businesses, user–business membership, optional business_id on products, extended user profile columns.
   Path A: additive tenancy; existing catalogue (products + product_variants) unchanged.
   Runs before 019_product_variant_package_dimensions and 020_businesses_merchant_profile (lexical order). */

IF OBJECT_ID(N'dbo.businesses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.businesses (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_businesses PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    name NVARCHAR(300) NOT NULL,
    registration_number NVARCHAR(120) NULL,
    vat_number NVARCHAR(80) NULL,
    email NVARCHAR(320) NULL,
    phone NVARCHAR(40) NULL,
    address NVARCHAR(500) NULL,
    country NVARCHAR(120) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_businesses_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_businesses_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NULL
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UQ_businesses_registration_number' AND object_id = OBJECT_ID(N'dbo.businesses')
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UQ_businesses_registration_number
    ON dbo.businesses(registration_number)
    WHERE registration_number IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.user_businesses', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_businesses (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_user_businesses PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_user_businesses_user REFERENCES dbo.users(id) ON DELETE CASCADE,
    business_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_user_businesses_business REFERENCES dbo.businesses(id) ON DELETE CASCADE,
    role NVARCHAR(64) NOT NULL CONSTRAINT DF_user_businesses_role DEFAULT (N'member'),
    is_primary BIT NOT NULL CONSTRAINT DF_user_businesses_primary DEFAULT (0),
    joined_at DATETIME2 NOT NULL CONSTRAINT DF_user_businesses_joined DEFAULT (SYSUTCDATETIME()),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_user_businesses_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NULL,
    CONSTRAINT UQ_user_businesses_user_business UNIQUE (user_id, business_id)
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UQ_user_businesses_one_primary' AND object_id = OBJECT_ID(N'dbo.user_businesses')
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UQ_user_businesses_one_primary
    ON dbo.user_businesses(user_id)
    WHERE is_primary = 1;
END;
GO

IF COL_LENGTH(N'dbo.users', N'first_name') IS NULL
  ALTER TABLE dbo.users ADD first_name NVARCHAR(120) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'last_name') IS NULL
  ALTER TABLE dbo.users ADD last_name NVARCHAR(120) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'phone') IS NULL
  ALTER TABLE dbo.users ADD phone NVARCHAR(40) NULL;
GO

IF COL_LENGTH(N'dbo.users', N'is_active') IS NULL
  ALTER TABLE dbo.users ADD is_active BIT NOT NULL CONSTRAINT DF_users_is_active DEFAULT (1);
GO

IF COL_LENGTH(N'dbo.products', N'business_id') IS NULL
BEGIN
  ALTER TABLE dbo.products ADD business_id UNIQUEIDENTIFIER NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_products_business' AND parent_object_id = OBJECT_ID(N'dbo.products')
)
BEGIN
  ALTER TABLE dbo.products
    ADD CONSTRAINT FK_products_business FOREIGN KEY (business_id) REFERENCES dbo.businesses(id);
END;
GO

DECLARE @defaultBusinessId UNIQUEIDENTIFIER = N'E0000000-0000-4000-8000-000000000001';

IF NOT EXISTS (SELECT 1 FROM dbo.businesses WHERE id = @defaultBusinessId)
BEGIN
  INSERT INTO dbo.businesses (id, name, registration_number, vat_number, email, phone, address, country, is_active)
  VALUES (@defaultBusinessId, N'Default store', NULL, NULL, NULL, NULL, NULL, NULL, 1);
END;
GO

DECLARE @defaultBusinessId UNIQUEIDENTIFIER = N'E0000000-0000-4000-8000-000000000001';

UPDATE dbo.products
SET business_id = @defaultBusinessId
WHERE business_id IS NULL;
GO

DECLARE @defaultBusinessId UNIQUEIDENTIFIER = N'E0000000-0000-4000-8000-000000000001';

INSERT INTO dbo.user_businesses (id, user_id, business_id, role, is_primary, joined_at, created_at)
SELECT NEWID(), u.id, @defaultBusinessId, N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()
FROM dbo.users u
WHERE u.role IN (N'admin', N'ops', N'fulfillment')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.user_businesses ub WHERE ub.user_id = u.id AND ub.business_id = @defaultBusinessId
  );
GO
