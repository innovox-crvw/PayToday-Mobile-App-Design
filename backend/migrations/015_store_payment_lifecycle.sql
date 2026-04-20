/* PayToday store payment lifecycle: reference on payments row, browser return hints, webhook audit */

IF COL_LENGTH('dbo.payments', 'payment_reference') IS NULL
BEGIN
  ALTER TABLE dbo.payments ADD payment_reference NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH('dbo.payments', 'browser_return_at') IS NULL
BEGIN
  ALTER TABLE dbo.payments ADD browser_return_at DATETIME2 NULL;
END;
GO

IF COL_LENGTH('dbo.payments', 'browser_return_status') IS NULL
BEGIN
  ALTER TABLE dbo.payments ADD browser_return_status NVARCHAR(40) NULL;
END;
GO

IF COL_LENGTH('dbo.payments', 'webhook_processed_at') IS NULL
BEGIN
  ALTER TABLE dbo.payments ADD webhook_processed_at DATETIME2 NULL;
END;
GO

UPDATE p
SET payment_reference = o.paytoday_reference
FROM dbo.payments p
INNER JOIN dbo.orders o ON o.id = p.order_id
WHERE p.payment_reference IS NULL AND o.paytoday_reference IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_payments_payment_reference' AND object_id = OBJECT_ID(N'dbo.payments'))
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_payments_payment_reference
    ON dbo.payments(payment_reference)
    WHERE payment_reference IS NOT NULL;
END;
GO
