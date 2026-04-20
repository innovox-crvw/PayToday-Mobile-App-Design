/* Hierarchical categories, variant compare-at + inventory policy, variant options, variant-tied images */

IF COL_LENGTH('dbo.categories', 'parent_id') IS NULL
BEGIN
  ALTER TABLE dbo.categories ADD parent_id UNIQUEIDENTIFIER NULL;
  ALTER TABLE dbo.categories ADD CONSTRAINT FK_categories_parent
    FOREIGN KEY (parent_id) REFERENCES dbo.categories(id);
END
GO

IF COL_LENGTH('dbo.categories', 'is_active') IS NULL
  ALTER TABLE dbo.categories ADD is_active BIT NOT NULL CONSTRAINT DF_categories_active DEFAULT (1);
GO

IF COL_LENGTH('dbo.categories', 'sort_order') IS NULL
  ALTER TABLE dbo.categories ADD sort_order INT NOT NULL CONSTRAINT DF_categories_sort DEFAULT (0);
GO

IF COL_LENGTH('dbo.product_variants', 'compare_at_price_cents') IS NULL
  ALTER TABLE dbo.product_variants ADD compare_at_price_cents INT NULL;
GO

IF COL_LENGTH('dbo.product_variants', 'inventory_policy') IS NULL
  ALTER TABLE dbo.product_variants ADD inventory_policy NVARCHAR(20) NOT NULL CONSTRAINT DF_pv_invpol DEFAULT (N'track');
GO

IF OBJECT_ID(N'dbo.product_variant_options', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.product_variant_options (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_product_variant_options PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pvo_variant REFERENCES dbo.product_variants(id) ON DELETE CASCADE,
    option_name NVARCHAR(60) NOT NULL,
    option_value NVARCHAR(120) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_pvo_sort DEFAULT (0)
  );
  CREATE INDEX IX_product_variant_options_variant ON dbo.product_variant_options(variant_id);
END
GO

IF COL_LENGTH('dbo.product_images', 'variant_id') IS NULL
BEGIN
  ALTER TABLE dbo.product_images ADD variant_id UNIQUEIDENTIFIER NULL;
  ALTER TABLE dbo.product_images ADD CONSTRAINT FK_product_images_variant
    FOREIGN KEY (variant_id) REFERENCES dbo.product_variants(id);
END
GO
