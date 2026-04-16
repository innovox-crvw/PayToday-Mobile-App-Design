/*
  Bootstrap Payments/Services hub tables when missing or incomplete.
  Fixes: Invalid object name hub_navigation_tiles / hub_payment_category_items,
         Invalid column name hub_kind, slug, payment_methods_caption, payment_method.
  Safe to re-run: creates tables if missing; adds missing columns; seeds only when tables are empty.
*/

/* ---- dbo.hub_navigation_tiles ---- */
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
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'hub_kind') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD hub_kind NVARCHAR(32) NULL;
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'slug') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD slug NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'label') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD label NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'icon_key') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD icon_key NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'list_style') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD list_style NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'link_path') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD link_path NVARCHAR(256) NULL;
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'sort_order') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD sort_order INT NOT NULL CONSTRAINT DF_hub_nav_sort_missing DEFAULT (0);
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'is_active') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD is_active BIT NOT NULL CONSTRAINT DF_hub_nav_active_missing DEFAULT (1);
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'payment_methods_caption') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD payment_methods_caption NVARCHAR(200) NULL;
END;
GO

/* Seed hub tiles only when empty (avoids wiping custom rows). */
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.hub_navigation_tiles)
BEGIN
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
END;
GO

/* ---- dbo.hub_payment_category_items ---- */
IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.hub_payment_category_items (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hub_pay_items PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    category_slug NVARCHAR(80) NOT NULL,
    item_kind NVARCHAR(20) NOT NULL,
    display_name NVARCHAR(300) NOT NULL,
    initials NVARCHAR(20) NULL,
    sort_order INT NOT NULL CONSTRAINT DF_hub_item_sort DEFAULT (0),
    is_active BIT NOT NULL CONSTRAINT DF_hub_item_active DEFAULT (1),
    payment_method NVARCHAR(120) NULL
  );
END
ELSE
BEGIN
  IF COL_LENGTH('dbo.hub_payment_category_items', 'category_slug') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD category_slug NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.hub_payment_category_items', 'item_kind') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD item_kind NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.hub_payment_category_items', 'display_name') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD display_name NVARCHAR(300) NULL;
  IF COL_LENGTH('dbo.hub_payment_category_items', 'initials') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD initials NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.hub_payment_category_items', 'sort_order') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD sort_order INT NOT NULL CONSTRAINT DF_hub_item_sort_missing DEFAULT (0);
  IF COL_LENGTH('dbo.hub_payment_category_items', 'is_active') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD is_active BIT NOT NULL CONSTRAINT DF_hub_item_active_missing DEFAULT (1);
  IF COL_LENGTH('dbo.hub_payment_category_items', 'payment_method') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
END;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.hub_payment_category_items)
BEGIN
  INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, sort_order, is_active, payment_method)
  VALUES
    (N'businesses', N'business', N'Okahandja Traders', NULL, 10, 1, N'PayToday Wallet · Visa / Mastercard'),
    (N'businesses', N'business', N'Windhoek Fresh Market', NULL, 20, 1, N'Wallet · Card · SnapScan (demo)'),
    (N'businesses', N'business', N'Namibia Auto Parts', NULL, 30, 1, N'EFT ref · Card · Wallet'),
    (N'contacts', N'contact', N'Anna Nghipondoka', N'AN', 10, 1, N'Wallet only · P2P'),
    (N'contacts', N'contact', N'Johan van Wyk', N'JW', 20, 1, N'Wallet · Instant'),
    (N'contacts', N'contact', N'Lisa #Shapumba', N'LS', 30, 1, N'Wallet · Card'),
    (N'airtime', N'business', N'MTC Prepaid', NULL, 10, 1, N'Wallet · MTC app · USSD'),
    (N'airtime', N'business', N'TN Mobile', NULL, 20, 1, N'Card · TN Mobile voucher'),
    (N'electricity', N'business', N'Nampower Prepaid', NULL, 10, 1, N'Meter number · Card · Wallet'),
    (N'bills', N'business', N'Municipality — Windhoek', NULL, 10, 1, N'Municipal ref · EFT · Card'),
    (N'food', N'business', N'Local Eats Collective', NULL, 10, 1, N'Order link · Card · Wallet'),
    (N'fuel', N'business', N'Engen Rewards', NULL, 10, 1, N'Engen card · Wallet'),
    (N'parking', N'business', N'CBD Parking Zone A', NULL, 10, 1, N'Bay code · Wallet'),
    (N'vouchers', N'business', N'National Bookstore', NULL, 10, 1, N'Voucher PIN · Card'),
    (N'stay', N'business', N'Coastal Guesthouse', NULL, 10, 1, N'Booking ref · Card · Wallet'),
    (N'services', N'business', N'PayToday Service Desk', NULL, 10, 1, N'Invoice · Card · Wallet');
