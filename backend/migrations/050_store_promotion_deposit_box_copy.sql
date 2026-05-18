/* store_promotions: create table if absent; add deposit_box_copy marketing field. */

IF OBJECT_ID(N'dbo.store_promotions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.store_promotions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_store_promotions PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    slug NVARCHAR(120) NOT NULL,
    title NVARCHAR(300) NOT NULL,
    subtitle NVARCHAR(500) NULL,
    image_url NVARCHAR(2000) NULL,
    link_path NVARCHAR(500) NULL,
    sort_order INT NOT NULL CONSTRAINT DF_sp_sort_order DEFAULT (0),
    is_active BIT NOT NULL CONSTRAINT DF_sp_is_active DEFAULT (1),
    starts_at DATETIME2 NULL,
    ends_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_sp_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_sp_updated_at DEFAULT (SYSUTCDATETIME())
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_store_promotions_slug ON dbo.store_promotions (slug);
  CREATE NONCLUSTERED INDEX IX_store_promotions_active ON dbo.store_promotions (is_active, sort_order);
END;
GO

/* Separate marketing copy shown on the deposit-box / pickup flow. */
IF COL_LENGTH(N'dbo.store_promotions', N'deposit_box_copy') IS NULL
BEGIN
  ALTER TABLE dbo.store_promotions ADD deposit_box_copy NVARCHAR(500) NULL;
END;
GO
