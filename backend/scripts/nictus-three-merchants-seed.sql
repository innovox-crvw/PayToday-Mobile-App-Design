/*
  Multi-merchant demo: three PayToday merchants (Nictus, Outdoor Center, MTC), three admin users,
  userbusinesses (or legacy user_businesses) links, and 20 products (7 / 7 / 6) with distinct brands + images + inventory.

  Prerequisites:
    - Run wipe-catalog-keep-users.sql first if you need a clean catalogue.
    - dbo.warehouses has at least one row; dbo.categories has groceries (or any row — first category used).
    - Migration 022: dbo.products and dbo.businesses use pay_today_merchant_id.

  Idempotent:
    - Deletes prior seed products: slug LIKE N'nictus-catalog-%' OR N'demo-mm-%'.
    - Upserts three businesses and three users (fixed UUIDs); replaces membership rows for these users + merchants.

  Run:
    sqlcmd -S SERVER -d paytoday -E -C -b -i backend/scripts/nictus-three-merchants-seed.sql

  Login (bcrypt = PayToday123!):
    nictus.admin@paytoday.local
    outdoor.admin@paytoday.local
    mtc.admin@paytoday.local
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

DECLARE @modernCatalog BIT =
  CASE
    WHEN COL_LENGTH(N'dbo.products', N'pay_today_merchant_id') IS NOT NULL
      AND COL_LENGTH(N'dbo.businesses', N'pay_today_merchant_id') IS NOT NULL
    THEN 1
    ELSE 0
  END;

DECLARE @ubUserbusinesses BIT =
  CASE WHEN OBJECT_ID(N'dbo.userbusinesses', N'U') IS NOT NULL THEN 1 ELSE 0 END;

DECLARE @ubMerchantLink BIT =
  CASE WHEN COL_LENGTH(N'dbo.user_businesses', N'pay_today_merchant_id') IS NOT NULL THEN 1 ELSE 0 END;

DECLARE @ubStableBusinessId BIT =
  CASE
    WHEN OBJECT_ID(N'dbo.user_businesses', N'U') IS NOT NULL
      AND COL_LENGTH(N'dbo.user_businesses', N'business_id') IS NOT NULL
      AND COL_LENGTH(N'dbo.user_businesses', N'pay_today_merchant_id') IS NULL
    THEN 1
    ELSE 0
  END;

IF @modernCatalog = 0
BEGIN
  RAISERROR(
    N'nictus-three-merchants-seed: dbo.products and dbo.businesses must have pay_today_merchant_id (migration 022).',
    16,
    1
  );
  RETURN;
END;

DECLARE @m1 INT = 931001;
DECLARE @m2 INT = 931002;
DECLARE @m3 INT = 931003;

DECLARE @u1 UNIQUEIDENTIFIER = N'A1000001-0000-4000-8000-000000000001';
DECLARE @u2 UNIQUEIDENTIFIER = N'A1000002-0000-4000-8000-000000000002';
DECLARE @u3 UNIQUEIDENTIFIER = N'A1000003-0000-4000-8000-000000000003';

DECLARE @pwd NVARCHAR(200) =
  N'$2b$10$.5RgDox23EnGCv9NKp/mouLCbMM6sfFMiJqHRWr6loRLK.Lj24/te';

DECLARE @wh UNIQUEIDENTIFIER =
  (SELECT TOP 1 CAST(id AS UNIQUEIDENTIFIER) FROM dbo.warehouses ORDER BY code);
DECLARE @cat UNIQUEIDENTIFIER =
  (
    SELECT TOP 1 CAST(id AS UNIQUEIDENTIFIER)
    FROM dbo.categories
    WHERE slug = N'groceries' AND COALESCE(is_active, 1) = 1
    ORDER BY sort_order, name
  );

IF @wh IS NULL
BEGIN
  RAISERROR(N'nictus-three-merchants-seed: no warehouse row found.', 16, 1);
  RETURN;
END;

IF @cat IS NULL
  SET @cat =
    (SELECT TOP 1 CAST(id AS UNIQUEIDENTIFIER) FROM dbo.categories ORDER BY sort_order, name);

IF @cat IS NULL
BEGIN
  RAISERROR(N'nictus-three-merchants-seed: no category row found.', 16, 1);
  RETURN;
END;

BEGIN TRY
  BEGIN TRAN;

  PRINT N'Removing prior multi-merchant seed products...';
  IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL
    DELETE FROM dbo.products
    WHERE slug LIKE N'nictus-catalog-%' OR slug LIKE N'demo-mm-%';

  PRINT N'Upserting three merchants (modern PK)...';

  IF NOT EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = @m1)
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
      @m1, 1, 1, 1, 0, 0, @m1, N'Retail', N'Nictus Namibia', N'Nictus Namibia', N'Windhoek', NULL, N'90001', NULL,
      N'Windhoek', N'Namibia', N'NICTUS-SEED-931001', N'N/A', N'Nictus Merchant Admin', N'N/A', N'+2640000001',
      N'nictus.admin@paytoday.local', N'Nictus Namibia demo store.', N'Admin', N'nictus.admin@paytoday.local', 1,
      NULL, N'Main', N'00000001', 0, 0, 0, N'', N'3', N'', NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, N'nictus-store', SYSUTCDATETIME(), SYSUTCDATETIME()
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = @m2)
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
      @m2, 1, 1, 1, 0, 0, @m2, N'Retail', N'Outdoor Center', N'Outdoor Center', N'Oshakati', NULL, N'90002', NULL,
      N'Oshakati', N'Namibia', N'OUTDOOR-SEED-931002', N'N/A', N'Outdoor Center Admin', N'N/A', N'+2640000002',
      N'outdoor.admin@paytoday.local', N'Outdoor gear and apparel demo store.', N'Admin', N'outdoor.admin@paytoday.local', 1,
      NULL, N'Main', N'00000002', 0, 0, 0, N'', N'3', N'', NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, N'outdoor-center-store', SYSUTCDATETIME(), SYSUTCDATETIME()
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = @m3)
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
      @m3, 1, 1, 1, 0, 0, @m3, N'Retail', N'MTC Express', N'MTC Express', N'Swakopmund', NULL, N'90003', NULL,
      N'Swakopmund', N'Namibia', N'MTC-SEED-931003', N'N/A', N'MTC Merchant Admin', N'N/A', N'+2640000003',
      N'mtc.admin@paytoday.local', N'MTC retail demo store.', N'Admin', N'mtc.admin@paytoday.local', 1,
      NULL, N'Main', N'00000003', 0, 0, 0, N'', N'3', N'', NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, N'mtc-express-store', SYSUTCDATETIME(), SYSUTCDATETIME()
    );

  UPDATE dbo.businesses
  SET
    name = N'Nictus Namibia',
    registered_business_name = N'Nictus Namibia',
    business_email_address = N'nictus.admin@paytoday.local',
    invoice_email = N'nictus.admin@paytoday.local',
    slug = N'nictus-store',
    registration_number = N'NICTUS-SEED-931001',
    description = N'Nictus Namibia demo store.',
    updated_at = SYSUTCDATETIME()
  WHERE pay_today_merchant_id = @m1;

  UPDATE dbo.businesses
  SET
    name = N'Outdoor Center',
    registered_business_name = N'Outdoor Center',
    business_email_address = N'outdoor.admin@paytoday.local',
    invoice_email = N'outdoor.admin@paytoday.local',
    slug = N'outdoor-center-store',
    registration_number = N'OUTDOOR-SEED-931002',
    description = N'Outdoor gear and apparel demo store.',
    updated_at = SYSUTCDATETIME()
  WHERE pay_today_merchant_id = @m2;

  UPDATE dbo.businesses
  SET
    name = N'MTC Express',
    registered_business_name = N'MTC Express',
    business_email_address = N'mtc.admin@paytoday.local',
    invoice_email = N'mtc.admin@paytoday.local',
    slug = N'mtc-express-store',
    registration_number = N'MTC-SEED-931003',
    description = N'MTC retail demo store.',
    updated_at = SYSUTCDATETIME()
  WHERE pay_today_merchant_id = @m3;

  PRINT N'Upserting three admin users...';
  IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @u1)
    INSERT INTO dbo.users (id, email, password_hash, full_name, role, notification_channel)
    VALUES (@u1, N'nictus.admin@paytoday.local', @pwd, N'Nictus Merchant Admin', N'admin', N'email');
  ELSE
    UPDATE dbo.users
    SET
      email = N'nictus.admin@paytoday.local',
      password_hash = @pwd,
      full_name = N'Nictus Merchant Admin',
      role = N'admin',
      notification_channel = N'email'
    WHERE id = @u1;

  IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @u2)
    INSERT INTO dbo.users (id, email, password_hash, full_name, role, notification_channel)
    VALUES (@u2, N'outdoor.admin@paytoday.local', @pwd, N'Outdoor Center Admin', N'admin', N'email');
  ELSE
    UPDATE dbo.users
    SET
      email = N'outdoor.admin@paytoday.local',
      password_hash = @pwd,
      full_name = N'Outdoor Center Admin',
      role = N'admin',
      notification_channel = N'email'
    WHERE id = @u2;

  IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @u3)
    INSERT INTO dbo.users (id, email, password_hash, full_name, role, notification_channel)
    VALUES (@u3, N'mtc.admin@paytoday.local', @pwd, N'MTC Merchant Admin', N'admin', N'email');
  ELSE
    UPDATE dbo.users
    SET
      email = N'mtc.admin@paytoday.local',
      password_hash = @pwd,
      full_name = N'MTC Merchant Admin',
      role = N'admin',
      notification_channel = N'email'
    WHERE id = @u3;

  PRINT N'Linking users to merchants (primary)...';
  IF @ubUserbusinesses = 1
  BEGIN
    DELETE ub
    FROM dbo.userbusinesses ub
    WHERE
      ub.user_id IN (@u1, @u2, @u3)
      AND ub.business_id IN (
        SELECT b.business_id FROM dbo.businesses b WHERE b.pay_today_merchant_id IN (@m1, @m2, @m3)
      );

    INSERT INTO dbo.userbusinesses (user_id, business_id, role, is_primary, joined_at, created_at)
    VALUES
      (@u1, (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @m1), N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (@u2, (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @m2), N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (@u3, (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @m3), N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
  END
  ELSE IF @ubStableBusinessId = 1
  BEGIN
    DELETE ub
    FROM dbo.user_businesses ub
    WHERE
      ub.user_id IN (@u1, @u2, @u3)
      AND ub.business_id IN (
        SELECT b.business_id FROM dbo.businesses b WHERE b.pay_today_merchant_id IN (@m1, @m2, @m3)
      );

    INSERT INTO dbo.user_businesses (user_id, business_id, role, is_primary, joined_at, created_at)
    VALUES
      (@u1, (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @m1), N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (@u2, (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @m2), N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (@u3, (SELECT business_id FROM dbo.businesses WHERE pay_today_merchant_id = @m3), N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
  END
  ELSE IF @ubMerchantLink = 1
  BEGIN
    DELETE ub
    FROM dbo.user_businesses ub
    WHERE
      ub.user_id IN (@u1, @u2, @u3)
      AND ub.pay_today_merchant_id IN (@m1, @m2, @m3);

    INSERT INTO dbo.user_businesses (id, user_id, pay_today_merchant_id, role, is_primary, joined_at, created_at)
    VALUES
      (NEWID(), @u1, @m1, N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (NEWID(), @u2, @m2, N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (NEWID(), @u3, @m3, N'owner', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
  END
  ELSE
  BEGIN
    PRINT N'Note: no dbo.userbusinesses or recognizable dbo.user_businesses link layout — skipping membership seed.';
  END;

  PRINT N'Inserting 20 demo products (Nictus / Outdoor Center / MTC)...';
  DECLARE @n INT = 1;
  DECLARE @mid INT;
  DECLARE @idx INT;
  DECLARE @slugPrefix NVARCHAR(40);
  DECLARE @brandSlug NVARCHAR(80);
  DECLARE @brandName NVARCHAR(160);
  DECLARE @skuPrefix NVARCHAR(40);
  DECLARE @desc NVARCHAR(400);
  DECLARE @pid UNIQUEIDENTIFIER;
  DECLARE @vid UNIQUEIDENTIFIER;
  DECLARE @slug NVARCHAR(160);
  DECLARE @name NVARCHAR(300);
  DECLARE @sku NVARCHAR(80);
  DECLARE @price INT;
  DECLARE @img NVARCHAR(500);
  DECLARE @outPid TABLE (id UNIQUEIDENTIFIER);

  WHILE @n <= 20
  BEGIN
    DELETE FROM @outPid;
    IF @n <= 7
    BEGIN
      SET @mid = @m1;
      SET @idx = @n;
      SET @slugPrefix = N'demo-mm-nictus-';
      SET @brandSlug = N'nictus';
      SET @brandName = N'Nictus';
      SET @skuPrefix = N'DEMO-NIC-';
      SET @desc = N'Nictus Namibia demo catalogue item.';
    END
    ELSE IF @n <= 14
    BEGIN
      SET @mid = @m2;
      SET @idx = @n - 7;
      SET @slugPrefix = N'demo-mm-outdoor-';
      SET @brandSlug = N'outdoor-center';
      SET @brandName = N'Outdoor Center';
      SET @skuPrefix = N'DEMO-OUT-';
      SET @desc = N'Outdoor Center demo catalogue item.';
    END
    ELSE
    BEGIN
      SET @mid = @m3;
      SET @idx = @n - 14;
      SET @slugPrefix = N'demo-mm-mtc-';
      SET @brandSlug = N'mtc';
      SET @brandName = N'MTC';
      SET @skuPrefix = N'DEMO-MTC-';
      SET @desc = N'MTC demo catalogue item.';
    END;

    SET @slug = @slugPrefix + FORMAT(@idx, N'000');
    SET @name = @brandName + N' ' + FORMAT(@idx, N'000') + N' — demo item';
    SET @sku = @skuPrefix + FORMAT(@idx, N'000');
    SET @price = 8900 + (@n * 150);
    SET @img =
      CASE (@n % 4)
        WHEN 0 THEN N'https://images.unsplash.com/photo-1563636619-e9143d4c3b2c?auto=format&fit=crop&w=800&q=80'
        WHEN 1 THEN N'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80'
        WHEN 2 THEN N'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80'
        ELSE N'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80'
      END;

    INSERT INTO dbo.products (
      category_id,
      pay_today_merchant_id,
      slug,
      name,
      description,
      is_active,
      brand_slug,
      brand_name
    )
    OUTPUT INSERTED.id INTO @outPid
    VALUES (
      @cat,
      @mid,
      @slug,
      @name,
      @desc,
      1,
      @brandSlug,
      @brandName
    );

    SELECT @pid = id FROM @outPid;
    SET @vid = NEWID();

    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency)
    VALUES (@vid, @pid, @sku, N'Default', @price, N'NAD');

    BEGIN TRY
      INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES (@pid, @img, 0);
    END TRY
    BEGIN CATCH
      /* product_images table or shape differs on some DBs */
    END CATCH;

    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES (@vid, @wh, 50);

    SET @n = @n + 1;
  END;

  COMMIT TRAN;
  PRINT N'nictus-three-merchants-seed: COMMIT complete (20 products, 3 merchants: Nictus / Outdoor Center / MTC).';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  DECLARE @msg NVARCHAR(4000) = ERROR_MESSAGE();
  DECLARE @sev INT = ERROR_SEVERITY();
  DECLARE @st INT = ERROR_STATE();
  RAISERROR(N'nictus-three-merchants-seed failed: %s', @sev, @st, @msg);
END CATCH;
