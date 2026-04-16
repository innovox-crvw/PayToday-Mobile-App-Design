/*
  Add hub_navigation_tiles + seed if you already created paytoday without this table.
  Includes payment_methods_caption (matches API + migration 003/004).
  Run against the paytoday database in SSMS.
*/
USE [paytoday];
GO

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.hub_navigation_tiles (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hub_nav_tiles PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    hub_kind NVARCHAR(32) NOT NULL,
    slug NVARCHAR(80) NOT NULL,
    label NVARCHAR(160) NOT NULL,
    icon_key NVARCHAR(80) NOT NULL,
    list_style NVARCHAR(20) NULL,
    link_path NVARCHAR(256) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_hub_nav_sort DEFAULT (0),
    is_active BIT NOT NULL CONSTRAINT DF_hub_nav_active DEFAULT (1),
    payment_methods_caption NVARCHAR(200) NULL,
    CONSTRAINT UQ_hub_nav_slug_kind UNIQUE (hub_kind, slug)
  );
  PRINT N'Created dbo.hub_navigation_tiles';
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'payment_methods_caption') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD payment_methods_caption NVARCHAR(200) NULL;
  PRINT N'Table dbo.hub_navigation_tiles already exists — ensured payment_methods_caption column.';
END
GO

/* Re-runnable seed: replace hub tiles from this script */
DELETE FROM dbo.hub_navigation_tiles;

INSERT INTO dbo.hub_navigation_tiles (hub_kind, slug, label, icon_key, list_style, link_path, sort_order, is_active, payment_methods_caption)
VALUES
  (N'payments', N'businesses', N'Businesses', N'business', N'business', N'payments/businesses', 10, 1, N'Wallet · Card · QR'),
  (N'payments', N'contacts', N'Contacts', N'contacts', N'contacts', N'payments/contacts', 20, 1, N'Wallet · Instant pay'),
  (N'payments', N'airtime', N'Airtime', N'airtime', N'business', N'payments/airtime', 30, 1, N'Wallet · Card · Airtime PIN'),
  (N'payments', N'electricity', N'Electricity', N'electricity', N'business', N'payments/electricity', 40, 1, N'Prepaid token · Card · Wallet'),
  (N'payments', N'bills', N'Bills', N'bills', N'business', N'payments/bills', 50, 1, N'Wallet · Card · Reference'),
  (N'payments', N'food', N'Food', N'food', N'business', N'payments/food', 60, 1, N'Card · Wallet · Order ahead'),
  (N'payments', N'fuel', N'Fuel', N'fuel', N'business', N'payments/fuel', 70, 1, N'Fleet card · Wallet'),
  (N'payments', N'parking', N'Parking', N'parking', N'business', N'payments/parking', 80, 1, N'Wallet · Plate / bay ref'),
  (N'payments', N'vouchers', N'Vouchers', N'vouchers', N'business', N'payments/vouchers', 90, 1, N'Card · Wallet · Gift code'),
  (N'payments', N'stay', N'Stay', N'stay', N'business', N'payments/stay', 100, 1, N'Card · Wallet · Deposit'),
  (N'payments', N'services', N'Services', N'services', N'business', N'payments/services', 110, 1, N'Wallet · Card · Invoice ref'),
  (N'services', N'airtime', N'Airtime', N'airtime', NULL, N'services/airtime', 10, 1, N'Wallet · Card · USSD'),
  (N'services', N'water', N'Water', N'water', NULL, N'services/water', 20, 1, N'Wallet · EFT · Municipality ref'),
  (N'services', N'electricity', N'Electricity', N'electricity', NULL, N'services/electricity', 30, 1, N'Prepaid meter · Card · Wallet'),
  (N'services', N'parking', N'Parking', N'parking', NULL, N'services/parking', 40, 1, N'Wallet · Tap to pay'),
  (N'services', N'vouchers', N'Vouchers', N'vouchers', NULL, N'services/vouchers', 50, 1, N'Card · Wallet · Voucher code'),
  (N'services', N'insurance', N'Insurance', N'insurance', NULL, N'services/insurance', 60, 1, N'Card · Debit order'),
  (N'services', N'ussd', N'USSD', N'ussd', NULL, N'services/ussd', 70, 1, N'USSD · *120# (demo)'),
  (N'services', N'store', N'Store', N'storefront', NULL, N'shop', 80, 1, N'Card · Wallet · Pickup');

PRINT N'Seeded hub_navigation_tiles.';
GO
