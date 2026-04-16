/* Correlates PayToday payment_intent_token on browser return when reference query is missing. */
IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.orders', N'paytoday_payment_intent_token') IS NULL
  ALTER TABLE dbo.orders ADD paytoday_payment_intent_token NVARCHAR(128) NULL;
GO
