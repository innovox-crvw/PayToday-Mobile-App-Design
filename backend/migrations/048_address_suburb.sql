/* Add suburb / locality field to delivery addresses. */

IF COL_LENGTH(N'dbo.addresses', N'suburb') IS NULL
BEGIN
  ALTER TABLE dbo.addresses ADD suburb NVARCHAR(120) NULL;
END;
GO
