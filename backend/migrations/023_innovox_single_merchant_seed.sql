/*
  Ensure Innovox merchant (pay_today_merchant_id 5229) exists and link app users to it.
  Does not delete other businesses or repoint all products (multi-tenant safe).

  Runs after 022_businesses_merchant_pk. Prefer dbo.userbusinesses (post-030); else legacy dbo.user_businesses.
*/

DECLARE @inv INT = 5229;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'pay_today_merchant_id') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = @inv)
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
      @inv, 1, 1, 1, 0, 0, 12591, N'Pty Ltd', N'Innovox', N'Innovox', N'29 Feld Street', NULL, N'81317', NULL,
      N'Windhoek', N'Namibia', N'N/A', N'N/A', N'Barend De Villiers', N'92051600163', N'264816222724',
      N'brendus.devilliers@gmail.com', N'Innovox Digital Consulting', N'Barend', N'brendus.devilliers@gmail.com', 3,
      NULL, N'Main', N'64287087835', 0, 0, 0, N'', N'3', N'', NULL, NULL, NULL, NULL, NULL,
      N'https://nedbankstorage.blob.core.windows.net/nedbankclouddatadisk/upload/logo/avatar1_819jlpU.png',
      NULL, NULL, NULL, N'innovox', SYSUTCDATETIME(), SYSUTCDATETIME()
    );
  END
  ELSE
  BEGIN
    UPDATE dbo.businesses
    SET
      request_business_activation = 1,
      kyc_completed = 1,
      active = 1,
      rejected = 0,
      bulk_upload = 0,
      legacy_merchant_user_id = 12591,
      business_type = N'Pty Ltd',
      name = N'Innovox',
      registered_business_name = N'Innovox',
      address_line1 = N'29 Feld Street',
      address_line2 = NULL,
      postal_address = N'81317',
      zipcode = NULL,
      town = N'Windhoek',
      country = N'Namibia',
      registration_number = N'N/A',
      tax_registration_number = N'N/A',
      business_owner = N'Barend De Villiers',
      owner_id_number = N'92051600163',
      contact_number = N'264816222724',
      business_email_address = N'brendus.devilliers@gmail.com',
      description = N'Innovox Digital Consulting',
      invoice_contact = N'Barend',
      invoice_email = N'brendus.devilliers@gmail.com',
      bank_id = 3,
      account_holder = NULL,
      bank_account_name = N'Main',
      account_number = N'64287087835',
      is_fuel_supported = 0,
      cash_out = 0,
      voucher_3w = 0,
      dynamic_field_text = N'',
      email_notifications = N'3',
      notification_details = N'',
      tandcs = NULL,
      bipa = NULL,
      namra = NULL,
      id_doc = NULL,
      bank_confirmation = NULL,
      image_filename = N'https://nedbankstorage.blob.core.windows.net/nedbankclouddatadisk/upload/logo/avatar1_819jlpU.png',
      website = NULL,
      category = NULL,
      subcategory = NULL,
      slug = N'innovox',
      updated_at = SYSUTCDATETIME()
    WHERE pay_today_merchant_id = @inv;
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(LTRIM(RTRIM(N'brendus.devilliers@gmail.com'))))
  BEGIN
    INSERT INTO dbo.users (id, email, password_hash, full_name, role, notification_channel)
    VALUES (
      N'50000000-0000-0000-0000-000000000010',
      N'brendus.devilliers@gmail.com',
      N'$2b$10$.5RgDox23EnGCv9NKp/mouLCbMM6sfFMiJqHRWr6loRLK.Lj24/te',
      N'Barend De Villiers',
      N'customer',
      N'email'
    );
  END;

  /* Branches that reference legacy business_id are wrapped in EXEC for deferred compilation:
     SQL Server compiles the whole batch up front; after migrations 022/030 those columns no
     longer exist on dbo.businesses / dbo.user_businesses, so static SQL fails to bind. The
     EXEC string is parsed only when the surrounding IF actually selects that branch. */
  IF OBJECT_ID(N'dbo.userbusinesses', N'U') IS NOT NULL
    AND COL_LENGTH(N'dbo.businesses', N'business_id') IS NOT NULL
  BEGIN
    EXEC sp_executesql N'
INSERT INTO dbo.userbusinesses (user_id, business_id, role, is_primary, joined_at, created_at)
SELECT
  u.id,
  b.business_id,
  CASE
    WHEN u.role IN (N''admin'', N''ops'', N''fulfillment'') THEN N''owner''
    WHEN LOWER(LTRIM(RTRIM(u.email))) = LOWER(LTRIM(RTRIM(N''brendus.devilliers@gmail.com''))) THEN N''owner''
    ELSE N''member''
  END,
  0,
  SYSUTCDATETIME(),
  SYSUTCDATETIME()
FROM dbo.users u
CROSS JOIN (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @inv) AS b
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.userbusinesses ub WHERE ub.user_id = u.id AND ub.business_id = b.business_id
);', N'@inv INT', @inv = @inv;
  END
  ELSE IF OBJECT_ID(N'dbo.user_businesses', N'U') IS NOT NULL
  BEGIN
    IF COL_LENGTH(N'dbo.user_businesses', N'pay_today_merchant_id') IS NOT NULL
    BEGIN
      INSERT INTO dbo.user_businesses (id, user_id, pay_today_merchant_id, role, is_primary, joined_at, created_at)
      SELECT
        NEWID(),
        u.id,
        @inv,
        CASE
          WHEN u.role IN (N'admin', N'ops', N'fulfillment') THEN N'owner'
          WHEN LOWER(LTRIM(RTRIM(u.email))) = LOWER(LTRIM(RTRIM(N'brendus.devilliers@gmail.com'))) THEN N'owner'
          ELSE N'member'
        END,
        0,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
      FROM dbo.users u
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.user_businesses ub WHERE ub.user_id = u.id AND ub.pay_today_merchant_id = @inv
      );
    END
    ELSE IF COL_LENGTH(N'dbo.user_businesses', N'business_id') IS NOT NULL
      AND COL_LENGTH(N'dbo.businesses', N'business_id') IS NOT NULL
    BEGIN
      EXEC sp_executesql N'
INSERT INTO dbo.user_businesses (user_id, business_id, role, is_primary, joined_at, created_at)
SELECT
  u.id,
  b.business_id,
  CASE
    WHEN u.role IN (N''admin'', N''ops'', N''fulfillment'') THEN N''owner''
    WHEN LOWER(LTRIM(RTRIM(u.email))) = LOWER(LTRIM(RTRIM(N''brendus.devilliers@gmail.com''))) THEN N''owner''
    ELSE N''member''
  END,
  0,
  SYSUTCDATETIME(),
  SYSUTCDATETIME()
FROM dbo.users u
CROSS JOIN (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @inv) AS b
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.user_businesses ub
  WHERE ub.user_id = u.id AND ub.business_id = b.business_id
);', N'@inv INT', @inv = @inv;
    END;
  END;
END;
GO
