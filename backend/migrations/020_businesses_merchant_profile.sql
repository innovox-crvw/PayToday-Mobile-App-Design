/*
  Merchant / KYC profile on dbo.businesses (legacy PayToday “merchants” shape).

  Replaces: vat_number, email, phone, address, is_active
  With: tax_registration_number, business_email_address, contact_number, address_line1.., active, etc.

  Idempotent. Skips all steps if dbo.businesses is missing.
*/

/* ---- Add new columns ---- */

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'pay_today_merchant_id') IS NULL
  ALTER TABLE dbo.businesses ADD pay_today_merchant_id INT NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'request_business_activation') IS NULL
  ALTER TABLE dbo.businesses ADD request_business_activation BIT NOT NULL CONSTRAINT DF_businesses_request_activation DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'kyc_completed') IS NULL
  ALTER TABLE dbo.businesses ADD kyc_completed BIT NOT NULL CONSTRAINT DF_businesses_kyc_completed DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'active') IS NULL
  ALTER TABLE dbo.businesses ADD active BIT NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'rejected') IS NULL
  ALTER TABLE dbo.businesses ADD rejected BIT NOT NULL CONSTRAINT DF_businesses_rejected DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'bulk_upload') IS NULL
  ALTER TABLE dbo.businesses ADD bulk_upload BIT NOT NULL CONSTRAINT DF_businesses_bulk_upload DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'legacy_merchant_user_id') IS NULL
  ALTER TABLE dbo.businesses ADD legacy_merchant_user_id INT NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'business_type') IS NULL
  ALTER TABLE dbo.businesses ADD business_type NVARCHAR(120) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'registered_business_name') IS NULL
  ALTER TABLE dbo.businesses ADD registered_business_name NVARCHAR(300) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'address_line1') IS NULL
  ALTER TABLE dbo.businesses ADD address_line1 NVARCHAR(500) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'address_line2') IS NULL
  ALTER TABLE dbo.businesses ADD address_line2 NVARCHAR(500) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'postal_address') IS NULL
  ALTER TABLE dbo.businesses ADD postal_address NVARCHAR(500) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'zipcode') IS NULL
  ALTER TABLE dbo.businesses ADD zipcode NVARCHAR(40) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'town') IS NULL
  ALTER TABLE dbo.businesses ADD town NVARCHAR(120) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'tax_registration_number') IS NULL
  ALTER TABLE dbo.businesses ADD tax_registration_number NVARCHAR(120) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'business_owner') IS NULL
  ALTER TABLE dbo.businesses ADD business_owner NVARCHAR(200) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'owner_id_number') IS NULL
  ALTER TABLE dbo.businesses ADD owner_id_number NVARCHAR(80) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'contact_number') IS NULL
  ALTER TABLE dbo.businesses ADD contact_number NVARCHAR(40) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'business_email_address') IS NULL
  ALTER TABLE dbo.businesses ADD business_email_address NVARCHAR(320) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'description') IS NULL
  ALTER TABLE dbo.businesses ADD description NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'invoice_contact') IS NULL
  ALTER TABLE dbo.businesses ADD invoice_contact NVARCHAR(200) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'invoice_email') IS NULL
  ALTER TABLE dbo.businesses ADD invoice_email NVARCHAR(320) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'bank_id') IS NULL
  ALTER TABLE dbo.businesses ADD bank_id INT NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'account_holder') IS NULL
  ALTER TABLE dbo.businesses ADD account_holder NVARCHAR(200) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'bank_account_name') IS NULL
  ALTER TABLE dbo.businesses ADD bank_account_name NVARCHAR(200) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'account_number') IS NULL
  ALTER TABLE dbo.businesses ADD account_number NVARCHAR(64) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'is_fuel_supported') IS NULL
  ALTER TABLE dbo.businesses ADD is_fuel_supported BIT NOT NULL CONSTRAINT DF_businesses_fuel DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'cash_out') IS NULL
  ALTER TABLE dbo.businesses ADD cash_out BIT NOT NULL CONSTRAINT DF_businesses_cash_out DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'voucher_3w') IS NULL
  ALTER TABLE dbo.businesses ADD voucher_3w BIT NOT NULL CONSTRAINT DF_businesses_voucher_3w DEFAULT (0);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'dynamic_field_text') IS NULL
  ALTER TABLE dbo.businesses ADD dynamic_field_text NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'email_notifications') IS NULL
  ALTER TABLE dbo.businesses ADD email_notifications NVARCHAR(40) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'notification_details') IS NULL
  ALTER TABLE dbo.businesses ADD notification_details NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'tandcs') IS NULL
  ALTER TABLE dbo.businesses ADD tandcs NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'bipa') IS NULL
  ALTER TABLE dbo.businesses ADD bipa NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'namra') IS NULL
  ALTER TABLE dbo.businesses ADD namra NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'id_doc') IS NULL
  ALTER TABLE dbo.businesses ADD id_doc NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'bank_confirmation') IS NULL
  ALTER TABLE dbo.businesses ADD bank_confirmation NVARCHAR(MAX) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'image_filename') IS NULL
  ALTER TABLE dbo.businesses ADD image_filename NVARCHAR(2000) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'website') IS NULL
  ALTER TABLE dbo.businesses ADD website NVARCHAR(2000) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'category') IS NULL
  ALTER TABLE dbo.businesses ADD category NVARCHAR(120) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'subcategory') IS NULL
  ALTER TABLE dbo.businesses ADD subcategory NVARCHAR(120) NULL;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'slug') IS NULL
  ALTER TABLE dbo.businesses ADD slug NVARCHAR(120) NULL;
