/*
  Runtime integration secrets and URLs (Keycloak, PayToday, notify service).
  Non-empty values override process.env for the same logical key (see backend/src/services/integrationRuntimeConfig.ts).
  Full key list + MERGE examples: backend/scripts/seed-integration-settings.template.sql

  Example (SSMS) — move secrets out of .env after bootstrap:
    MERGE dbo.integration_settings AS t
    USING (SELECT N'KEYCLOAK_CLIENT_SECRET' AS setting_key, N'your-secret' AS setting_value) AS s
    ON t.setting_key = s.setting_key
    WHEN MATCHED THEN UPDATE SET setting_value = s.setting_value, updated_at = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (s.setting_key, s.setting_value);
*/

IF OBJECT_ID(N'dbo.integration_settings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.integration_settings (
    setting_key NVARCHAR(128) NOT NULL CONSTRAINT PK_integration_settings PRIMARY KEY,
    setting_value NVARCHAR(MAX) NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_integration_settings_updated DEFAULT (SYSUTCDATETIME())
  );
END;
