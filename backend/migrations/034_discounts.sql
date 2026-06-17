/* Promo / discount codes redeemable at checkout. */

IF OBJECT_ID(N'dbo.discount_codes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.discount_codes (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_discount_codes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    code NVARCHAR(80) NOT NULL,
    description NVARCHAR(500) NULL,
    discount_type NVARCHAR(20) NOT NULL CONSTRAINT DF_discount_codes_type DEFAULT (N'pct'),
    /* pct: basis points (e.g. 1000 = 10 %).  fixed: NAD cents off. */
    discount_value INT NOT NULL,
    min_order_cents INT NOT NULL CONSTRAINT DF_discount_codes_min DEFAULT (0),
    max_discount_cents INT NULL,
    max_uses INT NULL,
    uses_count INT NOT NULL CONSTRAINT DF_discount_codes_uses DEFAULT (0),
    starts_at DATETIME2 NULL,
    ends_at DATETIME2 NULL,
    is_active BIT NOT NULL CONSTRAINT DF_discount_codes_is_active DEFAULT (1),
    created_by NVARCHAR(36) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_discount_codes_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_discount_codes_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_discount_codes_type CHECK (discount_type IN (N'pct', N'fixed')),
    CONSTRAINT CK_discount_codes_value CHECK (discount_value > 0)
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_discount_codes_code ON dbo.discount_codes (code);
  CREATE NONCLUSTERED INDEX IX_discount_codes_active_dates ON dbo.discount_codes (is_active, starts_at, ends_at);
END;
GO

/* Track which orders used which discount code (one-to-one for simplicity). */
IF COL_LENGTH(N'dbo.orders', N'discount_code_id') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD discount_code_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.orders', N'discount_cents') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD discount_cents INT NOT NULL CONSTRAINT DF_orders_discount_cents DEFAULT (0);
END;
GO
