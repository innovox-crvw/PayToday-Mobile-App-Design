/* Per-category flag: admin marks categories (or parents) eligible for in-app payment plans (3/6/12 months). */

IF COL_LENGTH('dbo.categories', 'payment_plan_eligible') IS NULL
BEGIN
  ALTER TABLE dbo.categories ADD payment_plan_eligible BIT NOT NULL
    CONSTRAINT DF_categories_payment_plan_eligible DEFAULT (0);
END;
GO

/* Align demo data with existing finance-eligible roots where that column exists. */
IF COL_LENGTH('dbo.categories', 'finance_eligible') IS NOT NULL
BEGIN
  UPDATE dbo.categories SET payment_plan_eligible = finance_eligible;
END
ELSE
BEGIN
  UPDATE dbo.categories
  SET payment_plan_eligible = 1
  WHERE slug IN (N'electronics', N'home', N'groceries');
END;
GO
