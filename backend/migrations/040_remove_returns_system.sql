/* Remove the returns workflow introduced in migration 011 (superseded by dispute management). */

/* Drop return_case_lines first due to FK dependency on return_cases. */
IF OBJECT_ID(N'dbo.return_case_lines', N'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.return_case_lines;
END;
GO

IF OBJECT_ID(N'dbo.return_cases', N'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.return_cases;
END;
GO
