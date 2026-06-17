/* Find DB objects that may cause nested-aggregate errors (beyond computed columns). */

-- 1) Views whose definition mentions SUM/COUNT more than once (manual review)
SELECT v.name AS view_name, m.definition
FROM sys.views v
INNER JOIN sys.sql_modules m ON m.object_id = v.object_id
WHERE m.definition LIKE N'%SUM(%' OR m.definition LIKE N'%COUNT(%'
ORDER BY v.name;

-- 2) Triggers on payment / wallet / order tables
SELECT OBJECT_NAME(t.parent_id) AS on_table, t.name AS trigger_name, m.definition
FROM sys.triggers t
INNER JOIN sys.sql_modules m ON m.object_id = t.object_id
WHERE OBJECT_NAME(t.parent_id) IN (
  N'order_payment_plans', N'order_payment_plan_instalments',
  N'orders', N'order_lines', N'demo_wallet_ledger', N'users'
)
ORDER BY on_table, trigger_name;

-- 3) Check constraints with subqueries / aggregates
SELECT OBJECT_NAME(parent_object_id) AS on_table, cc.name, cc.definition
FROM sys.check_constraints cc
WHERE cc.definition LIKE N'%SUM(%' OR cc.definition LIKE N'%COUNT(%' OR cc.definition LIKE N'%SELECT%';

-- 4) Columns on order_payment_plans (all types)
SELECT c.name, t.name AS data_type, c.is_computed, c.is_nullable
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'dbo.order_payment_plans')
ORDER BY c.column_id;

-- 5) Default constraints referencing aggregates (unusual)
SELECT OBJECT_NAME(dc.parent_object_id) AS on_table, c.name AS column_name, dc.definition
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.definition LIKE N'%SUM(%' OR dc.definition LIKE N'%COUNT(%';
