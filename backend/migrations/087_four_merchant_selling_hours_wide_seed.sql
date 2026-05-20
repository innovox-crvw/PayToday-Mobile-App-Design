/*
  Seed wide-format store + liquor hours (one row per merchant) for demo pickup merchants.
  Run after 086_selling_hours_one_row_per_merchant.sql.
*/

SET NOCOUNT ON;

DECLARE @merchants TABLE (merchant_id INT PRIMARY KEY);
INSERT INTO @merchants (merchant_id) VALUES (931001), (931002), (931003), (991001);

IF OBJECT_ID(N'dbo.store_selling_hours', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.store_selling_hours', N'monday') IS NOT NULL
BEGIN
  MERGE dbo.store_selling_hours AS t
  USING (
    SELECT v.merchant_id, v.monday, v.tuesday, v.wednesday, v.thursday, v.friday, v.saturday, v.sunday, v.is_active
    FROM (VALUES
      (931001, N'08:00-20:00', N'08:00-20:00', N'08:00-20:00', N'08:00-20:00', N'08:00-20:00', N'08:00-20:00', NULL, 1),
      (931002, N'09:00-18:00', N'09:00-18:00', N'09:00-18:00', N'09:00-18:00', N'09:00-18:00', N'09:00-18:00', NULL, 1),
      (931003, N'08:30-19:00', N'08:30-19:00', N'08:30-19:00', N'08:30-19:00', N'08:30-19:00', N'09:00-17:00', NULL, 1),
      (991001, N'09:00-20:00', N'09:00-20:00', N'09:00-20:00', N'09:00-20:00', N'09:00-20:00', N'09:00-20:00', NULL, 1)
    ) AS v(merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
    INNER JOIN @merchants m ON m.merchant_id = v.merchant_id
    INNER JOIN dbo.businesses b ON b.pay_today_merchant_id = v.merchant_id
  ) AS src
    ON t.merchant_id = src.merchant_id
  WHEN MATCHED THEN
    UPDATE SET
      monday = src.monday,
      tuesday = src.tuesday,
      wednesday = src.wednesday,
      thursday = src.thursday,
      friday = src.friday,
      saturday = src.saturday,
      sunday = src.sunday,
      is_active = src.is_active
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
    VALUES (src.merchant_id, src.monday, src.tuesday, src.wednesday, src.thursday, src.friday, src.saturday, src.sunday, src.is_active);
END;
GO

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.liquor_selling_hours', N'monday') IS NOT NULL
BEGIN
  MERGE dbo.liquor_selling_hours AS t
  USING (
    SELECT v.merchant_id, v.monday, v.tuesday, v.wednesday, v.thursday, v.friday, v.saturday, v.sunday, v.is_active
    FROM (VALUES
      (991001, N'10:00-20:00', N'15:00-20:00', N'15:00-20:00', N'10:00-20:00', N'10:00-20:00', N'10:00-20:00', NULL, 1)
    ) AS v(merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
    INNER JOIN dbo.businesses b ON b.pay_today_merchant_id = v.merchant_id
  ) AS src
    ON t.merchant_id = src.merchant_id
  WHEN MATCHED THEN
    UPDATE SET
      monday = src.monday,
      tuesday = src.tuesday,
      wednesday = src.wednesday,
      thursday = src.thursday,
      friday = src.friday,
      saturday = src.saturday,
      sunday = src.sunday,
      is_active = src.is_active
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
    VALUES (src.merchant_id, src.monday, src.tuesday, src.wednesday, src.thursday, src.friday, src.saturday, src.sunday, src.is_active);
END;
GO
