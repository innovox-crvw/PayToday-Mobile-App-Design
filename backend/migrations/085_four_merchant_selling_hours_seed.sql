/*
  Seed store + liquor selling hours for the four checkout pickup merchants.
  pay_today_merchant_id is the shop key (not the identity id column on each row).

  | Merchant | Pickup store (catalog)              | Store hours (Windhoek)   | Liquor hours        |
  |----------|-------------------------------------|--------------------------|---------------------|
  | 931001   | Nictus Namibia — Grove Mall           | Mon–Sat 08:00–20:00      | —                   |
  | 931002   | Outdoor Center — Maerua               | Mon–Sat 09:00–18:00      | —                   |
  | 931003   | MTC Retail — CBD                      | Mon–Fri 08:30–19:00, Sat 09:00–17:00 | — |
  | 991001   | Liquor collection — Windhoek CBD      | Mon–Sat 09:00–20:00      | Mon/Thu–Sat 10:00–20:00; Tue/Wed 15:00–20:00 |

  Idempotent MERGE per merchant + weekday. Safe to re-run after nictus-three-merchants-seed.sql.

  Prerequisites: dbo.businesses rows for 931001–931003 (nictus-three-merchants-seed.sql) and 991001 if present.
*/

SET NOCOUNT ON;

/* Optional fourth merchant row for liquor pickup (minimal) */
IF NOT EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = 991001)
BEGIN
  INSERT INTO dbo.businesses (
    pay_today_merchant_id, request_business_activation, kyc_completed, active, rejected, bulk_upload,
    legacy_merchant_user_id, business_type, name, registered_business_name, address_line1, address_line2,
    postal_address, zipcode, town, country, registration_number, tax_registration_number, business_owner,
    owner_id_number, contact_number, business_email_address, description, invoice_contact, invoice_email,
    bank_id, account_holder, bank_account_name, account_number, is_fuel_supported, cash_out, voucher_3w,
    dynamic_field_text, email_notifications, notification_details, tandcs, bipa, namra, id_doc, bank_confirmation,
    image_filename, website, category, subcategory, slug, created_at, updated_at
  )
  VALUES (
    991001, 1, 1, 1, 0, 0, 991001, N'Retail', N'Liquor collection — Windhoek CBD',
    N'Liquor collection — Windhoek CBD', N'123 Independence Ave', NULL, N'90004', NULL,
    N'Windhoek', N'Namibia', N'LIQUOR-SEED-991001', N'N/A', N'Demo Liquor Merchant', N'N/A', N'+2640000991',
    N'liquor.demo@paytoday.local', N'Demo liquor pickup store (Windhoek CBD).', N'Admin', N'liquor.demo@paytoday.local',
    1, NULL, N'Main', N'00000991', 0, 0, 0, N'', N'3', N'', NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, N'liquor-collection-windhoek', SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.store_selling_hours', N'U') IS NOT NULL
BEGIN
  DECLARE @store_seed TABLE (
    pay_today_merchant_id INT NOT NULL,
    day_of_week TINYINT NOT NULL,
    start_minutes INT NOT NULL,
    end_minutes INT NOT NULL,
    is_active BIT NOT NULL
  );

  INSERT INTO @store_seed (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
  VALUES
    /* 931001 — Nictus Grove Mall */
    (931001, 1, 480, 1200, 1),
    (931001, 2, 480, 1200, 1),
    (931001, 3, 480, 1200, 1),
    (931001, 4, 480, 1200, 1),
    (931001, 5, 480, 1200, 1),
    (931001, 6, 480, 1200, 1),
    /* 931002 — Outdoor Center Maerua */
    (931002, 1, 540, 1080, 1),
    (931002, 2, 540, 1080, 1),
    (931002, 3, 540, 1080, 1),
    (931002, 4, 540, 1080, 1),
    (931002, 5, 540, 1080, 1),
    (931002, 6, 540, 1080, 1),
    /* 931003 — MTC CBD */
    (931003, 1, 510, 1140, 1),
    (931003, 2, 510, 1140, 1),
    (931003, 3, 510, 1140, 1),
    (931003, 4, 510, 1140, 1),
    (931003, 5, 510, 1140, 1),
    (931003, 6, 540, 1020, 1),
    /* 991001 — Liquor Windhoek CBD (store opening, wider than liquor) */
    (991001, 1, 540, 1200, 1),
    (991001, 2, 540, 1200, 1),
    (991001, 3, 540, 1200, 1),
    (991001, 4, 540, 1200, 1),
    (991001, 5, 540, 1200, 1),
    (991001, 6, 540, 1200, 1);

  MERGE dbo.store_selling_hours AS t
  USING (
    SELECT s.pay_today_merchant_id, s.day_of_week, s.start_minutes, s.end_minutes, s.is_active
    FROM @store_seed s
    INNER JOIN dbo.businesses b ON b.pay_today_merchant_id = s.pay_today_merchant_id
  ) AS src
    ON t.pay_today_merchant_id = src.pay_today_merchant_id AND t.day_of_week = src.day_of_week
  WHEN MATCHED THEN
    UPDATE SET
      start_minutes = src.start_minutes,
      end_minutes = src.end_minutes,
      is_active = src.is_active
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
    VALUES (src.pay_today_merchant_id, src.day_of_week, src.start_minutes, src.end_minutes, src.is_active);
END;
GO

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NOT NULL
BEGIN
  DECLARE @liquor_seed TABLE (
    pay_today_merchant_id INT NOT NULL,
    day_of_week TINYINT NOT NULL,
    start_minutes INT NOT NULL,
    end_minutes INT NOT NULL,
    is_active BIT NOT NULL
  );

  INSERT INTO @liquor_seed (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
  VALUES
    (991001, 1, 600, 1200, 1),
    (991001, 2, 900, 1200, 1),
    (991001, 3, 900, 1200, 1),
    (991001, 4, 600, 1200, 1),
    (991001, 5, 600, 1200, 1),
    (991001, 6, 600, 1200, 1);

  MERGE dbo.liquor_selling_hours AS t
  USING (
    SELECT s.pay_today_merchant_id, s.day_of_week, s.start_minutes, s.end_minutes, s.is_active
    FROM @liquor_seed s
    INNER JOIN dbo.businesses b ON b.pay_today_merchant_id = s.pay_today_merchant_id
  ) AS src
    ON t.pay_today_merchant_id = src.pay_today_merchant_id AND t.day_of_week = src.day_of_week
  WHEN MATCHED THEN
    UPDATE SET
      start_minutes = src.start_minutes,
      end_minutes = src.end_minutes,
      is_active = src.is_active
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
    VALUES (src.pay_today_merchant_id, src.day_of_week, src.start_minutes, src.end_minutes, src.is_active);
END;
GO
