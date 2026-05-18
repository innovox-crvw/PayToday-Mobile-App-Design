/* Store the user's preferred UI locale (BCP-47 tag, e.g. "en-NA", "af-NA"). */

IF COL_LENGTH(N'dbo.users', N'ui_locale') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD ui_locale NVARCHAR(20) NULL;
END;
GO
