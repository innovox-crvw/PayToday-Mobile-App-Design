/*
  Databases that ran 068_recurring_laybuy / 071–073 (not in this repo) have extra NOT NULL columns
  on dbo.order_payment_plans (total_principal_cents, fee_cents, installment_count, cadence_months,
  plan_balance_cents, deposit_cents). The API inserts 046-style columns only — inserts fail or
  older balance columns may have used nested aggregates.

  Idempotent with 077_fix_payment_plan_aggregate_columns.
*/

DECLARE @legacyBalanceCols TABLE (col SYSNAME NOT NULL);
INSERT INTO @legacyBalanceCols (col) VALUES
  (N'plan_balance_cents'),
  (N'deposit_cents');

/* Drop defaults / checks that block DROP COLUMN. */
DECLARE @dropDeps NVARCHAR(MAX) = N'';
SELECT @dropDeps = @dropDeps
  + N'ALTER TABLE dbo.order_payment_plans DROP CONSTRAINT ' + QUOTENAME(o.name) + N';' + CHAR(10)
FROM sys.objects o
INNER JOIN sys.columns c ON c.object_id = o.parent_object_id
WHERE o.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans')
  AND o.type IN (N'D', N'C')
  AND c.name IN (SELECT col FROM @legacyBalanceCols);
IF LEN(@dropDeps) > 0
  EXEC sp_executesql @dropDeps;

DECLARE @balCol SYSNAME;
DECLARE bal CURSOR LOCAL FAST_FORWARD FOR SELECT col FROM @legacyBalanceCols;
OPEN bal;
FETCH NEXT FROM bal INTO @balCol;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH(N'dbo.order_payment_plans', @balCol) IS NOT NULL
  BEGIN
    DECLARE @dropBal NVARCHAR(400) =
      N'ALTER TABLE dbo.order_payment_plans DROP COLUMN ' + QUOTENAME(@balCol);
    EXEC sp_executesql @dropBal;
  END;
  FETCH NEXT FROM bal INTO @balCol;
END;
CLOSE bal;
DEALLOCATE bal;
GO

/* Defaults on recurring-era required columns so 046-style INSERT succeeds. */
IF COL_LENGTH(N'dbo.order_payment_plans', N'total_principal_cents') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'total_principal_cents'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans
    ADD CONSTRAINT DF_opp_total_principal_cents DEFAULT (0) FOR total_principal_cents;
END;
GO

IF COL_LENGTH(N'dbo.order_payment_plans', N'fee_cents') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'fee_cents'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans ADD CONSTRAINT DF_opp_fee_cents DEFAULT (0) FOR fee_cents;
END;
GO

IF COL_LENGTH(N'dbo.order_payment_plans', N'installment_count') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'installment_count'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans ADD CONSTRAINT DF_opp_installment_count DEFAULT (1) FOR installment_count;
END;
GO

IF COL_LENGTH(N'dbo.order_payment_plans', N'cadence_months') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'cadence_months'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans ADD CONSTRAINT DF_opp_cadence_months DEFAULT (1) FOR cadence_months;
END;
GO

/* Keep recurring + admin columns in sync where both exist. */
IF COL_LENGTH(N'dbo.order_payment_plans', N'total_principal_cents') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'instalment_cents') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'total_instalments') IS NOT NULL
BEGIN
  UPDATE dbo.order_payment_plans
  SET total_principal_cents = instalment_cents * total_instalments
  WHERE total_principal_cents = 0
    AND instalment_cents > 0
    AND total_instalments > 0;

  IF COL_LENGTH(N'dbo.order_payment_plans', N'installment_count') IS NOT NULL
  BEGIN
    UPDATE dbo.order_payment_plans
    SET installment_count = total_instalments
    WHERE installment_count IS NULL OR installment_count = 0;
  END;
END;
GO

PRINT N'078_align_hybrid_payment_plan_schema: finished.';
