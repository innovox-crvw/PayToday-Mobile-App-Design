/* Per-product storefront tab copy: delivery, returns, warranty, what's in the box. */

IF COL_LENGTH(N'dbo.products', N'delivery_information') IS NULL
  ALTER TABLE dbo.products ADD delivery_information NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.products', N'return_policy') IS NULL
  ALTER TABLE dbo.products ADD return_policy NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.products', N'warranty_info') IS NULL
  ALTER TABLE dbo.products ADD warranty_info NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.products', N'whats_in_the_box') IS NULL
  ALTER TABLE dbo.products ADD whats_in_the_box NVARCHAR(MAX) NULL;
