/*
  Add missing columns — ONE ALTER per batch (GO) so SQL Server updates catalog between steps.
  SSMS: open file, set USE to your DB name, Execute.

  Or from project root: npm run db:fix-columns  (uses Initial Catalog from SQL_CONNECTION_STRING)
*/
USE [paytoday];
GO

IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.products', N'brand_slug') IS NULL
  ALTER TABLE dbo.products ADD brand_slug NVARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.products', N'brand_name') IS NULL
  ALTER TABLE dbo.products ADD brand_name NVARCHAR(160) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'hub_kind') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD hub_kind NVARCHAR(32) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'slug') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD slug NVARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'label') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD label NVARCHAR(160) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'icon_key') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD icon_key NVARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'list_style') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD list_style NVARCHAR(20) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'link_path') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD link_path NVARCHAR(256) NULL;
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'sort_order') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD sort_order INT NOT NULL CONSTRAINT DF_pt_missing_hub_nav_sort DEFAULT (0);
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'is_active') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD is_active BIT NOT NULL CONSTRAINT DF_pt_missing_hub_nav_active DEFAULT (1);
GO

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_navigation_tiles', N'payment_methods_caption') IS NULL
  ALTER TABLE dbo.hub_navigation_tiles ADD payment_methods_caption NVARCHAR(200) NULL;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'category_slug') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD category_slug NVARCHAR(80) NULL;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'item_kind') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD item_kind NVARCHAR(20) NULL;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'display_name') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD display_name NVARCHAR(300) NULL;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'initials') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD initials NVARCHAR(20) NULL;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'sort_order') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD sort_order INT NOT NULL CONSTRAINT DF_pt_missing_hub_item_sort DEFAULT (0);
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'is_active') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD is_active BIT NOT NULL CONSTRAINT DF_pt_missing_hub_item_active DEFAULT (1);
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.hub_payment_category_items', N'payment_method') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM sys.indexes i
   WHERE i.object_id = OBJECT_ID(N'dbo.inventory_reservations')
     AND i.name = N'UX_inventory_reservations_order_variant_wh'
 )
  DROP INDEX UX_inventory_reservations_order_variant_wh ON dbo.inventory_reservations;
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
BEGIN
  DECLARE @cn sysname;
  DECLARE @drop nvarchar(400);
  DECLARE fkcur CURSOR LOCAL FAST_FORWARD FOR
    SELECT f.name
    FROM sys.foreign_keys f
    WHERE f.parent_object_id = OBJECT_ID(N'dbo.inventory_reservations');
  OPEN fkcur;
  FETCH NEXT FROM fkcur INTO @cn;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @drop = N'ALTER TABLE dbo.inventory_reservations DROP CONSTRAINT ' + QUOTENAME(@cn) + N';';
    EXEC sp_executesql @drop;
    FETCH NEXT FROM fkcur INTO @cn;
  END
  CLOSE fkcur;
  DEALLOCATE fkcur;
END;
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.inventory_reservations', N'variant_id') IS NULL
  ALTER TABLE dbo.inventory_reservations ADD variant_id UNIQUEIDENTIFIER NULL;
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.inventory_reservations', N'warehouse_id') IS NULL
  ALTER TABLE dbo.inventory_reservations ADD warehouse_id UNIQUEIDENTIFIER NULL;
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.inventory_reservations', N'quantity') IS NULL
  ALTER TABLE dbo.inventory_reservations ADD quantity INT NOT NULL CONSTRAINT DF_pt_missing_inv_res_qty DEFAULT (0);
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.inventory_reservations', N'variant_id') IS NOT NULL
  DELETE FROM dbo.inventory_reservations WHERE variant_id IS NULL;
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.inventory_reservations', N'variant_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.inventory_reservations')
      AND referenced_object_id = OBJECT_ID(N'dbo.product_variants')
  )
  EXEC (N'ALTER TABLE dbo.inventory_reservations ADD CONSTRAINT FK_inventory_reservations_variant FOREIGN KEY (variant_id) REFERENCES dbo.product_variants(id);');
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.inventory_reservations', N'warehouse_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.inventory_reservations')
      AND referenced_object_id = OBJECT_ID(N'dbo.warehouses')
  )
  EXEC (N'ALTER TABLE dbo.inventory_reservations ADD CONSTRAINT FK_inventory_reservations_warehouse FOREIGN KEY (warehouse_id) REFERENCES dbo.warehouses(id);');
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.inventory_reservations', N'order_id') IS NOT NULL
  AND COL_LENGTH(N'dbo.inventory_reservations', N'variant_id') IS NOT NULL
  AND COL_LENGTH(N'dbo.inventory_reservations', N'warehouse_id') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1 FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.inventory_reservations')
      AND i.name = N'UX_inventory_reservations_order_variant_wh'
  )
    EXEC (N'DROP INDEX UX_inventory_reservations_order_variant_wh ON dbo.inventory_reservations;');
  IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.inventory_reservations')
      AND i.name = N'UX_inventory_reservations_order_variant_wh'
  )
    EXEC (N'CREATE UNIQUE NONCLUSTERED INDEX UX_inventory_reservations_order_variant_wh ON dbo.inventory_reservations(order_id, variant_id, warehouse_id);');
END;
GO

/* 017: Keycloak pre-provision sign-in throttle (run npm run db:migrate for schema_migrations bookkeeping) */
IF OBJECT_ID(N'dbo.keycloak_login_throttle', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.keycloak_login_throttle (
    email_normalized NVARCHAR(320) NOT NULL CONSTRAINT PK_keycloak_login_throttle PRIMARY KEY,
    failed_count INT NOT NULL CONSTRAINT DF_keycloak_login_throttle_failed DEFAULT (0),
    locked_until DATETIME2 NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_keycloak_login_throttle_updated DEFAULT (SYSUTCDATETIME())
  );
END;
GO

PRINT N'paytoday-add-missing-columns.sql finished.';
GO
