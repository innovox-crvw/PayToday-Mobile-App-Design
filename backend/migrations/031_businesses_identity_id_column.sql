/*
  dbo.businesses: first column = id (INT IDENTITY(1,1)).

  SQL Server appends new columns; to put id first, data is copied into dbo.businesses_m031_new (id first),
  then dbo.businesses is dropped and the new table is renamed to dbo.businesses.

  Re-run: DELETE FROM dbo.schema_migrations WHERE version = N'031_businesses_identity_id_column';

  Skips if: table missing; business_id missing (run 028); legacy UNIQUEIDENTIFIER id; INT id already column_id 1.

  Rebuilds FK_products_business, FK_userbusinesses_business (or FK_user_businesses_business on legacy user_businesses),
  and views vw_user_business_memberships + usersbusinesses when dbo.userbusinesses exists.
*/

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.businesses', N'U') IS NULL
BEGIN
  PRINT N'031: skipped (dbo.businesses missing).';
  RETURN;
END;

IF COL_LENGTH(N'dbo.businesses', N'business_id') IS NULL
BEGIN
  PRINT N'031: skipped (add dbo.businesses.business_id — migration 028).';
  RETURN;
END;

IF COL_LENGTH(N'dbo.businesses', N'id') = 16
BEGIN
  PRINT N'031: skipped (legacy UNIQUEIDENTIFIER id).';
  RETURN;
END;