GO

/* ---- Copy from legacy columns; retire is_active before adding default on active ---- */

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'vat_number') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'tax_registration_number') IS NOT NULL
BEGIN
  UPDATE dbo.businesses
  SET tax_registration_number = COALESCE(tax_registration_number, vat_number)
  WHERE vat_number IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'email') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'business_email_address') IS NOT NULL
BEGIN
  UPDATE dbo.businesses
  SET business_email_address = COALESCE(business_email_address, email)
  WHERE email IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'phone') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'contact_number') IS NOT NULL
BEGIN
  UPDATE dbo.businesses
  SET contact_number = COALESCE(contact_number, phone)
  WHERE phone IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'address') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'address_line1') IS NOT NULL
BEGIN
  UPDATE dbo.businesses
  SET address_line1 = COALESCE(address_line1, address)
  WHERE address IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'is_active') IS NOT NULL
  AND COL_LENGTH(N'dbo.businesses', N'active') IS NOT NULL
BEGIN
  UPDATE dbo.businesses SET active = is_active WHERE active IS NULL;
END;
GO

DECLARE @dc_is_active SYSNAME;
DECLARE @drop_is_active nvarchar(400);

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'is_active') IS NOT NULL
BEGIN
  SELECT @dc_is_active = dc.name
  FROM sys.default_constraints dc
  INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID(N'dbo.businesses') AND c.name = N'is_active';

  IF @dc_is_active IS NOT NULL
  BEGIN
    SET @drop_is_active = N'ALTER TABLE dbo.businesses DROP CONSTRAINT ' + QUOTENAME(@dc_is_active);
    EXEC sp_executesql @drop_is_active;
  END;
  ALTER TABLE dbo.businesses DROP COLUMN is_active;
END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'active') IS NOT NULL
BEGIN
  UPDATE dbo.businesses SET active = 1 WHERE active IS NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.businesses') AND c.name = N'active'
  )
    ALTER TABLE dbo.businesses ADD CONSTRAINT DF_businesses_active DEFAULT (1) FOR active;

  ALTER TABLE dbo.businesses ALTER COLUMN active BIT NOT NULL;
END;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'vat_number') IS NOT NULL
  ALTER TABLE dbo.businesses DROP COLUMN vat_number;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'email') IS NOT NULL
  ALTER TABLE dbo.businesses DROP COLUMN email;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'phone') IS NOT NULL
  ALTER TABLE dbo.businesses DROP COLUMN phone;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.businesses', N'address') IS NOT NULL
  ALTER TABLE dbo.businesses DROP COLUMN address;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = N'UQ_businesses_pay_today_merchant_id' AND object_id = OBJECT_ID(N'dbo.businesses')
  )
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UQ_businesses_pay_today_merchant_id
    ON dbo.businesses(pay_today_merchant_id)
    WHERE pay_today_merchant_id IS NOT NULL;
END;
GO
