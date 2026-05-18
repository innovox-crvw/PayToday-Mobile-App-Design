/*
  AvoToday — Full catalogue seed script
  ======================================
  Standalone script. Run manually in SSMS or via sqlcmd after the full migration set has
  been applied. Fully idempotent — safe to run multiple times; every insert is guarded by
  NOT EXISTS on slug / SKU / fixed UUID.

  What this script does
  ─────────────────────
  1.  Ensures all existing categories have correct icon_key and finance_eligible values.
  2.  Assigns existing un-scoped demo products to merchant 5229 (Innovox).
  3.  Fills missing package dimensions on existing variants (migration 064 defaults apply;
      this guarantees no NULLs).
  4.  Adds new top-level categories: Personal care, Baby, Sports & fitness.
  5.  Adds new sub-categories under Groceries: Dairy & eggs, Bread & bakery, Meat & fish,
      Hot drinks.
  6.  Adds ~26 new products with variants, images, and stock.

  Prerequisites
  ─────────────
  • Merchant row 5229 must exist (migration 023 or avotoday-db-bootstrap.ps1).
  • MAIN warehouse must exist (paytoday-full-setup.sql or bootstrap).
  • Migrations through 067 must be applied (icon_key, finance_eligible, package dims, etc.).

  UUID block reservations
  ───────────────────────
  Categories  7E100001-0000-4000-8000-0000000000xx  (07–12)
  Products    7F200002-0000-4000-8000-0000000000xx  (01–26)
  Variants    7F300002-0000-4000-8000-0000000000xx  (01–30)
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* ─────────────────────────────────────────────────────────────────────────────
   0.  Declare all fixed UUIDs up front
   ───────────────────────────────────────────────────────────────────────────── */
-- New categories
DECLARE @catPersonalCare  UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-000000000007';
DECLARE @catBaby          UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-000000000008';
DECLARE @catSports        UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-000000000009';
DECLARE @catSkincare      UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-00000000000A';
DECLARE @catHairCare      UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-00000000000B';
DECLARE @catOralCare      UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-00000000000C';
DECLARE @catNappiesCare   UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-00000000000D';
DECLARE @catBabyFeeding   UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-00000000000E';
DECLARE @catDairyEggs     UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-00000000000F';
DECLARE @catBreadBakery   UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-000000000010';
DECLARE @catMeatFish      UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-000000000011';
DECLARE @catHotDrinks     UNIQUEIDENTIFIER = '7E100001-0000-4000-8000-000000000012';

-- New products
DECLARE @p01 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000001';
DECLARE @p02 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000002';
DECLARE @p03 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000003';
DECLARE @p04 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000004';
DECLARE @p05 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000005';
DECLARE @p06 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000006';
DECLARE @p07 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000007';
DECLARE @p08 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000008';
DECLARE @p09 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000009';
DECLARE @p10 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000010';
DECLARE @p11 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000011';
DECLARE @p12 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000012';
DECLARE @p13 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000013';
DECLARE @p14 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000014';
DECLARE @p15 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000015';
DECLARE @p16 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000016';
DECLARE @p17 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000017';
DECLARE @p18 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000018';
DECLARE @p19 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000019';
DECLARE @p20 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000020';
DECLARE @p21 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000021';
DECLARE @p22 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000022';
DECLARE @p23 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000023';
DECLARE @p24 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000024';
DECLARE @p25 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000025';
DECLARE @p26 UNIQUEIDENTIFIER = '7F200002-0000-4000-8000-000000000026';

