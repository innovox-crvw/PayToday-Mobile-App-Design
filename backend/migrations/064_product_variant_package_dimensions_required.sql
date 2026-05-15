/* Every variant must have outer package L × W × H (mm). Backfill nulls, then NOT NULL + defaults for new rows.
   Depends on 019_product_variant_package_dimensions.sql. Safe to re-run. */
IF COL_LENGTH(N'dbo.product_variants', N'package_length_mm') IS NOT NULL
   AND COL_LENGTH(N'dbo.product_variants', N'package_width_mm') IS NOT NULL
   AND COL_LENGTH(N'dbo.product_variants', N'package_height_mm') IS NOT NULL
BEGIN
  UPDATE dbo.product_variants
  SET
    package_length_mm = COALESCE(package_length_mm, 200),
    package_width_mm = COALESCE(package_width_mm, 150),
    package_height_mm = COALESCE(package_height_mm, 100)
  WHERE package_length_mm IS NULL
     OR package_width_mm IS NULL
     OR package_height_mm IS NULL;
END
GO

IF COL_LENGTH(N'dbo.product_variants', N'package_length_mm') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints
     WHERE parent_object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'DF_pv_package_length_mm'
   )
BEGIN
  ALTER TABLE dbo.product_variants ADD CONSTRAINT DF_pv_package_length_mm DEFAULT (200) FOR package_length_mm;
END
GO

IF COL_LENGTH(N'dbo.product_variants', N'package_width_mm') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints
     WHERE parent_object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'DF_pv_package_width_mm'
   )
BEGIN
  ALTER TABLE dbo.product_variants ADD CONSTRAINT DF_pv_package_width_mm DEFAULT (150) FOR package_width_mm;
END
GO

IF COL_LENGTH(N'dbo.product_variants', N'package_height_mm') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints
     WHERE parent_object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'DF_pv_package_height_mm'
   )
BEGIN
  ALTER TABLE dbo.product_variants ADD CONSTRAINT DF_pv_package_height_mm DEFAULT (100) FOR package_height_mm;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'package_length_mm' AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.product_variants ALTER COLUMN package_length_mm INT NOT NULL;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'package_width_mm' AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.product_variants ALTER COLUMN package_width_mm INT NOT NULL;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.product_variants') AND name = N'package_height_mm' AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.product_variants ALTER COLUMN package_height_mm INT NOT NULL;
END
GO
