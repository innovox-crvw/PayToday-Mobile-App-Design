/* Super-deals section on the home screen: flag products individually as featured deals. */
/* NOTE: is_super_deal is removed again in migration 049; compare_at_price_cents supersedes it. */

IF COL_LENGTH(N'dbo.products', N'is_super_deal') IS NULL
BEGIN
  ALTER TABLE dbo.products ADD is_super_deal BIT NOT NULL CONSTRAINT DF_products_is_super_deal DEFAULT (0);
END;
GO

/* Lightweight index so the home screen query can filter featured products cheaply. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'IX_products_is_super_deal'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_products_is_super_deal ON dbo.products (is_super_deal)
  WHERE is_super_deal = 1;
END;
GO

/* Personalization key per user for home-screen ordering (future use). */
IF COL_LENGTH(N'dbo.users', N'home_personalization_key') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD home_personalization_key NVARCHAR(80) NULL;
END;
GO
