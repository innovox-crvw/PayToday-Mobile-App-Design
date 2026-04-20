/* Customer self-service: lockout, email verification, password reset tokens */

IF COL_LENGTH('dbo.users', 'failed_login_count') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD failed_login_count INT NOT NULL CONSTRAINT DF_users_failed_login_count DEFAULT (0);
END;
GO

IF COL_LENGTH('dbo.users', 'locked_until') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD locked_until DATETIME2 NULL;
END;
GO

IF COL_LENGTH('dbo.users', 'email_verified') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD email_verified BIT NOT NULL CONSTRAINT DF_users_email_verified DEFAULT (1);
END;
GO

IF COL_LENGTH('dbo.users', 'email_verification_token_hash') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD email_verification_token_hash VARBINARY(32) NULL;
END;
GO

IF COL_LENGTH('dbo.users', 'email_verification_expires_at') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD email_verification_expires_at DATETIME2 NULL;
END;
GO

IF OBJECT_ID('dbo.password_reset_tokens', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.password_reset_tokens (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_password_reset_tokens PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_password_reset_tokens_user REFERENCES dbo.users(id) ON DELETE CASCADE,
    token_hash VARBINARY(32) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    used_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_password_reset_tokens_created DEFAULT (SYSUTCDATETIME())
  );
  CREATE INDEX IX_password_reset_tokens_lookup ON dbo.password_reset_tokens(token_hash) WHERE used_at IS NULL;
END;
GO
