/*
  Template: copy into SSMS, replace <VALUES>, execute against [paytoday].

  CLI alternative (same table):
    Copy backend/scripts/integration-settings.seed.example.json → integration-settings.seed.json
    Fill values, then: npm run db:seed-integration

  Non-empty rows in dbo.integration_settings override process.env (see integrationRuntimeConfig.ts).
  After changes, wait ~60s or restart the API.

  Required for production: at minimum SQL connection still comes from .env (SQL_CONNECTION_STRING) and JWT_SECRET.
*/

USE [paytoday];
GO

-- Example: upsert one key (repeat for each setting you need)
/*
MERGE dbo.integration_settings AS t
USING (SELECT N'NOTIFY_SERVICE_API_KEY' AS setting_key, N'<your-api-key>' AS setting_value) AS s
ON t.setting_key = s.setting_key
WHEN MATCHED THEN UPDATE SET setting_value = s.setting_value, updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (s.setting_key, s.setting_value);
*/

/*
  Keys (setting_key → meaning):

  --- Notify ---
  NOTIFY_SERVICE_API_KEY
  NOTIFY_SERVICE_BASE_URL
  NOTIFY_SERVICE_PORTAL         (path segment before /email, e.g. business-2025-api-portal)
  NOTIFY_SERVICE_INBOX_PATH     (e.g. /notifications — used for public notifyInboxUrl)
  NOTIFY_EMAIL_TEMPLATE_IDS   (JSON string, e.g. {"checkout_pending_payment":"tmpl_abc"})
  NOTIFICATION_EMAIL_FROM
  PUBLIC_STORE_URL              (also used in notify email links)

  --- PayToday ---
  PAYTODAY_FORMS_BASE_URL
  PAYTODAY_FORMS_API_URL
  PAYTODAY_PAYMENT_INTENT_URL
  PAYTODAY_VENDOR_ID
  PAYTODAY_BUSINESS_ID
  PAYTODAY_WEBHOOK_SECRET
  PAYTODAY_SCAN_API_BASE_URL
  PUBLIC_API_URL

  --- Keycloak ---
  KEYCLOAK_ISSUER
  KEYCLOAK_TOKEN_URL
  KEYCLOAK_CLIENT_ID
  KEYCLOAK_CLIENT_SECRET
  KEYCLOAK_FRONTEND_CLIENT_ID
  KEYCLOAK_FRONTEND_CLIENT_SECRET
  KEYCLOAK_MOBILE_CLIENT_ID
  KEYCLOAK_MOBILE_CLIENT_SECRET
  KEYCLOAK_REALM_ROLE_ADMIN
  KEYCLOAK_REALM_ROLE_OPS
  KEYCLOAK_REALM_ROLE_FULFILLMENT
  KEYCLOAK_SIGN_IN_ONLY                    (true|false)
  KEYCLOAK_ALLOW_LOCAL_PASSWORD_LOGIN      (true|false)
  KEYCLOAK_ROPC_LOGIN_ENABLED              (true|false)
  PAYTODAY_FORGOT_PASSWORD_URL
*/
GO
