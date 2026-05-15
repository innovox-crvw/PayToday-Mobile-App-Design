/* Per-merchant store opening hours (Africa/Windhoek wall clock). ISO weekday 1=Mon … 7=Sun. */

IF OBJECT_ID(N'dbo.store_selling_hours', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.store_selling_hours (
    id INT NOT NULL IDENTITY(1,1) CONSTRAINT PK_store_selling_hours PRIMARY KEY,
    pay_today_merchant_id INT NOT NULL,
    day_of_week TINYINT NOT NULL,
    start_minutes INT NOT NULL,
    end_minutes INT NOT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_store_selling_hours_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_store_selling_hours_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_store_hours_merchant FOREIGN KEY (pay_today_merchant_id)
      REFERENCES dbo.businesses (pay_today_merchant_id) ON DELETE CASCADE,
    CONSTRAINT CK_store_hours_dow CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT CK_store_hours_start CHECK (start_minutes >= 0 AND start_minutes < 1440),
    CONSTRAINT CK_store_hours_end CHECK (end_minutes > 0 AND end_minutes <= 1440),
    CONSTRAINT CK_store_hours_window CHECK (end_minutes > start_minutes)
  );
  CREATE NONCLUSTERED INDEX IX_store_hours_merchant ON dbo.store_selling_hours (pay_today_merchant_id, day_of_week, is_active);
END;
GO

IF OBJECT_ID(N'dbo.store_selling_hours', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = 991001)
  AND NOT EXISTS (SELECT 1 FROM dbo.store_selling_hours WHERE pay_today_merchant_id = 991001)
BEGIN
  INSERT INTO dbo.store_selling_hours (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
  VALUES
    (991001, 1, 540, 1200, 1),
    (991001, 2, 540, 1200, 1),
    (991001, 3, 540, 1200, 1),
    (991001, 4, 540, 1200, 1),
    (991001, 5, 540, 1200, 1),
    (991001, 6, 540, 1200, 1);
END;
GO