DECLARE @idCol SMALLINT =
  (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.businesses') AND name = N'id');
DECLARE @minCol SMALLINT =
  (SELECT MIN(column_id) FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.businesses'));

IF @idCol IS NOT NULL AND @idCol = @minCol AND COL_LENGTH(N'dbo.businesses', N'id') = 4
BEGIN
  PRINT N'031: skipped (INT id already first column).';
  RETURN;
END;

DECLARE @keepIntId BIT = CASE WHEN COL_LENGTH(N'dbo.businesses', N'id') = 4 THEN 1 ELSE 0 END;

IF OBJECT_ID(N'dbo.businesses_m031_new', N'U') IS NOT NULL
  DROP TABLE dbo.businesses_m031_new;

IF OBJECT_ID(N'dbo.usersbusinesses', N'V') IS NOT NULL
  DROP VIEW dbo.usersbusinesses;
IF OBJECT_ID(N'dbo.vw_user_business_memberships', N'V') IS NOT NULL
  DROP VIEW dbo.vw_user_business_memberships;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_products_business' AND parent_object_id = OBJECT_ID(N'dbo.products'))
  ALTER TABLE dbo.products DROP CONSTRAINT FK_products_business;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_userbusinesses_business' AND parent_object_id = OBJECT_ID(N'dbo.userbusinesses'))
  ALTER TABLE dbo.userbusinesses DROP CONSTRAINT FK_userbusinesses_business;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_user_businesses_business' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
  ALTER TABLE dbo.user_businesses DROP CONSTRAINT FK_user_businesses_business;

CREATE TABLE dbo.businesses_m031_new (
  id INT IDENTITY(1,1) NOT NULL,
  pay_today_merchant_id INT NOT NULL,
  business_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_businesses_business_id DEFAULT NEWSEQUENTIALID(),
  request_business_activation BIT NOT NULL CONSTRAINT DF_businesses_request_activation DEFAULT (0),
  kyc_completed BIT NOT NULL CONSTRAINT DF_businesses_kyc_completed DEFAULT (0),
  active BIT NOT NULL CONSTRAINT DF_businesses_active DEFAULT (1),
  rejected BIT NOT NULL CONSTRAINT DF_businesses_rejected DEFAULT (0),
  bulk_upload BIT NOT NULL CONSTRAINT DF_businesses_bulk_upload DEFAULT (0),
  legacy_merchant_user_id INT NULL,
  business_type NVARCHAR(120) NULL,
  name NVARCHAR(300) NOT NULL,
  registered_business_name NVARCHAR(300) NULL,
  address_line1 NVARCHAR(500) NULL,
  address_line2 NVARCHAR(500) NULL,
  postal_address NVARCHAR(500) NULL,
  zipcode NVARCHAR(40) NULL,
  town NVARCHAR(120) NULL,
  country NVARCHAR(120) NULL,
  registration_number NVARCHAR(120) NULL,
  tax_registration_number NVARCHAR(120) NULL,
  business_owner NVARCHAR(200) NULL,
  owner_id_number NVARCHAR(80) NULL,
  contact_number NVARCHAR(40) NULL,
  business_email_address NVARCHAR(320) NULL,
  description NVARCHAR(MAX) NULL,
  invoice_contact NVARCHAR(200) NULL,
  invoice_email NVARCHAR(320) NULL,
  bank_id INT NULL,
  account_holder NVARCHAR(200) NULL,
  bank_account_name NVARCHAR(200) NULL,
  account_number NVARCHAR(64) NULL,
  is_fuel_supported BIT NOT NULL CONSTRAINT DF_businesses_fuel DEFAULT (0),
  cash_out BIT NOT NULL CONSTRAINT DF_businesses_cash_out DEFAULT (0),
  voucher_3w BIT NOT NULL CONSTRAINT DF_businesses_voucher_3w DEFAULT (0),
  dynamic_field_text NVARCHAR(MAX) NULL,
  email_notifications NVARCHAR(40) NULL,
  notification_details NVARCHAR(MAX) NULL,
  tandcs NVARCHAR(MAX) NULL,
  bipa NVARCHAR(MAX) NULL,
  namra NVARCHAR(MAX) NULL,
  id_doc NVARCHAR(MAX) NULL,
  bank_confirmation NVARCHAR(MAX) NULL,
  image_filename NVARCHAR(2000) NULL,
  website NVARCHAR(2000) NULL,
  category NVARCHAR(120) NULL,
  subcategory NVARCHAR(120) NULL,
  slug NVARCHAR(120) NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_businesses_created DEFAULT (SYSUTCDATETIME()),
  updated_at DATETIME2 NULL,
  CONSTRAINT PK_businesses_m031_new PRIMARY KEY CLUSTERED (pay_today_merchant_id)
);

CREATE UNIQUE NONCLUSTERED INDEX UQ_businesses_m031_new_business_id ON dbo.businesses_m031_new (business_id);

CREATE UNIQUE NONCLUSTERED INDEX UQ_businesses_m031_new_registration_number
  ON dbo.businesses_m031_new (registration_number)
  WHERE registration_number IS NOT NULL;

IF @keepIntId = 1
BEGIN
  SET IDENTITY_INSERT dbo.businesses_m031_new ON;

  INSERT INTO dbo.businesses_m031_new (
    id, pay_today_merchant_id, business_id, request_business_activation, kyc_completed, active, rejected, bulk_upload,
    legacy_merchant_user_id, business_type, name, registered_business_name, address_line1, address_line2,
    postal_address, zipcode, town, country, registration_number, tax_registration_number, business_owner,
    owner_id_number, contact_number, business_email_address, description, invoice_contact, invoice_email,
    bank_id, account_holder, bank_account_name, account_number, is_fuel_supported, cash_out, voucher_3w,
    dynamic_field_text, email_notifications, notification_details, tandcs, bipa, namra, id_doc, bank_confirmation,
    image_filename, website, category, subcategory, slug, created_at, updated_at
  )
  SELECT
    o.id, o.pay_today_merchant_id, o.business_id, o.request_business_activation, o.kyc_completed, o.active, o.rejected, o.bulk_upload,
    o.legacy_merchant_user_id, o.business_type, o.name, o.registered_business_name, o.address_line1, o.address_line2,
    o.postal_address, o.zipcode, o.town, o.country, o.registration_number, o.tax_registration_number, o.business_owner,
    o.owner_id_number, o.contact_number, o.business_email_address, o.description, o.invoice_contact, o.invoice_email,
    o.bank_id, o.account_holder, o.bank_account_name, o.account_number, o.is_fuel_supported, o.cash_out, o.voucher_3w,
    o.dynamic_field_text, o.email_notifications, o.notification_details, o.tandcs, o.bipa, o.namra, o.id_doc, o.bank_confirmation,
    o.image_filename, o.website, o.category, o.subcategory, o.slug, o.created_at, o.updated_at
  FROM dbo.businesses AS o
  ORDER BY o.id;

  SET IDENTITY_INSERT dbo.businesses_m031_new OFF;

  DECLARE @maxId INT = (SELECT ISNULL(MAX(id), 0) FROM dbo.businesses_m031_new);
  DBCC CHECKIDENT (N'dbo.businesses_m031_new', RESEED, @maxId);
END;
ELSE
BEGIN
  INSERT INTO dbo.businesses_m031_new (
    pay_today_merchant_id, business_id, request_business_activation, kyc_completed, active, rejected, bulk_upload,
    legacy_merchant_user_id, business_type, name, registered_business_name, address_line1, address_line2,
    postal_address, zipcode, town, country, registration_number, tax_registration_number, business_owner,
    owner_id_number, contact_number, business_email_address, description, invoice_contact, invoice_email,
    bank_id, account_holder, bank_account_name, account_number, is_fuel_supported, cash_out, voucher_3w,
    dynamic_field_text, email_notifications, notification_details, tandcs, bipa, namra, id_doc, bank_confirmation,
    image_filename, website, category, subcategory, slug, created_at, updated_at
  )
  SELECT
    o.pay_today_merchant_id, o.business_id, o.request_business_activation, o.kyc_completed, o.active, o.rejected, o.bulk_upload,
    o.legacy_merchant_user_id, o.business_type, o.name, o.registered_business_name, o.address_line1, o.address_line2,
    o.postal_address, o.zipcode, o.town, o.country, o.registration_number, o.tax_registration_number, o.business_owner,
    o.owner_id_number, o.contact_number, o.business_email_address, o.description, o.invoice_contact, o.invoice_email,
    o.bank_id, o.account_holder, o.bank_account_name, o.account_number, o.is_fuel_supported, o.cash_out, o.voucher_3w,
    o.dynamic_field_text, o.email_notifications, o.notification_details, o.tandcs, o.bipa, o.namra, o.id_doc, o.bank_confirmation,
    o.image_filename, o.website, o.category, o.subcategory, o.slug, o.created_at, o.updated_at
  FROM dbo.businesses AS o
  ORDER BY o.pay_today_merchant_id;
END;

DROP TABLE dbo.businesses;

EXEC sp_rename N'dbo.businesses_m031_new', N'businesses';
EXEC sp_rename N'PK_businesses_m031_new', N'PK_businesses', N'OBJECT';
EXEC sp_rename N'businesses.UQ_businesses_m031_new_business_id', N'UQ_businesses_business_id', N'INDEX';
EXEC sp_rename N'businesses.UQ_businesses_m031_new_registration_number', N'UQ_businesses_registration_number', N'INDEX';

IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.products', N'pay_today_merchant_id') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_products_business' AND parent_object_id = OBJECT_ID(N'dbo.products'))
BEGIN
  ALTER TABLE dbo.products
    ADD CONSTRAINT FK_products_business FOREIGN KEY (pay_today_merchant_id)
    REFERENCES dbo.businesses (pay_today_merchant_id);
END;

IF OBJECT_ID(N'dbo.userbusinesses', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_userbusinesses_business' AND parent_object_id = OBJECT_ID(N'dbo.userbusinesses'))
BEGIN
  ALTER TABLE dbo.userbusinesses
    ADD CONSTRAINT FK_userbusinesses_business FOREIGN KEY (business_id)
    REFERENCES dbo.businesses (business_id) ON DELETE CASCADE;
END;

IF OBJECT_ID(N'dbo.user_businesses', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.user_businesses', N'business_id') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_user_businesses_business' AND parent_object_id = OBJECT_ID(N'dbo.user_businesses'))
BEGIN
  ALTER TABLE dbo.user_businesses
    ADD CONSTRAINT FK_user_businesses_business FOREIGN KEY (business_id)
    REFERENCES dbo.businesses (business_id) ON DELETE CASCADE;
END;

IF OBJECT_ID(N'dbo.userbusinesses', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.users', N'U') IS NOT NULL
  AND OBJECT_ID(N'dbo.businesses', N'U') IS NOT NULL
BEGIN
  EXEC sp_executesql N'
CREATE VIEW dbo.vw_user_business_memberships AS
SELECT
  ub.business_id,
  ub.user_id,
  u.email AS user_email,
  COALESCE(
    NULLIF(LTRIM(RTRIM(u.full_name)), N'''' ),
    NULLIF(LTRIM(RTRIM(CONCAT_WS(N'' '', u.first_name, u.last_name))), N'''' )
  ) AS user_display_name,
  u.first_name AS user_first_name,
  u.last_name AS user_last_name,
  b.pay_today_merchant_id,
  CAST(NULL AS UNIQUEIDENTIFIER) AS business_id_legacy,
  b.name AS business_name,
  b.registration_number AS business_registration_number,
  ub.role AS membership_role,
  ub.is_primary AS membership_is_primary,
  ub.joined_at AS membership_joined_at,
  ub.created_at AS membership_created_at
FROM dbo.userbusinesses AS ub
INNER JOIN dbo.users AS u ON u.id = ub.user_id
INNER JOIN dbo.businesses AS b ON b.business_id = ub.business_id;
';

  EXEC sp_executesql N'
CREATE VIEW dbo.usersbusinesses AS
SELECT
  ub.user_id,
  ub.business_id,
  ub.role,
  ub.is_primary,
  ub.joined_at
FROM dbo.userbusinesses AS ub
INNER JOIN dbo.users AS u ON u.id = ub.user_id
INNER JOIN dbo.businesses AS b ON b.business_id = ub.business_id;
';
END;

PRINT N'031: dbo.businesses recreated; id is the first column.';
