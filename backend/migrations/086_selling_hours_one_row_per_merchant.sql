/*
  Convert store_selling_hours and liquor_selling_hours to one row per merchant.
  Columns: id, merchant_id, monday … sunday (HH:mm-HH:mm or NULL = closed), is_active, created_at.
*/

SET NOCOUNT ON;

/* ── Store selling hours ─────────────────────────────────────────────────────── */

IF OBJECT_ID(N'dbo.store_selling_hours', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.store_selling_hours', N'day_of_week') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'dbo.store_selling_hours_legacy', N'U') IS NOT NULL
    DROP TABLE dbo.store_selling_hours_legacy;

  SELECT *
  INTO dbo.store_selling_hours_legacy
  FROM dbo.store_selling_hours;

  DROP TABLE dbo.store_selling_hours;
END;
GO

IF OBJECT_ID(N'dbo.store_selling_hours', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.store_selling_hours (
    id INT NOT NULL IDENTITY(1,1) CONSTRAINT PK_store_selling_hours PRIMARY KEY,
    merchant_id INT NOT NULL,
    monday NVARCHAR(24) NULL,
    tuesday NVARCHAR(24) NULL,
    wednesday NVARCHAR(24) NULL,
    thursday NVARCHAR(24) NULL,
    friday NVARCHAR(24) NULL,
    saturday NVARCHAR(24) NULL,
    sunday NVARCHAR(24) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_store_selling_hours_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_store_selling_hours_created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_store_selling_hours_merchant UNIQUE (merchant_id),
    CONSTRAINT FK_store_selling_hours_merchant FOREIGN KEY (merchant_id)
      REFERENCES dbo.businesses (pay_today_merchant_id) ON DELETE CASCADE
  );
  CREATE INDEX IX_store_selling_hours_merchant ON dbo.store_selling_hours (merchant_id);
END;
GO

IF OBJECT_ID(N'dbo.store_selling_hours_legacy', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.store_selling_hours (merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
  SELECT
    l.pay_today_merchant_id,
    MAX(CASE WHEN l.day_of_week = 1 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 2 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 3 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 4 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 5 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 6 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 7 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    CAST(MAX(CAST(l.is_active AS INT)) AS BIT)
  FROM dbo.store_selling_hours_legacy l
  INNER JOIN dbo.businesses b ON b.pay_today_merchant_id = l.pay_today_merchant_id
  GROUP BY l.pay_today_merchant_id;

  DROP TABLE dbo.store_selling_hours_legacy;
END;
GO

/* ── Liquor selling hours ────────────────────────────────────────────────────── */

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.liquor_selling_hours', N'day_of_week') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'dbo.liquor_selling_hours_legacy', N'U') IS NOT NULL
    DROP TABLE dbo.liquor_selling_hours_legacy;

  SELECT *
  INTO dbo.liquor_selling_hours_legacy
  FROM dbo.liquor_selling_hours;

  DROP TABLE dbo.liquor_selling_hours;
END;
GO

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.liquor_selling_hours (
    id INT NOT NULL IDENTITY(1,1) CONSTRAINT PK_liquor_selling_hours PRIMARY KEY,
    merchant_id INT NOT NULL,
    monday NVARCHAR(24) NULL,
    tuesday NVARCHAR(24) NULL,
    wednesday NVARCHAR(24) NULL,
    thursday NVARCHAR(24) NULL,
    friday NVARCHAR(24) NULL,
    saturday NVARCHAR(24) NULL,
    sunday NVARCHAR(24) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_liquor_selling_hours_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_liquor_selling_hours_created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_liquor_selling_hours_merchant UNIQUE (merchant_id),
    CONSTRAINT FK_liquor_selling_hours_merchant FOREIGN KEY (merchant_id)
      REFERENCES dbo.businesses (pay_today_merchant_id) ON DELETE CASCADE
  );
  CREATE INDEX IX_liquor_selling_hours_merchant ON dbo.liquor_selling_hours (merchant_id);
END;
GO

IF OBJECT_ID(N'dbo.liquor_selling_hours_legacy', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.liquor_selling_hours (merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
  SELECT
    l.pay_today_merchant_id,
    MAX(CASE WHEN l.day_of_week = 1 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 2 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 3 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 4 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 5 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 6 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    MAX(CASE WHEN l.day_of_week = 7 AND l.is_active = 1 THEN
      CONCAT(
        FORMAT(DATEADD(MINUTE, l.start_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm'),
        N'-',
        FORMAT(DATEADD(MINUTE, l.end_minutes, CAST(N'1900-01-01T00:00:00' AS DATETIME2)), N'HH:mm')
      ) END),
    CAST(MAX(CAST(l.is_active AS INT)) AS BIT)
  FROM dbo.liquor_selling_hours_legacy l
  INNER JOIN dbo.businesses b ON b.pay_today_merchant_id = l.pay_today_merchant_id
  GROUP BY l.pay_today_merchant_id;

  DROP TABLE dbo.liquor_selling_hours_legacy;
END;
GO
