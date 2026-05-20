/* Run in SSMS — each result set is labelled in Messages. */

PRINT N'1) All columns on order_payment_plans (is_computed should be 0 for every row)';
SELECT c.name AS column_name, t.name AS data_type, c.is_computed
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans')
ORDER BY c.column_id;

PRINT N'2) Computed columns (empty = good; error is NOT from computed columns)';
SELECT OBJECT_NAME(cc.object_id) AS table_name, c.name AS column_name, cc.definition
FROM sys.computed_columns cc
INNER JOIN sys.columns c ON c.object_id = cc.object_id AND c.column_id = cc.column_id
WHERE OBJECT_NAME(cc.object_id) IN (N'order_payment_plans', N'order_payment_plan_instalments')
ORDER BY table_name, column_name;

PRINT N'3) Triggers on payment-plan tables (any row = investigate definition)';
SELECT t.name AS trigger_name, OBJECT_NAME(t.parent_id) AS on_table, m.definition
FROM sys.triggers t
LEFT JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE t.parent_id IN (OBJECT_ID(N'dbo.order_payment_plans'), OBJECT_ID(N'dbo.order_payment_plan_instalments'));

PRINT N'4) Legacy balance columns still present (077/078 should drop these)';
SELECT c.name
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans')
  AND c.name IN (
    N'deposit_balance_cents', N'balance_cents', N'plan_total_cents', N'total_plan_cents',
    N'paid_total_cents', N'amount_paid_cents', N'remaining_cents',
    N'remaining_balance_cents', N'balance_remaining_cents',
    N'plan_balance_cents', N'deposit_cents'
  );

PRINT N'4b) Recurring-era columns (hybrid DB — API must populate or have defaults)';
SELECT c.name, c.is_nullable, dc.definition AS default_def
FROM sys.columns c
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans')
  AND c.name IN (N'total_principal_cents', N'fee_cents', N'installment_count', N'cadence_months');

PRINT N'5) Views whose SQL mentions payment plans';
SELECT v.name AS view_name
FROM sys.views v
INNER JOIN sys.sql_modules m ON m.object_id = v.object_id
WHERE m.definition LIKE N'%order_payment_plan%';

PRINT N'6) Applied migrations touching payment plans';
SELECT version, applied_at
FROM dbo.schema_migrations
WHERE version LIKE N'%payment_plan%' OR version LIKE N'%071%' OR version LIKE N'%072%' OR version LIKE N'%073%' OR version LIKE N'%077%'
ORDER BY applied_at;
