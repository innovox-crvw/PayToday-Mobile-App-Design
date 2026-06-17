/* Liquor store support: per-merchant alcohol selling hours enforced at checkout.
   Columns match the dbo.liquor_selling_hours schema visible in SSMS.
   day_of_week convention: 1 = Monday ... 7 = Sunday (ISO weekday).
*/

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.liquor_selling_hours (
    id INT NOT NULL IDENTITY(1,1) CONSTRAINT PK_liquor_selling_hours PRIMARY KEY,
    pay_today_merchant_id INT NOT NULL,
    day_of_week TINYINT NOT NULL,
    start_minutes INT NOT NULL,
    end_minutes INT NOT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_liquor_selling_hours_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_liquor_selling_hours_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_liquor_hours_merchant FOREIGN KEY (pay_today_merchant_id)
      REFERENCES dbo.businesses (pay_today_merchant_id) ON DELETE CASCADE,
    CONSTRAINT CK_liquor_hours_dow CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT CK_liquor_hours_start CHECK (start_minutes >= 0 AND start_minutes < 1440),
    CONSTRAINT CK_liquor_hours_end CHECK (end_minutes > 0 AND end_minutes <= 1440),
    CONSTRAINT CK_liquor_hours_window CHECK (end_minutes > start_minutes)
  );
  CREATE NONCLUSTERED INDEX IX_liquor_hours_merchant ON dbo.liquor_selling_hours (pay_today_merchant_id, day_of_week, is_active);
END;
GO
