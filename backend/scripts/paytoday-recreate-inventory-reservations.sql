/*
  Recreate dbo.inventory_reservations (order line holds: order_id, variant_id, warehouse_id, quantity).

  Why you may see confusing errors elsewhere:
  - "Invalid column name variant_id" / "column does not exist": repair scripts (or FK/index DDL)
    ran against a table that never got those columns (wrong object name, wrong database, or only
    part of a script executed in SSMS without GO batches).
  - "Index ... already exists": CREATE INDEX ran twice, or a repair script tried to CREATE while
    the index was still there. This script drops the whole table first so the index goes with it.
  - "Invalid column name payment_method": that is on dbo.hub_payment_category_items, not
    inventory_reservations — add the column (batch at end) or run npm run db:migrate / db:fix-columns.

  Set USE to your real database. Run the whole file (Ctrl+Shift+E in SSMS), not a highlighted slice.

  Requires: dbo.product_variants, dbo.warehouses (FK targets). order_id must match dbo.orders.id
  at application level (no FK in schema).
*/
USE [paytoday];
GO

/* Drop typo name if someone created dbo.inventory_reservation (singular). */
DROP TABLE IF EXISTS dbo.inventory_reservation;
GO

DROP TABLE IF EXISTS dbo.inventory_reservations;
GO

CREATE TABLE dbo.inventory_reservations (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_inv_res PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL,
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_inv_res_variant REFERENCES dbo.product_variants(id),
  warehouse_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_inv_res_warehouse REFERENCES dbo.warehouses(id),
  quantity INT NOT NULL CONSTRAINT DF_inv_res_line_qty DEFAULT (0)
);
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'dbo.inventory_reservations', N'U')
    AND i.name = N'UX_inventory_reservations_order_variant_wh'
)
  CREATE UNIQUE NONCLUSTERED INDEX UX_inventory_reservations_order_variant_wh
    ON dbo.inventory_reservations(order_id, variant_id, warehouse_id);
GO

/* Hub drill-down column (fixes "Invalid column name payment_method" from API/queries). */
IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.hub_payment_category_items', N'payment_method') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
GO

PRINT N'dbo.inventory_reservations ready; hub_payment_category_items.payment_method checked.';
GO
