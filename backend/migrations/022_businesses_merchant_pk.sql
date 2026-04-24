/*
  Use pay_today_merchant_id (INT) as dbo.businesses primary key; drop legacy UNIQUEIDENTIFIER id.
  Repoint dbo.products and dbo.user_businesses from business_id to pay_today_merchant_id.

  Idempotent:
  - When dbo.businesses still has legacy column id, runs full migration inside EXEC (runtime compile).
  - When id is already gone (fresh all-in-one schema), skips legacy block and only repairs missing FKs/indexes.
*/

SET NOCOUNT ON;

DECLARE @legacy INT = CASE WHEN COL_LENGTH(N'dbo.businesses', N'id') IS NOT NULL THEN 1 ELSE 0 END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NULL
BEGIN
  PRINT N'022_businesses_merchant_pk: skipped (dbo.businesses missing).';
END
ELSE IF @legacy = 1
BEGIN
  /* ---- 1) Backfill pay_today_merchant_id ---- */
  EXEC(N'
;WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM dbo.businesses
  WHERE pay_today_merchant_id IS NULL
)
UPDATE b
SET pay_today_merchant_id = 880000 + n.rn
FROM dbo.businesses b
INNER JOIN numbered n ON n.id = b.id
WHERE b.pay_today_merchant_id IS NULL;
');

  /* ---- 2) Dedupe pay_today_merchant_id (deterministic new ids above current max) ---- */
  EXEC(N'
DECLARE @b INT = (SELECT ISNULL(MAX(pay_today_merchant_id), 0) FROM dbo.businesses);
;WITH ddup AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY pay_today_merchant_id ORDER BY id) AS rn
  FROM dbo.businesses
),
chg AS (
  SELECT ddup.id, @b + ROW_NUMBER() OVER (ORDER BY ddup.id) AS new_mid
  FROM ddup
  WHERE ddup.rn > 1
)
UPDATE b
SET pay_today_merchant_id = c.new_mid
FROM dbo.businesses b
INNER JOIN chg c ON c.id = b.id;
');

  /* ---- 3) products: add column, backfill, drop business_id ---- */
  IF COL_LENGTH(N'dbo.products', N'pay_today_merchant_id') IS NULL
    ALTER TABLE dbo.products ADD pay_today_merchant_id INT NULL;

  IF COL_LENGTH(N'dbo.products', N'business_id') IS NOT NULL
  BEGIN
    EXEC(N'
UPDATE p
SET pay_today_merchant_id = b.pay_today_merchant_id
FROM dbo.products p
INNER JOIN dbo.businesses b ON b.id = p.business_id
WHERE p.business_id IS NOT NULL;
');
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_products_business' AND parent_object_id = OBJECT_ID(N'dbo.products'))
      ALTER TABLE dbo.products DROP CONSTRAINT FK_products_business;
    ALTER TABLE dbo.products DROP COLUMN business_id;
  END;

  /* ---- 4) user_businesses ---- */
  IF COL_LENGTH(N'dbo.user_businesses', N'pay_today_merchant_id') IS NULL
    ALTER TABLE dbo.user_businesses ADD pay_today_merchant_id INT NULL;

  IF COL_LENGTH(N'dbo.user_businesses', N'business_id') IS NOT NULL
  BEGIN
    EXEC(N'
UPDATE ub
SET pay_today_merchant_id = b.pay_today_merchant_id
FROM dbo.user_businesses ub
INNER JOIN dbo.businesses b ON b.id = ub.business_id;
');
    /* Deferred compile: column was added in this batch (ODBC/msnodesqlv8 rejects static DELETE here). */
    EXEC sp_executesql N'DELETE FROM dbo.user_businesses WHERE pay_today_merchant_id IS NULL';

    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_user_businesses_business' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
      ALTER TABLE dbo.user_businesses DROP CONSTRAINT FK_user_businesses_business;

    IF EXISTS (SELECT 1 FROM sys.objects WHERE name = N'UQ_user_businesses_user_business' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
      ALTER TABLE dbo.user_businesses DROP CONSTRAINT UQ_user_businesses_user_business;

    ALTER TABLE dbo.user_businesses DROP COLUMN business_id;
    ALTER TABLE dbo.user_businesses ALTER COLUMN pay_today_merchant_id INT NOT NULL;
  END;

  /* ---- 5) businesses: drop id, PK on pay_today_merchant_id ---- */
  DECLARE @dcId SYSNAME;
  DECLARE @dropId nvarchar(400);
  SELECT @dcId = dc.name
  FROM sys.default_constraints dc
  INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID(N'dbo.businesses') AND c.name = N'id';
  IF @dcId IS NOT NULL
  BEGIN
    SET @dropId = N'ALTER TABLE dbo.businesses DROP CONSTRAINT ' + QUOTENAME(@dcId);
    EXEC sp_executesql @dropId;
  END;

  IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'PK_businesses' AND parent_object_id = OBJECT_ID(N'dbo.businesses'))
    ALTER TABLE dbo.businesses DROP CONSTRAINT PK_businesses;

  ALTER TABLE dbo.businesses DROP COLUMN id;

  IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_businesses_pay_today_merchant_id' AND object_id = OBJECT_ID(N'dbo.businesses'))
    DROP INDEX UQ_businesses_pay_today_merchant_id ON dbo.businesses;

  IF EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id IS NULL)
  BEGIN
    THROW 50022, N'022_businesses_merchant_pk: businesses.pay_today_merchant_id still NULL after backfill.', 1;
  END;

  ALTER TABLE dbo.businesses ALTER COLUMN pay_today_merchant_id INT NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'PK_businesses' AND parent_object_id = OBJECT_ID(N'dbo.businesses'))
    ALTER TABLE dbo.businesses ADD CONSTRAINT PK_businesses PRIMARY KEY CLUSTERED (pay_today_merchant_id);
END;

/* ---- 6) Child FKs / unique (idempotent; safe when legacy skipped) ---- */
IF OBJECT_ID(N'dbo.user_businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.user_businesses', N'pay_today_merchant_id') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_user_businesses_business' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
BEGIN
  ALTER TABLE dbo.user_businesses
    ADD CONSTRAINT FK_user_businesses_business FOREIGN KEY (pay_today_merchant_id)
    REFERENCES dbo.businesses(pay_today_merchant_id) ON DELETE CASCADE;
END;

IF OBJECT_ID(N'dbo.user_businesses', N'U') IS NOT NULL
BEGIN
  IF EXISTS (SELECT 1 FROM sys.objects WHERE name = N'UQ_user_businesses_user_business' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
    ALTER TABLE dbo.user_businesses DROP CONSTRAINT UQ_user_businesses_user_business;
  IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = N'UQ_user_businesses_user_merchant' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
    ALTER TABLE dbo.user_businesses
      ADD CONSTRAINT UQ_user_businesses_user_merchant UNIQUE (user_id, pay_today_merchant_id);
END;

IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.products', N'pay_today_merchant_id') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_products_business' AND parent_object_id = OBJECT_ID(N'dbo.products'))
BEGIN
  ALTER TABLE dbo.products
    ADD CONSTRAINT FK_products_business FOREIGN KEY (pay_today_merchant_id)
    REFERENCES dbo.businesses(pay_today_merchant_id);
END;

PRINT N'022_businesses_merchant_pk: finished.';
