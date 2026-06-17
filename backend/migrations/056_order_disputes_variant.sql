IF COL_LENGTH(N'dbo.order_disputes', N'variant_id') IS NULL
BEGIN
  ALTER TABLE dbo.order_disputes ADD variant_id UNIQUEIDENTIFIER NULL;
END;
GO
