/*
  Drill-down payment_method text on hub_payment_category_items.
  Split from 003: references to payment_method must not live in the same compile unit as
  conditional DDL when the column may be missing (skipped/partial migrations).

  Batch 1 ensures the column. Batch 2 runs UPDATE/INSERT only via EXEC so missing columns
  do not make the outer batch fail at compile time.
*/

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.hub_payment_category_items', N'payment_method') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.hub_payment_category_items', N'payment_method') IS NOT NULL
BEGIN
  /* Captions aligned with paytoday-full-setup hub drill-down seed (also backfills older display_name variants). */
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · Card · EFT ref''
  WHERE category_slug = N''businesses'' AND display_name = N''Okahandja Traders'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · Tap to pay · QR''
  WHERE category_slug = N''businesses'' AND display_name = N''Windhoek Fresh Market'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · Card · invoice ref''
  WHERE category_slug = N''businesses'' AND display_name = N''Namibia Auto Parts'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet only · P2P''
  WHERE category_slug = N''contacts'' AND display_name = N''Anna Nghipondoka'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · request money''
  WHERE category_slug = N''contacts'' AND display_name = N''Johan van Wyk'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet only · P2P''
  WHERE category_slug = N''contacts'' AND display_name = N''Lisa #Shapumba'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · MTC app · *682#''
  WHERE category_slug = N''airtime'' AND display_name = N''MTC Prepaid'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · TN voucher · USSD''
  WHERE category_slug = N''airtime'' AND display_name = N''TN Mobile'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Meter · wallet · card''
  WHERE category_slug = N''electricity'' AND display_name = N''Nampower Prepaid'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Account · wallet · ref''
  WHERE category_slug = N''bills'' AND display_name IN (N''Municipality — Windhoek'', N''City of Windhoek — rates & refuse'');');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · rider tip''
  WHERE category_slug = N''food'' AND display_name = N''Local Eats Collective'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Rewards · wallet · card''
  WHERE category_slug = N''fuel'' AND display_name IN (N''Engen Rewards'', N''Engen — Independence Ave'');');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Bay code · wallet''
  WHERE category_slug = N''parking'' AND display_name IN (N''CBD Parking Zone A'', N''CBD Zone A — street meters'');');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Voucher SKU · wallet · card''
  WHERE category_slug = N''vouchers'' AND display_name = N''National Bookstore'';');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Booking ref · wallet · card''
  WHERE category_slug = N''stay'' AND display_name IN (N''Coastal Guesthouse'', N''Coastal Guesthouse — Swakop'');');
  EXEC (N'UPDATE dbo.hub_payment_category_items SET payment_method = N''Wallet · case ref''
  WHERE category_slug = N''services'' AND display_name = N''PayToday Service Desk'';');
  EXEC (N'IF NOT EXISTS (SELECT 1 FROM dbo.hub_payment_category_items WHERE category_slug = N''airtime'' AND display_name = N''Leap Mobile (demo)'')
  INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, sort_order, is_active, payment_method)
  VALUES (N''airtime'', N''business'', N''Leap Mobile (demo)'', NULL, 25, 1, N''Wallet · USSD *123#'');');
  EXEC (N'IF NOT EXISTS (SELECT 1 FROM dbo.hub_payment_category_items WHERE category_slug = N''electricity'' AND display_name = N''RED prepaid (demo)'')
  INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, sort_order, is_active, payment_method)
  VALUES (N''electricity'', N''business'', N''RED prepaid (demo)'', NULL, 20, 1, N''Meter · Card · Apple Pay (demo)'');');
  EXEC (N'IF NOT EXISTS (SELECT 1 FROM dbo.hub_payment_category_items WHERE category_slug = N''bills'' AND display_name = N''TV licence — NBC'')
  INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, sort_order, is_active, payment_method)
  VALUES (N''bills'', N''business'', N''TV licence — NBC'', NULL, 20, 1, N''Customer ref · Card · Wallet'');');
  EXEC (N'IF NOT EXISTS (SELECT 1 FROM dbo.hub_payment_category_items WHERE category_slug = N''fuel'' AND display_name = N''Shell Go+'')
  INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, sort_order, is_active, payment_method)
  VALUES (N''fuel'', N''business'', N''Shell Go+'', NULL, 20, 1, N''Fleet card · Wallet'');');
END;
GO
