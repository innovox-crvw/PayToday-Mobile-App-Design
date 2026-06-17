/* order_payment_plans / instalments id without DEFAULT (hybrid laybuy schema). */

IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'id') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'id'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans
    ADD CONSTRAINT DF_opp_id_080 DEFAULT (NEWSEQUENTIALID()) FOR id;
END;
GO

IF OBJECT_ID(N'dbo.order_payment_plan_instalments', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plan_instalments', N'id') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plan_instalments') AND c.name = N'id'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plan_instalments
    ADD CONSTRAINT DF_oppi_id_080 DEFAULT (NEWSEQUENTIALID()) FOR id;
END;
GO
