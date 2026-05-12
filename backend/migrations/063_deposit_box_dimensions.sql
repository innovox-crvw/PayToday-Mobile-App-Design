/* Optional interior dimensions (mm) for deposit locker boxes. */

IF OBJECT_ID(N'dbo.deposit_boxes', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.deposit_boxes', N'width_mm') IS NULL
BEGIN
  ALTER TABLE dbo.deposit_boxes ADD width_mm INT NULL;
END;
GO

IF OBJECT_ID(N'dbo.deposit_boxes', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.deposit_boxes', N'depth_mm') IS NULL
BEGIN
  ALTER TABLE dbo.deposit_boxes ADD depth_mm INT NULL;
END;
GO

IF OBJECT_ID(N'dbo.deposit_boxes', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.deposit_boxes', N'height_mm') IS NULL
BEGIN
  ALTER TABLE dbo.deposit_boxes ADD height_mm INT NULL;
END;
GO
