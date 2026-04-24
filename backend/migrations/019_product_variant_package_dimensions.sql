/* Per-variant package size and weight (mm / grams). Safe to run on existing DBs. */
IF COL_LENGTH(N'dbo.product_variants', N'package_length_mm') IS NULL
BEGIN
  ALTER TABLE dbo.product_variants ADD package_length_mm INT NULL;
END
GO
IF COL_LENGTH(N'dbo.product_variants', N'package_width_mm') IS NULL
BEGIN
  ALTER TABLE dbo.product_variants ADD package_width_mm INT NULL;
END
GO
IF COL_LENGTH(N'dbo.product_variants', N'package_height_mm') IS NULL
BEGIN
  ALTER TABLE dbo.product_variants ADD package_height_mm INT NULL;
END
GO
IF COL_LENGTH(N'dbo.product_variants', N'gross_weight_g') IS NULL
BEGIN
  ALTER TABLE dbo.product_variants ADD gross_weight_g INT NULL;
END
GO
