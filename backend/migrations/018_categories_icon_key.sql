/* Optional storefront icon for category tiles (allowlisted keys in app + admin). */

IF COL_LENGTH('dbo.categories', 'icon_key') IS NULL
BEGIN
  ALTER TABLE dbo.categories ADD icon_key NVARCHAR(40) NULL;
END
GO

UPDATE dbo.categories
SET icon_key = CASE LOWER(LTRIM(RTRIM(slug)))
  WHEN N'electronics' THEN N'electronics'
  WHEN N'fashion' THEN N'fashion'
  WHEN N'groceries' THEN N'groceries'
  WHEN N'home' THEN N'home'
  WHEN N'soft-drinks' THEN N'beverages'
  WHEN N'snacks-pantry' THEN N'snacks'
  WHEN N'fresh-produce' THEN N'produce'
  WHEN N'accessories' THEN N'accessories'
  WHEN N'audio' THEN N'audio'
  WHEN N'cleaning' THEN N'cleaning'
  ELSE NULL
END
WHERE icon_key IS NULL;
GO
