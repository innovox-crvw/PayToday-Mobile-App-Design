/*
  Fix SQL Server error:
  "Cannot perform an aggregate function on an expression containing an aggregate or a subquery."

  Cause: older migrations (071–073) on some databases added computed / balance columns on
  dbo.order_payment_plans that reference SUM() over instalment rows. Inserts from the API
  (paymentPlanService) then fail when SQL Server evaluates those definitions.

  Idempotent — safe to run even if 073_payment_plan_no_aggregate_columns already ran.
*/

/* Drop triggers on payment-plan tables (if any legacy trigger re-aggregates on INSERT). */
DECLARE @trig NVARCHAR(MAX) = N'';
SELECT @trig = @trig + N'DROP TRIGGER ' + QUOTENAME(OBJECT_SCHEMA_NAME(t.parent_id)) + N'.' + QUOTENAME(t.name) + N';' + CHAR(10)
FROM sys.triggers t
WHERE t.parent_id IN (OBJECT_ID(N'dbo.order_payment_plans'), OBJECT_ID(N'dbo.order_payment_plan_instalments'))
  AND t.parent_id IS NOT NULL;
IF LEN(@trig) > 0
  EXEC sp_executesql @trig;
GO

/* Drop ALL computed columns on payment-plan tables. */
DECLARE @dropComputed NVARCHAR(MAX) = N'';
SELECT @dropComputed = @dropComputed
  + N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(c.object_id)) + N'.' + QUOTENAME(OBJECT_NAME(c.object_id))
  + N' DROP COLUMN ' + QUOTENAME(c.name) + N';' + CHAR(10)
FROM sys.computed_columns cc
INNER JOIN sys.columns c ON c.object_id = cc.object_id AND c.column_id = cc.column_id
WHERE c.object_id IN (OBJECT_ID(N'dbo.order_payment_plans'), OBJECT_ID(N'dbo.order_payment_plan_instalments'));
IF LEN(@dropComputed) > 0
  EXEC sp_executesql @dropComputed;
GO

/* Drop legacy balance/deposit columns from removed migrations (physical columns only). */
DECLARE @legacyCols TABLE (col SYSNAME NOT NULL);
INSERT INTO @legacyCols (col) VALUES
  (N'deposit_balance_cents'),
  (N'balance_cents'),
  (N'plan_total_cents'),
  (N'total_plan_cents'),
  (N'paid_total_cents'),
  (N'amount_paid_cents'),
  (N'remaining_cents'),
  (N'remaining_balance_cents'),
  (N'balance_remaining_cents');

DECLARE @col SYSNAME;
DECLARE leg CURSOR LOCAL FAST_FORWARD FOR SELECT col FROM @legacyCols;
OPEN leg;
FETCH NEXT FROM leg INTO @col;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH(N'dbo.order_payment_plans', @col) IS NOT NULL
  BEGIN
    DECLARE @dropLegacy NVARCHAR(400) =
      N'ALTER TABLE dbo.order_payment_plans DROP COLUMN ' + QUOTENAME(@col);
    EXEC sp_executesql @dropLegacy;
  END;
  FETCH NEXT FROM leg INTO @col;
END;
CLOSE leg;
DEALLOCATE leg;
GO

/* Ensure instalment_cents exists as a normal INT column (046 + 059 compat). */
IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'instalment_cents') IS NULL
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
  DECLARE @instNullable BIT =
    (SELECT c.is_nullable FROM sys.columns c
     WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'instalment_cents');
  IF @instNullable = 1
    ALTER TABLE dbo.order_payment_plans ALTER COLUMN instalment_cents INT NOT NULL;
END;
GO

PRINT N'077_fix_payment_plan_aggregate_columns: finished.';
