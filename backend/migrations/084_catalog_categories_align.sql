/* Align category tree with catalog-100-products (names, parents, sort, icons, active). */
SET NOCOUNT ON;

IF COL_LENGTH(N'dbo.categories', N'parent_id') IS NULL
  RETURN;
GO

DECLARE @gro UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'groceries');
DECLARE @el  UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'electronics');
DECLARE @hom UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'home');
DECLARE @liq UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'liquor');

IF @gro IS NULL
BEGIN
  SET @gro = N'7E100003-0000-4000-8000-000000000010';
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
  VALUES (@gro, N'groceries', N'Groceries', NULL, 10, 1);
END
ELSE
  UPDATE dbo.categories SET name = N'Groceries', parent_id = NULL, sort_order = 10, is_active = 1 WHERE id = @gro;

IF @el IS NULL
BEGIN
  SET @el = N'7E100003-0000-4000-8000-000000000020';
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
  VALUES (@el, N'electronics', N'Electronics', NULL, 20, 1);
END
ELSE
  UPDATE dbo.categories SET name = N'Electronics', parent_id = NULL, sort_order = 20, is_active = 1 WHERE id = @el;

IF @hom IS NULL
BEGIN
  SET @hom = N'7E100003-0000-4000-8000-000000000030';
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
  VALUES (@hom, N'home', N'Home & kitchen', NULL, 30, 1);
END
ELSE
  UPDATE dbo.categories SET name = N'Home & kitchen', parent_id = NULL, sort_order = 30, is_active = 1 WHERE id = @hom;

IF @liq IS NULL
BEGIN
  SET @liq = N'7E100002-0000-4000-8000-000000000001';
  INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
  VALUES (@liq, N'liquor', N'Liquor & beverages', NULL, 40, 1);
END
ELSE
  UPDATE dbo.categories SET name = N'Liquor & beverages', parent_id = NULL, sort_order = 40, is_active = 1 WHERE id = @liq;
GO

/* Groceries children */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  DECLARE @g UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'groceries');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'fresh-produce')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100001-0000-4000-8000-000000000003', N'fresh-produce', N'Fresh produce', @g, 11, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Fresh produce', parent_id = @g, sort_order = 11, is_active = 1 WHERE slug = N'fresh-produce';

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'soft-drinks')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100001-0000-4000-8000-000000000001', N'soft-drinks', N'Soft drinks', @g, 12, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Soft drinks', parent_id = @g, sort_order = 12, is_active = 1 WHERE slug = N'soft-drinks';

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'snacks-pantry')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100001-0000-4000-8000-000000000002', N'snacks-pantry', N'Snacks & pantry', @g, 13, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Snacks & pantry', parent_id = @g, sort_order = 13, is_active = 1 WHERE slug = N'snacks-pantry';
END;
GO

/* Electronics children */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'electronics')
BEGIN
  DECLARE @e UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'electronics');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'accessories')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100001-0000-4000-8000-000000000004', N'accessories', N'Phone & laptop accessories', @e, 21, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Phone & laptop accessories', parent_id = @e, sort_order = 21, is_active = 1 WHERE slug = N'accessories';

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'audio')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100001-0000-4000-8000-000000000005', N'audio', N'Audio', @e, 22, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Audio', parent_id = @e, sort_order = 22, is_active = 1 WHERE slug = N'audio';
END;
GO

/* Home children */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'home')
BEGIN
  DECLARE @h UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'home');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'cleaning')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100001-0000-4000-8000-000000000006', N'cleaning', N'Cleaning & laundry', @h, 31, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Cleaning & laundry', parent_id = @h, sort_order = 31, is_active = 1 WHERE slug = N'cleaning';
END;
GO

/* Liquor children */
IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'liquor')
BEGIN
  DECLARE @l UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'liquor');

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'wine')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000002', N'wine', N'Wine', @l, 41, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Wine', parent_id = @l, sort_order = 41, is_active = 1 WHERE slug = N'wine';

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'beer')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000003', N'beer', N'Beer & cider', @l, 42, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Beer & cider', parent_id = @l, sort_order = 42, is_active = 1 WHERE slug = N'beer';

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'spirits')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000004', N'spirits', N'Spirits', @l, 43, 1);
  ELSE
    UPDATE dbo.categories SET name = N'Spirits', parent_id = @l, sort_order = 43, is_active = 1 WHERE slug = N'spirits';
END;
GO

IF COL_LENGTH(N'dbo.categories', N'icon_key') IS NOT NULL
BEGIN
  UPDATE dbo.categories SET icon_key = N'groceries' WHERE slug = N'groceries';
  UPDATE dbo.categories SET icon_key = N'produce' WHERE slug = N'fresh-produce';
  UPDATE dbo.categories SET icon_key = N'beverages' WHERE slug IN (N'soft-drinks', N'liquor', N'wine', N'beer', N'spirits');
  UPDATE dbo.categories SET icon_key = N'snacks' WHERE slug = N'snacks-pantry';
  UPDATE dbo.categories SET icon_key = N'electronics' WHERE slug = N'electronics';
  UPDATE dbo.categories SET icon_key = N'accessories' WHERE slug = N'accessories';
  UPDATE dbo.categories SET icon_key = N'audio' WHERE slug = N'audio';
  UPDATE dbo.categories SET icon_key = N'home' WHERE slug = N'home';
  UPDATE dbo.categories SET icon_key = N'cleaning' WHERE slug = N'cleaning';
END;
GO
