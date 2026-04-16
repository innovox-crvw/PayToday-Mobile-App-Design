/*
  Payment method captions (hub tiles) + per-row hints (payment drill-down).
  Safe if hub tables are missing: skips those parts. Create hub tables first, e.g.:
  - backend/scripts/paytoday-add-hub-navigation-tiles.sql, or
  - backend/scripts/paytoday-full-setup.sql
*/

/* ---- hub_payment_category_items.payment_method ---- */
IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.hub_payment_category_items', 'payment_method') IS NULL
    ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
END;
GO

/* ---- hub_navigation_tiles.payment_methods_caption ---- */
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.hub_navigation_tiles', 'payment_methods_caption') IS NULL
    ALTER TABLE dbo.hub_navigation_tiles ADD payment_methods_caption NVARCHAR(200) NULL;
END;
GO

/* ---- Services hub captions (only if table exists) ---- */
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL
BEGIN
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · USSD'
  WHERE hub_kind = N'services' AND slug = N'airtime';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · EFT · Municipality ref'
  WHERE hub_kind = N'services' AND slug = N'water';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Prepaid meter · Card · Wallet'
  WHERE hub_kind = N'services' AND slug = N'electricity';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Tap to pay'
  WHERE hub_kind = N'services' AND slug = N'parking';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Voucher code'
  WHERE hub_kind = N'services' AND slug = N'vouchers';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Debit order'
  WHERE hub_kind = N'services' AND slug = N'insurance';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'USSD · *120# (demo)'
  WHERE hub_kind = N'services' AND slug = N'ussd';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Pickup'
  WHERE hub_kind = N'services' AND slug = N'store';
END;
GO

/* ---- Payments hub category captions ---- */
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL
BEGIN
  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · QR'
  WHERE hub_kind = N'payments' AND slug = N'businesses';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Instant pay'
  WHERE hub_kind = N'payments' AND slug = N'contacts';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · Airtime PIN'
  WHERE hub_kind = N'payments' AND slug = N'airtime';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Prepaid token · Card · Wallet'
  WHERE hub_kind = N'payments' AND slug = N'electricity';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · Reference'
  WHERE hub_kind = N'payments' AND slug = N'bills';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Order ahead'
  WHERE hub_kind = N'payments' AND slug = N'food';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Fleet card · Wallet'
  WHERE hub_kind = N'payments' AND slug = N'fuel';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Plate / bay ref'
  WHERE hub_kind = N'payments' AND slug = N'parking';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Gift code'
  WHERE hub_kind = N'payments' AND slug = N'vouchers';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Card · Wallet · Deposit'
  WHERE hub_kind = N'payments' AND slug = N'stay';

  UPDATE dbo.hub_navigation_tiles SET payment_methods_caption = N'Wallet · Card · Invoice ref'
  WHERE hub_kind = N'payments' AND slug = N'services';
END;
GO

/* Payment category drill-down rows moved to 006_hub_payment_category_items_drilldown.sql
   (EXEC-based) so this migration does not compile UPDATE payment_method when the column is absent. */
