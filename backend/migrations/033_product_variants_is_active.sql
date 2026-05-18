/* Add is_active flag to product_variants so individual SKUs can be toggled without deleting them. */

IF COL_LENGTH(N'dbo.product_variants', N'is_active') IS NULL
BEGIN
  ALTER TABLE dbo.product_variants ADD is_active BIT NOT NULL CONSTRAINT DF_product_variants_is_active DEFAULT (1);
END;
GO

/* Index to speed up storefront queries that filter active variants only. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'IX_product_variants_is_active'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_product_variants_is_active ON dbo.product_variants (is_active);
END;
GO
