/*
  Richer demo catalogue + extra deposit pickup points.
  Idempotent: skips rows that already exist (slug / SKU / box code / location name).
  Expects base seed (groceries, electronics, home, MAIN warehouse) from paytoday-full-setup or equivalent.
*/

SET NOCOUNT ON;

/* ---- Sub-categories under top-level (requires migration 012 parent_id) ---- */
IF COL_LENGTH('dbo.categories', 'parent_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'soft-drinks')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000001',
      N'soft-drinks',
      N'Soft drinks',
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      20,
      1
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'snacks-pantry')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000002',
      N'snacks-pantry',
      N'Snacks & pantry',
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      30,
      1
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'fresh-produce')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000003',
      N'fresh-produce',
      N'Fresh produce',
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      10,
      1
    );
END;
GO

IF COL_LENGTH('dbo.categories', 'parent_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'electronics')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'accessories')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000004',
      N'accessories',
      N'Phone & laptop accessories',
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      10,
      1
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'audio')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000005',
      N'audio',
      N'Audio',
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      20,
      1
    );
END;
GO

IF COL_LENGTH('dbo.categories', 'parent_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'home')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'cleaning')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000006',
      N'cleaning',
      N'Cleaning & laundry',
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      10,
      1
    );
END;
GO

/* ---- Products + variants + images + stock (single batch: DECLARE once) ---- */
DECLARE @p1 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000001';
DECLARE @v1 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000001';
DECLARE @p2 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000002';
DECLARE @v2 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000002';
DECLARE @p3 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000003';
DECLARE @v3 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000003';
DECLARE @p4 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000004';
DECLARE @v4 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000004';
DECLARE @p5 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000005';
DECLARE @v5 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000005';
DECLARE @p6 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000006';
DECLARE @v6 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000006';
DECLARE @p7 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000007';
DECLARE @v7a UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000007';
DECLARE @v7b UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000008';
DECLARE @p8 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000008';
DECLARE @v8 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000009';
DECLARE @p9 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000009';
DECLARE @v9 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000010';
DECLARE @p10 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000010';
DECLARE @v10 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000011';
DECLARE @p11 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000011';
DECLARE @v11 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000012';
DECLARE @p12 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000012';
DECLARE @v12 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000013';

IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'sparkling-water-500ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p1,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'sparkling-water-500ml',
      N'Sparkling mineral water 500 ml',
      N'Chilled sparkling water — great with meals.',
      1,
      N'aqua-vita',
      N'Aqua Vita'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v1, @p1, N'WATER-SPK-500', N'500 ml', 1899, N'NAD', 8, 2299, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p1, N'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v1, CAST(id AS UNIQUEIDENTIFIER), 200 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'cola-2l-bottle')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p2,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'cola-2l-bottle',
      N'Cola soft drink 2 L',
      N'Classic cola — share size.',
      1,
      N'fizz-co',
      N'Fizz Co'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v2, @p2, N'SOFT-COLA-2L', N'2 Litre', 4599, N'NAD', 6, 5299, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p2, N'https://images.unsplash.com/photo-1622483767028-3f66f32c67b6?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v2, CAST(id AS UNIQUEIDENTIFIER), 140 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'long-life-milk-1l')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p3,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'long-life-milk-1l',
      N'Long life milk 1 L',
      N'UHT dairy — pantry staple.',
      1,
      N'spar',
      N'Spar'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v3, @p3, N'MILK-UHT-1L', N'1 Litre', 2699, N'NAD', 10, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p3, N'https://images.unsplash.com/photo-1563636619-e9143d4c3b2c?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v3, CAST(id AS UNIQUEIDENTIFIER), 160 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'white-rice-2kg')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p4,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'white-rice-2kg',
      N'White rice 2 kg',
      N'Parboiled rice — family pack.',
      1,
      N'grain-house',
      N'Grain House'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v4, @p4, N'RICE-WHT-2KG', N'2 kg', 8999, N'NAD', 5, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p4, N'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v4, CAST(id AS UNIQUEIDENTIFIER), 90 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'potato-chips-150g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p5,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'potato-chips-150g',
      N'Potato chips salted 150 g',
      N'Crunchy snack — party size.',
      1,
      N'crisp-co',
      N'Crisp Co'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v5, @p5, N'SNACK-CHIPS-150', N'150 g', 2499, N'NAD', 12, 2999, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p5, N'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v5, CAST(id AS UNIQUEIDENTIFIER), 110 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'apples-1-5kg-bag')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p6,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'apples-1-5kg-bag',
      N'Apples 1.5 kg bag',
      N'Crisp red apples — sourced locally when available.',
      1,
      N'fresh-pick',
      N'Fresh Pick'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v6, @p6, N'FRUIT-APL-15', N'1.5 kg', 4299, N'NAD', 6, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p6, N'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v6, CAST(id AS UNIQUEIDENTIFIER), 45 FROM dbo.warehouses WHERE code = N'MAIN';
  END;
END;

IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'electronics')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'usb-c-cable-2m')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p7,
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      N'usb-c-cable-2m',
      N'USB-C fast charge cable',
      N'Braided cable for phones and laptops — 60 W rated.',
      1,
      N'link-tech',
      N'Link Tech'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES
      (@v7a, @p7, N'CABLE-USBC-1M', N'1 m', 19900, N'NAD', 15, 24900, N'track'),
      (@v7b, @p7, N'CABLE-USBC-2M', N'2 m', 25900, N'NAD', 15, 31900, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p7, N'https://images.unsplash.com/photo-1583863788444-cbe32897a469?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v7a, CAST(id AS UNIQUEIDENTIFIER), 120 FROM dbo.warehouses WHERE code = N'MAIN';
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v7b, CAST(id AS UNIQUEIDENTIFIER), 95 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'bluetooth-speaker-mini')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p8,
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      N'bluetooth-speaker-mini',
      N'Mini Bluetooth speaker',
      N'Portable 360° sound — 10 h battery.',
      1,
      N'sound-wave',
      N'Sound Wave'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v8, @p8, N'AUDIO-BT-MINI', N'Black', 89900, N'NAD', 4, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p8, N'https://images.unsplash.com/photo-1608043152269-423dbba4e7e2?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v8, CAST(id AS UNIQUEIDENTIFIER), 35 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'aa-batteries-8-pack')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p9,
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      N'aa-batteries-8-pack',
      N'AA alkaline batteries 8 pack',
      N'Long-lasting power for remotes and toys.',
      1,
      N'volt-plus',
      N'Volt Plus'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v9, @p9, N'BATT-AA-8', N'8 pack', 12900, N'NAD', 8, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p9, N'https://images.unsplash.com/photo-1619641805757-1b923f6b4c42?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v9, CAST(id AS UNIQUEIDENTIFIER), 180 FROM dbo.warehouses WHERE code = N'MAIN';
  END;
END;

IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'home')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'dishwashing-liquid-750ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p10,
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      N'dishwashing-liquid-750ml',
      N'Dishwashing liquid 750 ml',
      N'Cuts grease — citrus scent.',
      1,
      N'shine-home',
      N'Shine Home'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v10, @p10, N'CLEAN-DISH-750', N'750 ml', 4599, N'NAD', 10, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p10, N'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v10, CAST(id AS UNIQUEIDENTIFIER), 75 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'electric-kettle-1-7l')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p11,
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      N'electric-kettle-1-7l',
      N'Electric kettle 1.7 L',
      N'Stainless steel — auto shut-off.',
      1,
      N'kitchen-pro',
      N'Kitchen Pro'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v11, @p11, N'KETTLE-17L-SS', N'1.7 L stainless', 59900, N'NAD', 3, 69900, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p11, N'https://images.unsplash.com/photo-1574269909862-7e1d70bb8077?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v11, CAST(id AS UNIQUEIDENTIFIER), 28 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'cotton-bath-towel')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p12,
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      N'cotton-bath-towel',
      N'Premium cotton bath towel',
      N'Plush 600 GSM — quick dry.',
      1,
      N'linen-co',
      N'Linen Co'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v12, @p12, N'TOWEL-BATH-WHT', N'White', 34900, N'NAD', 5, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p12, N'https://images.unsplash.com/photo-1584345604476-8ec5e82e1aa5?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v12, CAST(id AS UNIQUEIDENTIFIER), 40 FROM dbo.warehouses WHERE code = N'MAIN';
  END;
END;
GO

/* ---- Extra deposit pickup “stores” (locations + boxes) ---- */
IF NOT EXISTS (SELECT 1 FROM dbo.deposit_locations WHERE id = '7D100001-0000-4000-8000-000000000001')
  INSERT INTO dbo.deposit_locations (id, name, address_summary)
  VALUES (
    '7D100001-0000-4000-8000-000000000001',
    N'Swakopmund seafront locker',
    N'Sam Nujoma Ave — near jetty parking'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_locations WHERE id = '7D100001-0000-4000-8000-000000000002')
  INSERT INTO dbo.deposit_locations (id, name, address_summary)
  VALUES (
    '7D100001-0000-4000-8000-000000000002',
    N'Ongwediva PayToday hub',
    N'Evululuko complex — main entrance'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_locations WHERE id = '7D100001-0000-4000-8000-000000000003')
  INSERT INTO dbo.deposit_locations (id, name, address_summary)
  VALUES (
    '7D100001-0000-4000-8000-000000000003',
    N'Walvis Bay harbour kiosk',
    N'Port road — pickup lane B'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'SWK-BOX-01')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000001', '7D100001-0000-4000-8000-000000000001', N'SWK-BOX-01', 48, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'SWK-BOX-02')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000002', '7D100001-0000-4000-8000-000000000001', N'SWK-BOX-02', 48, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'ONG-BOX-01')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000003', '7D100001-0000-4000-8000-000000000002', N'ONG-BOX-01', 36, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'WVB-BOX-01')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000004', '7D100001-0000-4000-8000-000000000003', N'WVB-BOX-01', 30, 0);
GO

/* ---- Optional: more shop hero tiles ---- */
IF OBJECT_ID(N'dbo.store_promotions', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.store_promotions WHERE slug = N'weekend-snacks')
    INSERT INTO dbo.store_promotions (slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at)
    VALUES (
      N'weekend-snacks',
      N'Snack smarter',
      N'Chips, drinks & treats for movie night.',
      N'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=1200&q=80',
      N'/shop',
      15,
      1,
      NULL,
      NULL
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.store_promotions WHERE slug = N'home-essentials')
    INSERT INTO dbo.store_promotions (slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at)
    VALUES (
      N'home-essentials',
      N'Home essentials',
      N'Cleaning, kitchen & comfort picks.',
      N'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
      N'/shop',
      25,
      1,
      NULL,
      NULL
    );
END;
GO
