/*
  Dev / QA reset: remove all users and catalogue (products + variants + related rows) while keeping
  dbo.businesses, dbo.categories, warehouses, hub tables, integration_settings, schema_migrations.

  Run in SSMS against the paytoday database, or:
    sqlcmd -S SERVER -d paytoday -E -i backend/scripts/reset-users-and-catalog.sql

  After run: register fresh accounts; promote one to admin; link user_businesses; recreate catalogue
  via Admin → Products or SQL seed (see docs/RESET_CATALOG_AND_USERS.md).
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

BEGIN TRY
  BEGIN TRAN;

  PRINT N'[1/8] Returns / order satellites...';
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

  PRINT N'[2/8] Payments and orders...';
  IF OBJECT_ID(N'dbo.payments', N'U') IS NOT NULL
    DELETE FROM dbo.payments;
  IF OBJECT_ID(N'dbo.payment_return_events', N'U') IS NOT NULL
    DELETE FROM dbo.payment_return_events;
  IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL
    DELETE FROM dbo.orders;

  PRINT N'[3/8] Inventory holds and movements...';
  IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL
    DELETE FROM dbo.inventory_reservations;
  IF OBJECT_ID(N'dbo.stock_movements', N'U') IS NOT NULL
    DELETE FROM dbo.stock_movements;

  PRINT N'[4/8] Carts...';
  IF OBJECT_ID(N'dbo.cart_lines', N'U') IS NOT NULL
    DELETE FROM dbo.cart_lines;
  IF OBJECT_ID(N'dbo.carts', N'U') IS NOT NULL
    DELETE FROM dbo.carts;

  PRINT N'[5/8] Products (cascades variants, images, options, inventory_quantity)...';
  IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL
    DELETE FROM dbo.products;

  PRINT N'[6/8] Notifications outbox...';
  IF OBJECT_ID(N'dbo.notification_outbox', N'U') IS NOT NULL
    DELETE FROM dbo.notification_outbox;

  PRINT N'[7/8] Keycloak login throttle...';
  IF OBJECT_ID(N'dbo.keycloak_login_throttle', N'U') IS NOT NULL
    DELETE FROM dbo.keycloak_login_throttle;

  PRINT N'[8/8] Users (CASCADE user_businesses, addresses, tokens, demo_wallet_ledger, user_notifications)...';
  IF OBJECT_ID(N'dbo.users', N'U') IS NOT NULL
    DELETE FROM dbo.users;

  COMMIT TRAN;
  PRINT N'reset-users-and-catalog: COMMIT complete. dbo.businesses and dbo.categories were not modified.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
  DECLARE @sev INT = ERROR_SEVERITY();
  DECLARE @st INT = ERROR_STATE();
  RAISERROR(N'reset-users-and-catalog failed: %s', @sev, @st, @msg);
END CATCH;
