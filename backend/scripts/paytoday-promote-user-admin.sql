/*
  Set role to admin for an existing user (by email).
  The user must already exist in dbo.users (register first if needed).
*/
USE [paytoday];
GO

DECLARE @email NVARCHAR(320) = N'louis.viljoen@crvw.com.na';

UPDATE dbo.users
SET role = N'admin',
    updated_at = SYSUTCDATETIME()
WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(LTRIM(RTRIM(@email)));

IF @@ROWCOUNT = 0
  PRINT N'No row updated: no user with that email. Create the account, then re-run.';
ELSE
  PRINT N'User promoted to admin. Sign out and sign in again to refresh the token.';
GO
