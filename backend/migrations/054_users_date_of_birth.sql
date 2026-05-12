IF COL_LENGTH(N'dbo.users', N'date_of_birth') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD date_of_birth DATE NULL;
END;
GO
