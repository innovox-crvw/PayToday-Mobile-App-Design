/* Security phase 1: password reset tokens + JWT revocation table. */

IF OBJECT_ID(N'dbo.password_reset_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.password_reset_tokens (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_password_reset_tokens PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    token_hash NVARCHAR(128) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    used_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_prt_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_prt_user FOREIGN KEY (user_id) REFERENCES dbo.users (id) ON DELETE CASCADE
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_password_reset_tokens_hash ON dbo.password_reset_tokens (token_hash);
  CREATE NONCLUSTERED INDEX IX_password_reset_tokens_user ON dbo.password_reset_tokens (user_id);
  CREATE NONCLUSTERED INDEX IX_password_reset_tokens_expires ON dbo.password_reset_tokens (expires_at);
END;
GO

IF OBJECT_ID(N'dbo.revoked_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.revoked_tokens (
    /* jti = JWT ID claim; acts as the primary key. */
    jti NVARCHAR(128) NOT NULL CONSTRAINT PK_revoked_tokens PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NULL,
    revoked_at DATETIME2 NOT NULL CONSTRAINT DF_revoked_tokens_revoked_at DEFAULT (SYSUTCDATETIME()),
    /* Keep until the token would have expired so we can safely purge old rows. */
    expires_at DATETIME2 NOT NULL
  );
  CREATE NONCLUSTERED INDEX IX_revoked_tokens_expires ON dbo.revoked_tokens (expires_at);
END;
GO