-- New variants
DECLARE @v01  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000001';
DECLARE @v02  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000002';
DECLARE @v03  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000003';
DECLARE @v04  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000004';
DECLARE @v05a UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000005';
DECLARE @v05b UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000006';
DECLARE @v06  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000007';
DECLARE @v07  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000008';
DECLARE @v08  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000009';
DECLARE @v09  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000010';
DECLARE @v10  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000011';
DECLARE @v11  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000012';
DECLARE @v12  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000013';
DECLARE @v13  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000014';
DECLARE @v14  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000015';
DECLARE @v15a UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000016';
DECLARE @v15b UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000017';
DECLARE @v15c UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000018';
DECLARE @v16a UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000019';
DECLARE @v16b UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000020';
DECLARE @v17  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000021';
DECLARE @v18  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000022';
DECLARE @v19  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000023';
DECLARE @v20  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000024';
DECLARE @v21  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000025';
DECLARE @v22  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000026';
DECLARE @v23  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000027';
DECLARE @v24  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000028';
DECLARE @v25  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000029';
DECLARE @v26  UNIQUEIDENTIFIER = '7F300002-0000-4000-8000-000000000030';

DECLARE @merchant INT = 5229;
DECLARE @wh UNIQUEIDENTIFIER;
SELECT @wh = CAST(id AS UNIQUEIDENTIFIER) FROM dbo.warehouses WHERE code = N'MAIN';
IF @wh IS NULL RAISERROR('MAIN warehouse not found — run paytoday-full-setup.sql first.', 16, 1);

/* ─────────────────────────────────────────────────────────────────────────────
   1.  Fix icon_key and finance_eligible on existing categories
   ───────────────────────────────────────────────────────────────────────────── */
IF COL_LENGTH('dbo.categories', 'icon_key') IS NOT NULL
BEGIN
  -- Extend the icon mapping from migration 018 to cover sub-categories added later
  UPDATE dbo.categories SET icon_key = N'beverages' WHERE slug = N'soft-drinks'   AND (icon_key IS NULL OR icon_key <> N'beverages');
  UPDATE dbo.categories SET icon_key = N'snacks'    WHERE slug = N'snacks-pantry' AND (icon_key IS NULL OR icon_key <> N'snacks');
  UPDATE dbo.categories SET icon_key = N'produce'   WHERE slug = N'fresh-produce' AND (icon_key IS NULL OR icon_key <> N'produce');
  UPDATE dbo.categories SET icon_key = N'cleaning'  WHERE slug = N'cleaning'      AND (icon_key IS NULL OR icon_key <> N'cleaning');
  UPDATE dbo.categories SET icon_key = N'accessories' WHERE slug = N'accessories' AND (icon_key IS NULL OR icon_key <> N'accessories');
  UPDATE dbo.categories SET icon_key = N'audio'     WHERE slug = N'audio'         AND (icon_key IS NULL OR icon_key <> N'audio');
END;

IF COL_LENGTH('dbo.categories', 'finance_eligible') IS NOT NULL
BEGIN
  -- Electronics and Home are finance-eligible (NedAccess / instalment plans)
  UPDATE dbo.categories SET finance_eligible = 1
  WHERE slug IN (N'electronics', N'home')
    AND finance_eligible = 0;
END;
GO

/* ─────────────────────────────────────────────────────────────────────────────
   2.  Scope existing un-scoped demo products to merchant 5229
       (Only applies when pay_today_merchant_id column exists — post migration 022)
   ───────────────────────────────────────────────────────────────────────────── */
IF COL_LENGTH('dbo.products', 'pay_today_merchant_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = 5229)
BEGIN
  UPDATE dbo.products
  SET pay_today_merchant_id = 5229
  WHERE pay_today_merchant_id IS NULL;
END;
GO

/* ─────────────────────────────────────────────────────────────────────────────
   3.  Fill missing package dimensions on existing variants
       (migration 064 set defaults of 200/150/100 mm; this catches any gaps)
   ───────────────────────────────────────────────────────────────────────────── */
IF COL_LENGTH('dbo.product_variants', 'package_length_mm') IS NOT NULL
BEGIN
  UPDATE dbo.product_variants
  SET
    package_length_mm = COALESCE(package_length_mm, 200),
    package_width_mm  = COALESCE(package_width_mm,  150),
    package_height_mm = COALESCE(package_height_mm, 100),
    gross_weight_g    = COALESCE(gross_weight_g,     500)
  WHERE package_length_mm IS NULL
     OR package_width_mm  IS NULL
     OR package_height_mm IS NULL;
END;
GO

/* ─────────────────────────────────────────────────────────────────────────────
   4.  New top-level categories
   ───────────────────────────────────────────────────────────────────────────── */
IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'personal-care')
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
  VALUES ('7E100001-0000-4000-8000-000000000007', N'personal-care', N'Personal care', NULL, 40, 1, N'beauty');

IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'baby')
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
  VALUES ('7E100001-0000-4000-8000-000000000008', N'baby', N'Baby & toddler', NULL, 50, 1, N'basket');

IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'sports-fitness')
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
  VALUES ('7E100001-0000-4000-8000-000000000009', N'sports-fitness', N'Sports & fitness', NULL, 60, 1, N'sports');
GO

/* ─────────────────────────────────────────────────────────────────────────────
   5.  New sub-categories
   ───────────────────────────────────────────────────────────────────────────── */
-- Under Personal care
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'personal-care')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'skincare')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-00000000000A', N'skincare', N'Skin care',
            (SELECT id FROM dbo.categories WHERE slug = N'personal-care'), 10, 1, N'beauty');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'hair-care')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-00000000000B', N'hair-care', N'Hair care',
            (SELECT id FROM dbo.categories WHERE slug = N'personal-care'), 20, 1, N'beauty');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'oral-care')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-00000000000C', N'oral-care', N'Oral care',
            (SELECT id FROM dbo.categories WHERE slug = N'personal-care'), 30, 1, NULL);
END;

-- Under Baby
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'baby')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'nappies-care')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-00000000000D', N'nappies-care', N'Nappies & care',
            (SELECT id FROM dbo.categories WHERE slug = N'baby'), 10, 1, NULL);

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'baby-feeding')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-00000000000E', N'baby-feeding', N'Feeding & formula',
            (SELECT id FROM dbo.categories WHERE slug = N'baby'), 20, 1, NULL);
END;

-- Under Groceries
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'dairy-eggs')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-00000000000F', N'dairy-eggs', N'Dairy & eggs',
            (SELECT id FROM dbo.categories WHERE slug = N'groceries'), 40, 1, NULL);

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'bread-bakery')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-000000000010', N'bread-bakery', N'Bread & bakery',
            (SELECT id FROM dbo.categories WHERE slug = N'groceries'), 50, 1, N'snacks');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'meat-fish')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-000000000011', N'meat-fish', N'Meat & fish',
            (SELECT id FROM dbo.categories WHERE slug = N'groceries'), 60, 1, NULL);

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'hot-drinks')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active, icon_key)
    VALUES ('7E100001-0000-4000-8000-000000000012', N'hot-drinks', N'Coffee & tea',
            (SELECT id FROM dbo.categories WHERE slug = N'groceries'), 70, 1, N'beverages');
END;
GO

/* ─────────────────────────────────────────────────────────────────────────────
   6.  New products
   ─────────────────────────────────────────────────────────────────────────────
   Each product block:
     a) product row
     b) variant row(s) — includes package dimensions
     c) product image
     d) inventory_quantity

   Prices in NAD cents (e.g. 3499 = N$34.99).
   package dims: length × width × height in mm; gross_weight_g in grams.
   ───────────────────────────────────────────────────────────────────────────── */

