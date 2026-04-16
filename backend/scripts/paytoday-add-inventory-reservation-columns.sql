/*
  Repair partial inventory_reservations installs (index exists but columns missing, etc.).
  Run in SSMS against your store database (adjust USE). Safe to re-run.
*/
USE [paytoday];
GO

IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NULL
BEGIN
  RAISERROR(N'dbo.inventory_reservations does not exist.', 16, 1);
  RETURN;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'dbo.inventory_reservations')
    AND i.name = N'UX_inventory_reservations_order_variant_wh'
)
  DROP INDEX UX_inventory_reservations_order_variant_wh ON dbo.inventory_reservations;
GO

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
GO

IF COL_LENGTH(N'dbo.inventory_reservations', N'variant_id') IS NULL
  ALTER TABLE dbo.inventory_reservations ADD variant_id UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH(N'dbo.inventory_reservations', N'warehouse_id') IS NULL
  ALTER TABLE dbo.inventory_reservations ADD warehouse_id UNIQUEIDENTIFIER NULL;
GO

IF COL_LENGTH(N'dbo.inventory_reservations', N'quantity') IS NULL
  ALTER TABLE dbo.inventory_reservations ADD quantity INT NOT NULL CONSTRAINT DF_inv_reservation_qty DEFAULT (0);
GO

IF COL_LENGTH(N'dbo.inventory_reservations', N'variant_id') IS NOT NULL
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

/* Hub payee list column (separate error you may see in API logs). */
IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.hub_payment_category_items', N'payment_method') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
GO
