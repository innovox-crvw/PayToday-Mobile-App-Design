/* Compatibility: add columns expected by the Node API when older or hand-built DBs omit them. */

IF OBJECT_ID(N'dbo.rbac_roles', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.rbac_roles', N'description') IS NULL
BEGIN
  ALTER TABLE dbo.rbac_roles ADD description NVARCHAR(1000) NULL;
END;
GO

IF OBJECT_ID(N'dbo.rbac_permissions', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.rbac_permissions', N'description') IS NULL
BEGIN
  ALTER TABLE dbo.rbac_permissions ADD description NVARCHAR(1000) NULL;
END;
GO

IF OBJECT_ID(N'dbo.discount_codes', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.discount_codes', N'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.discount_codes ADD created_at DATETIME2 NULL;
  UPDATE dbo.discount_codes SET created_at = SYSUTCDATETIME() WHERE created_at IS NULL;
END;
GO

IF OBJECT_ID(N'dbo.discount_codes', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.discount_codes', N'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.discount_codes ADD updated_at DATETIME2 NULL;
  UPDATE dbo.discount_codes SET updated_at = SYSUTCDATETIME() WHERE updated_at IS NULL;
END;
GO

/* Add column in its own batch — SQL Server will not resolve a column added in the same batch for UPDATE. */
IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.order_payment_plans', N'instalment_cents') IS NULL
BEGIN
  ALTER TABLE dbo.order_payment_plans ADD instalment_cents INT NULL;
END;
GO

IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'instalment_cents') IS NOT NULL
   AND OBJECT_ID(N'dbo.order_payment_plan_instalments', N'U') IS NOT NULL
BEGIN
  UPDATE p
  SET p.instalment_cents = x.amt
  FROM dbo.order_payment_plans p
  OUTER APPLY (
    SELECT TOP 1 i.amount_cents AS amt
    FROM dbo.order_payment_plan_instalments i
    WHERE i.plan_id = p.id
    ORDER BY i.instalment_number
  ) x
  WHERE p.instalment_cents IS NULL AND x.amt IS NOT NULL;

  UPDATE dbo.order_payment_plans SET instalment_cents = 0 WHERE instalment_cents IS NULL;
END;
GO

IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'instalment_cents') IS NOT NULL
BEGIN
  DECLARE @nullable BIT =
    (SELECT c.is_nullable FROM sys.columns c
     WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'instalment_cents');
  IF @nullable = 1
  BEGIN
    ALTER TABLE dbo.order_payment_plans ALTER COLUMN instalment_cents INT NOT NULL;
  END;
END;
GO

IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.order_payment_plans', N'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.order_payment_plans ADD created_at DATETIME2 NOT NULL CONSTRAINT DF_opp_created_at_compat DEFAULT (SYSUTCDATETIME());
END;
GO
