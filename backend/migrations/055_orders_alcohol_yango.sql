/* Order alcohol / delivery scheduling; Yango courier refs on fulfillment. */

IF COL_LENGTH(N'dbo.orders', N'contains_alcohol') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD contains_alcohol BIT NOT NULL CONSTRAINT DF_orders_contains_alcohol DEFAULT (0);
END;
GO

IF COL_LENGTH(N'dbo.orders', N'delivery_scheduled_for') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD delivery_scheduled_for DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.orders', N'home_delivery_window_start') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD home_delivery_window_start DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.orders', N'home_delivery_window_end') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD home_delivery_window_end DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.orders', N'home_delivery_window_label') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD home_delivery_window_label NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.fulfillment_tasks', N'yango_delivery_id') IS NULL
BEGIN
  ALTER TABLE dbo.fulfillment_tasks ADD yango_delivery_id NVARCHAR(160) NULL;
END;
GO

IF COL_LENGTH(N'dbo.fulfillment_tasks', N'yango_status') IS NULL
BEGIN
  ALTER TABLE dbo.fulfillment_tasks ADD yango_status NVARCHAR(120) NULL;
END;
GO

IF COL_LENGTH(N'dbo.fulfillment_tasks', N'yango_tracking_url') IS NULL
BEGIN
  ALTER TABLE dbo.fulfillment_tasks ADD yango_tracking_url NVARCHAR(2000) NULL;
END;
GO
