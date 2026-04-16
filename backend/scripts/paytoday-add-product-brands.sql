/*
  Add retailer columns on products + tag sample groceries as Spar.
  Or run: npm run db:migrate (applies backend/migrations/001_product_brands.sql).
*/
USE [paytoday];
GO

IF COL_LENGTH('dbo.products', 'brand_slug') IS NULL
  ALTER TABLE dbo.products ADD brand_slug NVARCHAR(80) NULL;

IF COL_LENGTH('dbo.products', 'brand_name') IS NULL
  ALTER TABLE dbo.products ADD brand_name NVARCHAR(160) NULL;
GO

UPDATE dbo.products
SET brand_slug = N'spar', brand_name = N'Spar'
WHERE slug IN (N'full-cream-milk', N'brown-bread') AND (brand_slug IS NULL OR brand_slug = N'');

PRINT N'Product brand columns ready.';
GO
