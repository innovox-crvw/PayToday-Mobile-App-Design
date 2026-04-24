/*
  Dev / QA: remove catalogue and dependent commercial rows (orders, carts, stock movements, etc.)
  while KEEPING dbo.users, dbo.businesses, dbo.categories, warehouses, hub tables, integration_settings,
  dbo.schema_migrations, dbo.notification_outbox, dbo.keycloak_login_throttle.

  Same dependency ordering as reset-users-and-catalog.sql steps [1/8]–[5/8] only (stops after products).

  Run:
    sqlcmd -S SERVER -d paytoday -E -C -b -i backend/scripts/wipe-catalog-keep-users.sql

  Then run nictus-three-merchants-seed.sql or recreate products via Admin / CSV.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

BEGIN TRY
  BEGIN TRAN;

  PRINT N'[1/5] Returns / order satellites...';
  IF OBJECT_ID(N'dbo.return_case_lines', N'U') IS NOT NULL
    DELETE FROM dbo.return_case_lines;
  IF OBJECT_ID(N'dbo.return_cases', N'U') IS NOT NULL
    DELETE FROM dbo.return_cases;
  IF OBJECT_ID(N'dbo.return_requests', N'U') IS NOT NULL
    DELETE FROM dbo.return_requests;

  IF OBJECT_ID(N'dbo.pickup_codes', N'U') IS NOT NULL
    DELETE FROM dbo.pickup_codes;
  IF OBJECT_ID(N'dbo.fulfillment_tasks', N'U') IS NOT NULL
    DELETE FROM dbo.fulfillment_tasks;

  PRINT N'[2/5] Payments and orders...';
  IF OBJECT_ID(N'dbo.payments', N'U') IS NOT NULL
    DELETE FROM dbo.payments;
  IF OBJECT_ID(N'dbo.payment_return_events', N'U') IS NOT NULL
    DELETE FROM dbo.payment_return_events;
  IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL
    DELETE FROM dbo.orders;

  PRINT N'[3/5] Inventory holds and movements...';
  IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
    DELETE FROM dbo.inventory_reservations;
  IF OBJECT_ID(N'dbo.stock_movements', N'U') IS NOT NULL
    DELETE FROM dbo.stock_movements;

  PRINT N'[4/5] Carts...';
  IF OBJECT_ID(N'dbo.cart_lines', N'U') IS NOT NULL
    DELETE FROM dbo.cart_lines;
  IF OBJECT_ID(N'dbo.carts', N'U') IS NOT NULL
    DELETE FROM dbo.carts;

  PRINT N'[5/5] Products (cascades variants, images, options, inventory_quantity)...';
  IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL
    DELETE FROM dbo.products;

  COMMIT TRAN;
  PRINT N'wipe-catalog-keep-users: COMMIT complete. Users and businesses were not modified.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
  DECLARE @sev INT = ERROR_SEVERITY();
  DECLARE @st INT = ERROR_STATE();
  RAISERROR(N'wipe-catalog-keep-users failed: %s', @sev, @st, @msg);
END CATCH;
