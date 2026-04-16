/* Retailer / in-store brand for product detail "visit store" and shop filtering. */
IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.products', N'brand_slug') IS NULL
  ALTER TABLE dbo.products ADD brand_slug NVARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.products', N'brand_name') IS NULL
  ALTER TABLE dbo.products ADD brand_name NVARCHAR(160) NULL;
GO

/* Must be a new batch: SQL Server compiles the whole batch first, so UPDATE cannot
   reference columns added in the same batch as the ALTER above. */
IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL
BEGIN
  UPDATE dbo.products
  SET brand_slug = N'spar', brand_name = N'Spar'
  WHERE slug IN (N'full-cream-milk', N'brown-bread') AND (brand_slug IS NULL OR brand_slug = N'');
END;
GO
