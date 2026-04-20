/* Pre-provision Keycloak sign-in throttling by email (no users row yet, or local-only row without keycloak_sub). */
IF OBJECT_ID(N'dbo.keycloak_login_throttle', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.keycloak_login_throttle (
    email_normalized NVARCHAR(320) NOT NULL CONSTRAINT PK_keycloak_login_throttle PRIMARY KEY,
    failed_count INT NOT NULL CONSTRAINT DF_keycloak_login_throttle_failed DEFAULT (0),
    locked_until DATETIME2 NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_keycloak_login_throttle_updated DEFAULT (SYSUTCDATETIME())
  );
END