END;
GO

/* Backfill captions / payment_method when rows existed before those columns were added. */
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL AND COL_LENGTH('dbo.hub_navigation_tiles', 'payment_methods_caption') IS NOT NULL
BEGIN
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · USSD' WHERE hub_kind = N'services' AND slug = N'airtime' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · EFT · Municipality ref' WHERE hub_kind = N'services' AND slug = N'water' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Prepaid meter · Card · Wallet' WHERE hub_kind = N'services' AND slug = N'electricity' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Tap to pay' WHERE hub_kind = N'services' AND slug = N'parking' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Voucher code' WHERE hub_kind = N'services' AND slug = N'vouchers' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Debit order' WHERE hub_kind = N'services' AND slug = N'insurance' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'USSD · *120# (demo)' WHERE hub_kind = N'services' AND slug = N'ussd' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Pickup' WHERE hub_kind = N'services' AND slug = N'store' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · QR' WHERE hub_kind = N'payments' AND slug = N'businesses' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Instant pay' WHERE hub_kind = N'payments' AND slug = N'contacts' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · Airtime PIN' WHERE hub_kind = N'payments' AND slug = N'airtime' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Prepaid token · Card · Wallet' WHERE hub_kind = N'payments' AND slug = N'electricity' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · Reference' WHERE hub_kind = N'payments' AND slug = N'bills' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Order ahead' WHERE hub_kind = N'payments' AND slug = N'food' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Fleet card · Wallet' WHERE hub_kind = N'payments' AND slug = N'fuel' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Plate / bay ref' WHERE hub_kind = N'payments' AND slug = N'parking' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Gift code' WHERE hub_kind = N'payments' AND slug = N'vouchers' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Deposit' WHERE hub_kind = N'payments' AND slug = N'stay' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · Invoice ref' WHERE hub_kind = N'payments' AND slug = N'services' AND (payment_methods_caption IS NULL OR LTRIM(RTRIM(payment_methods_caption)) = N'');
END;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL AND COL_LENGTH('dbo.hub_payment_category_items', 'payment_method') IS NOT NULL
BEGIN
  UPDATE dbo.hub_payment_category_items SET payment_method = N'PayToday Wallet · Visa / Mastercard' WHERE category_slug = N'businesses' AND display_name = N'Okahandja Traders' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Wallet · Card · SnapScan (demo)' WHERE category_slug = N'businesses' AND display_name = N'Windhoek Fresh Market' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'EFT ref · Card · Wallet' WHERE category_slug = N'businesses' AND display_name = N'Namibia Auto Parts' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Wallet only · P2P' WHERE category_slug = N'contacts' AND display_name = N'Anna Nghipondoka' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Wallet · Instant' WHERE category_slug = N'contacts' AND display_name = N'Johan van Wyk' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Wallet · Card' WHERE category_slug = N'contacts' AND display_name = N'Lisa #Shapumba' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Wallet · MTC app · USSD' WHERE category_slug = N'airtime' AND display_name = N'MTC Prepaid' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Card · TN Mobile voucher' WHERE category_slug = N'airtime' AND display_name = N'TN Mobile' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Meter number · Card · Wallet' WHERE category_slug = N'electricity' AND display_name = N'Nampower Prepaid' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Municipal ref · EFT · Card' WHERE category_slug = N'bills' AND display_name = N'Municipality — Windhoek' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Order link · Card · Wallet' WHERE category_slug = N'food' AND display_name = N'Local Eats Collective' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Engen card · Wallet' WHERE category_slug = N'fuel' AND display_name = N'Engen Rewards' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Bay code · Wallet' WHERE category_slug = N'parking' AND display_name = N'CBD Parking Zone A' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Voucher PIN · Card' WHERE category_slug = N'vouchers' AND display_name = N'National Bookstore' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Booking ref · Card · Wallet' WHERE category_slug = N'stay' AND display_name = N'Coastal Guesthouse' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
  UPDATE dbo.hub_payment_category_items SET payment_method = N'Invoice · Card · Wallet' WHERE category_slug = N'services' AND display_name = N'PayToday Service Desk' AND (payment_method IS NULL OR LTRIM(RTRIM(payment_method)) = N'');
END;
GO