/* ── 6.1  DAIRY & EGGS ──────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'dairy-eggs')
BEGIN
  -- Free-range eggs 6-pack
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'free-range-eggs-6')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000001',
            (SELECT id FROM dbo.categories WHERE slug = N'dairy-eggs'),
            N'free-range-eggs-6', N'Free-range eggs 6-pack',
            N'Locally farmed free-range eggs — perfect for breakfast or baking.',
            1, N'farm-fresh', N'Farm Fresh', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000001', '7F200002-0000-4000-8000-000000000001',
            N'EGG-FR-6', N'6-pack', 3499, N'NAD', 12, N'track', 200, 120, 80, 400);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000001', N'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000001', @wh, 80);
  END;

  -- Cheddar cheese sliced 400 g
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'cheddar-cheese-sliced-400g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000002',
            (SELECT id FROM dbo.categories WHERE slug = N'dairy-eggs'),
            N'cheddar-cheese-sliced-400g', N'Cheddar cheese sliced 400 g',
            N'Mild cheddar — ready-sliced for sandwiches and toasties.',
            1, N'dairy-gold', N'Dairy Gold', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000002', '7F200002-0000-4000-8000-000000000002',
            N'CHEESE-CHD-400', N'400 g', 7999, N'NAD', 8, 9299, N'track', 200, 130, 30, 430);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000002', N'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000002', @wh, 55);
  END;
END;

/* ── 6.2  BREAD & BAKERY ────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'bread-bakery')
BEGIN
  -- White bread 700 g
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'white-bread-700g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000003',
            (SELECT id FROM dbo.categories WHERE slug = N'bread-bakery'),
            N'white-bread-700g', N'White bread 700 g',
            N'Classic sliced white loaf — soft and fresh.',
            1, N'sasko', N'Sasko', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000003', '7F200002-0000-4000-8000-000000000003',
            N'BREAD-WHT-700', N'700 g', 2499, N'NAD', 15, N'track', 300, 130, 120, 720);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000003', N'https://images.unsplash.com/photo-1549931319-a545dcf3bc7d?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000003', @wh, 60);
  END;

  -- Wholewheat bread 700 g
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'wholewheat-bread-700g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000004',
            (SELECT id FROM dbo.categories WHERE slug = N'bread-bakery'),
            N'wholewheat-bread-700g', N'Wholewheat bread 700 g',
            N'High-fibre wholewheat loaf — great for a healthy start.',
            1, N'sasko', N'Sasko', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000004', '7F200002-0000-4000-8000-000000000004',
            N'BREAD-WW-700', N'700 g', 2999, N'NAD', 12, N'track', 300, 130, 120, 720);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000004', N'https://images.unsplash.com/photo-1590137876181-2a5a7e340308?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000004', @wh, 45);
  END;
END;

/* ── 6.3  MEAT & FISH ───────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'meat-fish')
BEGIN
  -- Canned tuna in brine (single & 3-pack variants)
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'canned-tuna-170g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000005',
            (SELECT id FROM dbo.categories WHERE slug = N'meat-fish'),
            N'canned-tuna-170g', N'Canned tuna in brine 170 g',
            N'Skipjack tuna — high protein, great for salads and sandwiches.',
            1, N'lucky-star', N'Lucky Star', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES
      ('7F300002-0000-4000-8000-000000000005', '7F200002-0000-4000-8000-000000000005',
       N'TUNA-BRINE-170', N'Single 170 g', 2799, N'NAD', 20, N'track', 90, 90, 50, 200),
      ('7F300002-0000-4000-8000-000000000006', '7F200002-0000-4000-8000-000000000005',
       N'TUNA-BRINE-3PK', N'3-pack (3 × 170 g)', 7499, N'NAD', 8, N'track', 200, 90, 50, 600);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000005', N'https://images.unsplash.com/photo-1534482421-64566f976cfa?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000005', @wh, 150);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000006', @wh, 60);
  END;
END;

/* ── 6.4  HOT DRINKS ────────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'hot-drinks')
BEGIN
  -- Filter coffee 250 g
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'filter-coffee-250g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000006',
            (SELECT id FROM dbo.categories WHERE slug = N'hot-drinks'),
            N'filter-coffee-250g', N'Filter coffee medium roast 250 g',
            N'Smooth medium-roast ground coffee — ideal for drip or French press.',
            1, N'joko', N'Joko', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000007', '7F200002-0000-4000-8000-000000000006',
            N'COFFEE-MED-250', N'250 g', 16900, N'NAD', 6, 19900, N'track', 120, 80, 160, 280);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000006', N'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000007', @wh, 70);
  END;

  -- Rooibos tea 80-bag box
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'rooibos-tea-80-bags')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000007',
            (SELECT id FROM dbo.categories WHERE slug = N'hot-drinks'),
            N'rooibos-tea-80-bags', N'Rooibos tea 80 bags',
            N'Naturally caffeine-free South African rooibos — rich and aromatic.',
            1, N'laager', N'Laager', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000008', '7F200002-0000-4000-8000-000000000007',
            N'TEA-ROOI-80', N'80 bags', 8999, N'NAD', 8, N'track', 150, 100, 90, 200);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000007', N'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000008', @wh, 90);
  END;
END;

/* ── 6.5  GENERAL GROCERIES ─────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  -- Pasta spaghetti 500 g
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'pasta-spaghetti-500g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000008',
            (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
            N'pasta-spaghetti-500g', N'Spaghetti pasta 500 g',
            N'Durum wheat spaghetti — cooks in 8 minutes.',
            1, N'fatti-monis', N'Fatti''s & Moni''s', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000009', '7F200002-0000-4000-8000-000000000008',
            N'PASTA-SPG-500', N'500 g', 3299, N'NAD', 10, N'track', 300, 80, 40, 530);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000008', N'https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000009', @wh, 120);
  END;

  -- Sunflower cooking oil 2 L
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'sunflower-oil-2l')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000009',
            (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
            N'sunflower-oil-2l', N'Sunflower cooking oil 2 L',
            N'100% pure sunflower oil — light and healthy for everyday cooking.',
            1, N'sunfoil', N'Sunfoil', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000010', '7F200002-0000-4000-8000-000000000009',
            N'OIL-SFW-2L', N'2 L bottle', 7499, N'NAD', 8, 8999, N'track', 90, 90, 290, 1900);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000009', N'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000010', @wh, 85);
  END;
END;

/* ── 6.6  SKINCARE ──────────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'skincare')
BEGIN
  -- SPF 50 sunscreen 150 ml
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'sunscreen-spf50-150ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000010',
            (SELECT id FROM dbo.categories WHERE slug = N'skincare'),
            N'sunscreen-spf50-150ml', N'Sunscreen SPF 50 150 ml',
            N'Broad-spectrum UVA/UVB protection — water-resistant formula.',
            1, N'piz-buin', N'Piz Buin', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000011', '7F200002-0000-4000-8000-000000000010',
            N'SKIN-SPF50-150', N'150 ml', 8999, N'NAD', 6, 10999, N'track', 60, 60, 160, 200);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000010', N'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000011', @wh, 50);
  END;

  -- Moisturising face cream 50 ml
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'face-moisturiser-50ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000011',
            (SELECT id FROM dbo.categories WHERE slug = N'skincare'),
            N'face-moisturiser-50ml', N'Hydrating face moisturiser 50 ml',
            N'Lightweight daily moisturiser — suitable for all skin types.',
            1, N'nivea', N'Nivea', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000012', '7F200002-0000-4000-8000-000000000011',
            N'SKIN-MOIST-50', N'50 ml', 14900, N'NAD', 5, N'track', 70, 70, 80, 120);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000011', N'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000012', @wh, 40);
  END;
END;

/* ── 6.7  HAIR CARE ─────────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'hair-care')
BEGIN
  -- Shampoo 300 ml
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'shampoo-300ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000012',
            (SELECT id FROM dbo.categories WHERE slug = N'hair-care'),
            N'shampoo-300ml', N'Moisturising shampoo 300 ml',
            N'Sulphate-free formula — gentle on colour-treated hair.',
            1, N'tresemme', N'TRESemmé', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000013', '7F200002-0000-4000-8000-000000000012',
            N'HAIR-SHAMP-300', N'300 ml', 5999, N'NAD', 8, N'track', 65, 65, 200, 380);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000012', N'https://images.unsplash.com/photo-1519735777090-ec97162dc266?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000013', @wh, 65);
  END;

  -- Conditioner 300 ml
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'conditioner-300ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000013',
            (SELECT id FROM dbo.categories WHERE slug = N'hair-care'),
            N'conditioner-300ml', N'Repair & protect conditioner 300 ml',
            N'Deep conditioning formula — reduces breakage and adds shine.',
            1, N'tresemme', N'TRESemmé', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000014', '7F200002-0000-4000-8000-000000000013',
            N'HAIR-COND-300', N'300 ml', 5499, N'NAD', 8, N'track', 65, 65, 200, 380);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000013', N'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000014', @wh, 55);
  END;
END;

/* ── 6.8  ORAL CARE ─────────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'oral-care')
BEGIN
  -- Toothpaste 2-pack 100 ml
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'toothpaste-whitening-2pack')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000014',
            (SELECT id FROM dbo.categories WHERE slug = N'oral-care'),
            N'toothpaste-whitening-2pack', N'Whitening toothpaste 2 × 100 ml',
            N'Fluoride whitening formula — removes stains in 4 weeks.',
            1, N'colgate', N'Colgate', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000015', '7F200002-0000-4000-8000-000000000014',
            N'ORAL-TP-WHT-2PK', N'2 × 100 ml', 4999, N'NAD', 10, 6299, N'track', 200, 60, 40, 240);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000014', N'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000015', @wh, 100);
  END;
END;

/* ── 6.9  PERSONAL CARE — DEODORANT (multi-variant) ────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'personal-care')
BEGIN
  -- Roll-on deodorant 50 ml — 3 scents
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'roll-on-deodorant-50ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000015',
            (SELECT id FROM dbo.categories WHERE slug = N'personal-care'),
            N'roll-on-deodorant-50ml', N'48 h roll-on deodorant 50 ml',
            N'Long-lasting 48-hour protection — alcohol-free, dermatologically tested.',
            1, N'rexona', N'Rexona', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES
      ('7F300002-0000-4000-8000-000000000016', '7F200002-0000-4000-8000-000000000015',
       N'DEO-ROLL-UNS', N'Unscented', 3499, N'NAD', 12, N'track', 50, 50, 120, 130),
      ('7F300002-0000-4000-8000-000000000017', '7F200002-0000-4000-8000-000000000015',
       N'DEO-ROLL-FRH', N'Fresh cotton', 3499, N'NAD', 12, N'track', 50, 50, 120, 130),
      ('7F300002-0000-4000-8000-000000000018', '7F200002-0000-4000-8000-000000000015',
       N'DEO-ROLL-SPT', N'Sport active', 3499, N'NAD', 12, N'track', 50, 50, 120, 130);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000015', N'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES ('7F300002-0000-4000-8000-000000000016', @wh, 80);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES ('7F300002-0000-4000-8000-000000000017', @wh, 75);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES ('7F300002-0000-4000-8000-000000000018', @wh, 70);
  END;
END;

/* ── 6.10  NAPPIES & CARE ───────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'nappies-care')
BEGIN
  -- Disposable nappies (size 3 & size 4 variants)
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'disposable-nappies')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000016',
            (SELECT id FROM dbo.categories WHERE slug = N'nappies-care'),
            N'disposable-nappies', N'Disposable nappies',
            N'Soft, leak-free nappies with 12-hour dryness protection.',
            1, N'huggies', N'Huggies', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES
      ('7F300002-0000-4000-8000-000000000019', '7F200002-0000-4000-8000-000000000016',
       N'NAPPY-SZ3-52', N'Size 3 — 52 pack (4–9 kg)', 12999, N'NAD', 4, 15499, N'track', 430, 330, 240, 2300),
      ('7F300002-0000-4000-8000-000000000020', '7F200002-0000-4000-8000-000000000016',
       N'NAPPY-SZ4-44', N'Size 4 — 44 pack (7–18 kg)', 12999, N'NAD', 4, 15499, N'track', 430, 330, 240, 2200);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000016', N'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES ('7F300002-0000-4000-8000-000000000019', @wh, 30);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES ('7F300002-0000-4000-8000-000000000020', @wh, 25);
  END;

  -- Baby wipes 72-pack
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'baby-wipes-72-pack')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000017',
            (SELECT id FROM dbo.categories WHERE slug = N'nappies-care'),
            N'baby-wipes-72-pack', N'Baby wipes 72-pack',
            N'Fragrance-free sensitive wipes — gentle on newborn skin.',
            1, N'pampers', N'Pampers', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000021', '7F200002-0000-4000-8000-000000000017',
            N'BWIPE-72', N'72-pack', 4999, N'NAD', 10, 5999, N'track', 200, 150, 60, 500);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000017', N'https://images.unsplash.com/photo-1590779033100-9f60a05a013d?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000021', @wh, 60);
  END;
END;

/* ── 6.11  BABY FEEDING ─────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'baby-feeding')
BEGIN
  -- Baby formula stage 1 400 g
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'baby-formula-stage1-400g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000018',
            (SELECT id FROM dbo.categories WHERE slug = N'baby-feeding'),
            N'baby-formula-stage1-400g', N'Infant formula Stage 1 400 g',
            N'Iron-fortified starter formula — birth to 6 months.',
            1, N'nan', N'NAN', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000022', '7F200002-0000-4000-8000-000000000018',
            N'FORM-S1-400', N'400 g tin', 18999, N'NAD', 6, N'track', 140, 140, 170, 600);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000018', N'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000022', @wh, 25);
  END;

  -- Baby fruit puree pouches 6-pack
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'baby-puree-pouches-6pk')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000019',
            (SELECT id FROM dbo.categories WHERE slug = N'baby-feeding'),
            N'baby-puree-pouches-6pk', N'Baby fruit puree pouches 6-pack',
            N'Organic apple & pear puree — no added sugar, from 4 months.',
            1, N'purity', N'Purity', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000023', '7F200002-0000-4000-8000-000000000019',
            N'BABYPUR-6PK', N'6-pack (6 × 90 g)', 6999, N'NAD', 8, N'track', 200, 130, 80, 650);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000019', N'https://images.unsplash.com/photo-1525373698358-041e3a460346?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000023', @wh, 45);
  END;
END;

/* ── 6.12  SPORTS & FITNESS ─────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'sports-fitness')
BEGIN
  -- Yoga mat 6 mm
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'yoga-mat-6mm')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000020',
            (SELECT id FROM dbo.categories WHERE slug = N'sports-fitness'),
            N'yoga-mat-6mm', N'Non-slip yoga mat 6 mm',
            N'Extra-thick 6 mm foam mat with alignment lines — 183 × 61 cm.',
            1, N'letsfit', N'LetsFit', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000024', '7F200002-0000-4000-8000-000000000020',
            N'SPORT-YOGA-6', N'6 mm — Charcoal grey', 39900, N'NAD', 4, 49900, N'track', 610, 150, 150, 1200);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000020', N'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000024', @wh, 20);
  END;

  -- Resistance bands set (5 levels)
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'resistance-bands-set')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000021',
            (SELECT id FROM dbo.categories WHERE slug = N'sports-fitness'),
            N'resistance-bands-set', N'Resistance bands set (5 levels)',
            N'5 loop bands from light to extra-heavy — includes carry bag.',
            1, N'letsfit', N'LetsFit', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000025', '7F200002-0000-4000-8000-000000000021',
            N'SPORT-RBAND-5', N'5-piece set', 34900, N'NAD', 5, N'track', 200, 120, 40, 400);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000021', N'https://images.unsplash.com/photo-1598971639058-a634c1a04aba?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000025', @wh, 30);
  END;

  -- Sport water bottle 750 ml (stainless steel)
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'water-bottle-sport-750ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000022',
            (SELECT id FROM dbo.categories WHERE slug = N'sports-fitness'),
            N'water-bottle-sport-750ml', N'Insulated water bottle 750 ml',
            N'Double-wall stainless steel — keeps cold 24 h, hot 12 h.',
            1, N'hydra-flask', N'HydraFlask', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000026', '7F200002-0000-4000-8000-000000000022',
            N'SPORT-BOTL-750', N'750 ml — Midnight black', 24900, N'NAD', 6, 29900, N'track', 80, 80, 270, 380);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000022', N'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000026', @wh, 35);
  END;

  -- Skipping rope steel cable
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'skipping-rope-steel')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000023',
            (SELECT id FROM dbo.categories WHERE slug = N'sports-fitness'),
            N'skipping-rope-steel', N'Speed skipping rope — steel cable',
            N'Adjustable steel cable with ball-bearing handles — ideal for HIIT.',
            1, N'letsfit', N'LetsFit', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000027', '7F200002-0000-4000-8000-000000000023',
            N'SPORT-ROPE-STL', N'Adjustable steel', 15900, N'NAD', 8, N'track', 300, 100, 40, 250);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000023', N'https://images.unsplash.com/photo-1562771379-eafdca7a02f8?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000027', @wh, 40);
  END;
END;

/* ── 6.13  ELECTRONICS — ACCESSORIES ───────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'accessories')
BEGIN
  -- Power bank 10 000 mAh
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'power-bank-10000mah')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id, contains_alcohol)
    VALUES ('7F200002-0000-4000-8000-000000000024',
            (SELECT id FROM dbo.categories WHERE slug = N'accessories'),
            N'power-bank-10000mah', N'Power bank 10 000 mAh — dual USB',
            N'Fast-charge 10 000 mAh — charges most phones 2–3 times. Dual USB-A output.',
            1, N'anker', N'Anker', 5229, 0);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000028', '7F200002-0000-4000-8000-000000000024',
            N'ELEC-PB-10K', N'10 000 mAh black', 39900, N'NAD', 5, 49900, N'track', 150, 75, 30, 250);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000024', N'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000028', @wh, 45);
  END;

  -- Wireless mouse
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'wireless-mouse-compact')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id, contains_alcohol)
    VALUES ('7F200002-0000-4000-8000-000000000025',
            (SELECT id FROM dbo.categories WHERE slug = N'accessories'),
            N'wireless-mouse-compact', N'Compact wireless mouse 2.4 GHz',
            N'Silent click — 1600 DPI, 12-month battery life. USB nano receiver.',
            1, N'logitech', N'Logitech', 5229, 0);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000029', '7F200002-0000-4000-8000-000000000025',
            N'ELEC-MOUSE-WLS', N'Black', 29900, N'NAD', 5, N'track', 130, 80, 50, 200);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000025', N'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000029', @wh, 30);
  END;
END;

/* ── 6.14  HOME — appliance (finance eligible) ──────────────────────────────── */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'home')
BEGIN
  -- 16-inch stand fan
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'stand-fan-16-inch')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name, pay_today_merchant_id)
    VALUES ('7F200002-0000-4000-8000-000000000026',
            (SELECT id FROM dbo.categories WHERE slug = N'home'),
            N'stand-fan-16-inch', N'16-inch pedestal stand fan',
            N'3-speed adjustable pedestal fan — quiet motor, 180° oscillation. Great for Windhoek summers.',
            1, N'campomatic', N'Campomatic', 5229);
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy, package_length_mm, package_width_mm, package_height_mm, gross_weight_g)
    VALUES ('7F300002-0000-4000-8000-000000000030', '7F200002-0000-4000-8000-000000000026',
            N'HOME-FAN-16-WHT', N'White', 59900, N'NAD', 3, 74900, N'track', 520, 430, 250, 4200);
    INSERT INTO dbo.product_images (product_id, url, sort_order)
    VALUES ('7F200002-0000-4000-8000-000000000026', N'https://images.unsplash.com/photo-1561339429-c9ae83a39d09?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    VALUES ('7F300002-0000-4000-8000-000000000030', @wh, 15);
  END;
END;
GO

/* ─────────────────────────────────────────────────────────────────────────────
   7.  Summary
   ───────────────────────────────────────────────────────────────────────────── */
SELECT
  c.slug AS category_slug,
  COUNT(p.id) AS products,
  SUM(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END) AS active_products
FROM dbo.categories c
LEFT JOIN dbo.products p ON p.category_id = c.id AND p.is_active = 1
GROUP BY c.slug
ORDER BY c.slug;

SELECT
  COUNT(*) AS total_products,
  COUNT(DISTINCT pv.product_id) AS products_with_variants,
  SUM(iq.quantity) AS total_stock_units
FROM dbo.product_variants pv
JOIN dbo.inventory_quantity iq ON iq.variant_id = pv.id;
GO
