/* Hybrid DBs may have created_at/updated_at on order_payment_plans without DEFAULT — inserts then fail. */

IF COL_LENGTH(N'dbo.order_payment_plans', N'created_at') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'created_at'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans
    ADD CONSTRAINT DF_opp_created_at_079 DEFAULT (SYSUTCDATETIME()) FOR created_at;
END;
GO

IF COL_LENGTH(N'dbo.order_payment_plans', N'updated_at') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'updated_at'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans
    ADD CONSTRAINT DF_opp_updated_at_079 DEFAULT (SYSUTCDATETIME()) FOR updated_at;
END;
GO

IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.order_payment_plans', N'id') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plans') AND c.name = N'id'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plans
    ADD CONSTRAINT DF_opp_id_079 DEFAULT (NEWSEQUENTIALID()) FOR id;
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
    ADD CONSTRAINT DF_oppi_id_079 DEFAULT (NEWSEQUENTIALID()) FOR id;
END;
GO

IF COL_LENGTH(N'dbo.order_payment_plan_instalments', N'created_at') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.default_constraints dc
     INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID(N'dbo.order_payment_plan_instalments') AND c.name = N'created_at'
   )
BEGIN
  ALTER TABLE dbo.order_payment_plan_instalments
    ADD CONSTRAINT DF_oppi_created_at_079 DEFAULT (SYSUTCDATETIME()) FOR created_at;
END;
GO
