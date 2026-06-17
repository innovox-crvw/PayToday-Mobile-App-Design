/* Per-category flag: admin marks categories (or parents) eligible for Nedbank financing messaging in the storefront. */

IF COL_LENGTH('dbo.categories', 'finance_eligible') IS NULL
BEGIN
  ALTER TABLE dbo.categories ADD finance_eligible BIT NOT NULL
    CONSTRAINT DF_categories_finance_eligible DEFAULT (0);
END;
GO

/* Demo seed: top-level catalogue roots used in migration 016 — children inherit via ancestor walk in the app. */
UPDATE dbo.categories
SET finance_eligible = 1
WHERE slug IN (N'electronics', N'home', N'groceries');
GO
