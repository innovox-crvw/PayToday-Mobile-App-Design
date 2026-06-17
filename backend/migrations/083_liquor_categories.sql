/* Top-level liquor category and wine / beer / spirits children for catalog CSV and age gating. */
SET NOCOUNT ON;

IF COL_LENGTH(N'dbo.categories', N'parent_id') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'liquor')
  BEGIN
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000001', N'liquor', N'Liquor & beverages', NULL, 40, 1);
  END;

  DECLARE @liquorId UNIQUEIDENTIFIER = (SELECT id FROM dbo.categories WHERE slug = N'liquor');

  IF @liquorId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'wine')
  BEGIN
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000002', N'wine', N'Wine', @liquorId, 10, 1);
  END;

  IF @liquorId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'beer')
  BEGIN
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000003', N'beer', N'Beer & cider', @liquorId, 20, 1);
  END;

  IF @liquorId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'spirits')
  BEGIN
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (N'7E100002-0000-4000-8000-000000000004', N'spirits', N'Spirits', @liquorId, 30, 1);
  END;
END;
GO
