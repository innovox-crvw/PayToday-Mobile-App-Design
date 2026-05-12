/* Remove is_super_deal flag from products (superseded by compare_at_price_cents discount detection). */

/* Drop the filtered index first; SQL Server requires this before dropping the column. */
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.products') AND name = N'IX_products_is_super_deal'
)
BEGIN
  DROP INDEX IX_products_is_super_deal ON dbo.products;
END;
GO

IF COL_LENGTH(N'dbo.products', N'is_super_deal') IS NOT NULL
BEGIN
  ALTER TABLE dbo.products DROP CONSTRAINT IF EXISTS DF_products_is_super_deal;
  ALTER TABLE dbo.products DROP COLUMN is_super_deal;
END;
GO

/* Also remove the personalization key added in 042 if it was never used. */
IF COL_LENGTH(N'dbo.users', N'home_personalization_key') IS NOT NULL
BEGIN
  ALTER TABLE dbo.users DROP COLUMN home_personalization_key;
END;
GO
