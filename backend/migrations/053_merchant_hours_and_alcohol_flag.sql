/* Per-merchant weekly hours (JSON) + liquor sale window; product alcohol flag. */

IF OBJECT_ID(N'dbo.merchant_operating_hours', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.merchant_operating_hours (
    pay_today_merchant_id INT NOT NULL,
    kind NVARCHAR(20) NOT NULL,
    weekly_json NVARCHAR(4000) NOT NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_merchant_hours_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_merchant_operating_hours PRIMARY KEY (pay_today_merchant_id, kind),
    CONSTRAINT CK_merchant_hours_kind CHECK (kind IN (N'general', N'liquor')),
    CONSTRAINT FK_merchant_hours_business FOREIGN KEY (pay_today_merchant_id) REFERENCES dbo.businesses (pay_today_merchant_id) ON DELETE CASCADE
  );
END;
GO

IF COL_LENGTH(N'dbo.products', N'contains_alcohol') IS NULL
BEGIN
  ALTER TABLE dbo.products ADD contains_alcohol BIT NOT NULL CONSTRAINT DF_products_contains_alcohol DEFAULT (0);
END;
GO
