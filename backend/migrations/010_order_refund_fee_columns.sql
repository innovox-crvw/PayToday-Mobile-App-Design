/* Optional fee breakdown for customer refunds (safe if re-run). */
IF COL_LENGTH(N'dbo.orders', N'refund_handling_fee_cents') IS NULL
  ALTER TABLE dbo.orders ADD refund_handling_fee_cents INT NULL;
GO
IF COL_LENGTH(N'dbo.orders', N'refund_net_cents') IS NULL
  ALTER TABLE dbo.orders ADD refund_net_cents INT NULL;
GO
