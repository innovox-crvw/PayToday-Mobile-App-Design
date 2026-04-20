/*
  PayToday — full schema + sample data for SSMS / sqlcmd
  Run as a user that can CREATE DATABASE (or comment out the CREATE DATABASE block and use an existing DB).

  Schema includes catalogue (012-style), orders/payments (007/010/015), cart snapshot (013), auth self-service (014),
  migration 016 demo catalogue + deposit extras, Keycloak-ready users, notification outbox seed.

  Demo login (after seed):  demo@paytoday.local  /  PayToday123!

  Regenerate all-in-one: node backend/scripts/build-all-in-one-sql.mjs
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_ID(N'paytoday') IS NULL
BEGIN
  CREATE DATABASE [paytoday];
END
GO

USE [paytoday];
GO

/* ---- Drop existing objects (dev reset) — children first ---- */
IF OBJECT_ID(N'dbo.pickup_codes', N'U') IS NOT NULL DROP TABLE dbo.pickup_codes;
IF OBJECT_ID(N'dbo.return_case_lines', N'U') IS NOT NULL DROP TABLE dbo.return_case_lines;
IF OBJECT_ID(N'dbo.return_cases', N'U') IS NOT NULL DROP TABLE dbo.return_cases;
IF OBJECT_ID(N'dbo.return_requests', N'U') IS NOT NULL DROP TABLE dbo.return_requests;
IF OBJECT_ID(N'dbo.order_lines', N'U') IS NOT NULL DROP TABLE dbo.order_lines;
IF OBJECT_ID(N'dbo.payments', N'U') IS NOT NULL DROP TABLE dbo.payments;
IF OBJECT_ID(N'dbo.fulfillment_tasks', N'U') IS NOT NULL DROP TABLE dbo.fulfillment_tasks;
IF OBJECT_ID(N'dbo.inventory_reservations', N'U') IS NOT NULL DROP TABLE dbo.inventory_reservations;
IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL DROP TABLE dbo.orders;
IF OBJECT_ID(N'dbo.cart_lines', N'U') IS NOT NULL DROP TABLE dbo.cart_lines;
IF OBJECT_ID(N'dbo.carts', N'U') IS NOT NULL DROP TABLE dbo.carts;
IF OBJECT_ID(N'dbo.stock_movements', N'U') IS NOT NULL DROP TABLE dbo.stock_movements;
IF OBJECT_ID(N'dbo.inventory_quantity', N'U') IS NOT NULL DROP TABLE dbo.inventory_quantity;
IF OBJECT_ID(N'dbo.product_images', N'U') IS NOT NULL DROP TABLE dbo.product_images;
IF OBJECT_ID(N'dbo.product_variant_options', N'U') IS NOT NULL DROP TABLE dbo.product_variant_options;
IF OBJECT_ID(N'dbo.product_variants', N'U') IS NOT NULL DROP TABLE dbo.product_variants;
IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL DROP TABLE dbo.products;
IF OBJECT_ID(N'dbo.categories', N'U') IS NOT NULL DROP TABLE dbo.categories;
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL DROP TABLE dbo.hub_navigation_tiles;
IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL DROP TABLE dbo.hub_payment_category_items;
IF OBJECT_ID(N'dbo.notification_outbox', N'U') IS NOT NULL DROP TABLE dbo.notification_outbox;
IF OBJECT_ID(N'dbo.user_notifications', N'U') IS NOT NULL DROP TABLE dbo.user_notifications;
IF OBJECT_ID(N'dbo.user_refresh_tokens', N'U') IS NOT NULL DROP TABLE dbo.user_refresh_tokens;
IF OBJECT_ID(N'dbo.password_reset_tokens', N'U') IS NOT NULL DROP TABLE dbo.password_reset_tokens;
IF OBJECT_ID(N'dbo.demo_wallet_ledger', N'U') IS NOT NULL DROP TABLE dbo.demo_wallet_ledger;
IF OBJECT_ID(N'dbo.addresses', N'U') IS NOT NULL DROP TABLE dbo.addresses;
IF OBJECT_ID(N'dbo.users', N'U') IS NOT NULL DROP TABLE dbo.users;
IF OBJECT_ID(N'dbo.deposit_boxes', N'U') IS NOT NULL DROP TABLE dbo.deposit_boxes;
IF OBJECT_ID(N'dbo.deposit_locations', N'U') IS NOT NULL DROP TABLE dbo.deposit_locations;
IF OBJECT_ID(N'dbo.warehouses', N'U') IS NOT NULL DROP TABLE dbo.warehouses;
IF OBJECT_ID(N'dbo.store_promotions', N'U') IS NOT NULL DROP TABLE dbo.store_promotions;
IF OBJECT_ID(N'dbo.payment_webhook_events', N'U') IS NOT NULL DROP TABLE dbo.payment_webhook_events;
IF OBJECT_ID(N'dbo.payment_return_events', N'U') IS NOT NULL DROP TABLE dbo.payment_return_events;
IF OBJECT_ID(N'dbo.schema_migrations', N'U') IS NOT NULL DROP TABLE dbo.schema_migrations;
IF OBJECT_ID(N'dbo.integration_settings', N'U') IS NOT NULL DROP TABLE dbo.integration_settings;
GO

/* ---- Core catalogue ---- */
CREATE TABLE dbo.categories (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_categories PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  slug NVARCHAR(120) NOT NULL CONSTRAINT UQ_categories_slug UNIQUE,
  name NVARCHAR(200) NOT NULL,
  parent_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_categories_parent REFERENCES dbo.categories(id),
  sort_order INT NOT NULL CONSTRAINT DF_categories_sort DEFAULT (0),
  is_active BIT NOT NULL CONSTRAINT DF_categories_active DEFAULT (1)
);

CREATE TABLE dbo.products (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_products PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  category_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_products_category REFERENCES dbo.categories(id),
  slug NVARCHAR(160) NOT NULL CONSTRAINT UQ_products_slug UNIQUE,
  name NVARCHAR(300) NOT NULL,
  description NVARCHAR(MAX) NULL,
  brand_slug NVARCHAR(80) NULL,
  brand_name NVARCHAR(160) NULL,
  is_active BIT NOT NULL CONSTRAINT DF_products_active DEFAULT (1)
);

CREATE TABLE dbo.product_variants (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_product_variants PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  product_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_variants_product REFERENCES dbo.products(id) ON DELETE CASCADE,
  sku NVARCHAR(80) NOT NULL,
  name NVARCHAR(200) NOT NULL,
  price_cents INT NOT NULL,
  currency CHAR(3) NOT NULL CONSTRAINT DF_variants_currency DEFAULT ('NAD'),
  low_stock_threshold INT NULL,
  compare_at_price_cents INT NULL,
  inventory_policy NVARCHAR(20) NOT NULL CONSTRAINT DF_pv_invpol DEFAULT (N'track')
);

CREATE TABLE dbo.product_variant_options (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_product_variant_options PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pvo_variant REFERENCES dbo.product_variants(id) ON DELETE CASCADE,
  option_name NVARCHAR(60) NOT NULL,
  option_value NVARCHAR(120) NOT NULL,
  sort_order INT NOT NULL CONSTRAINT DF_pvo_sort DEFAULT (0)
);
CREATE INDEX IX_product_variant_options_variant ON dbo.product_variant_options(variant_id);

CREATE TABLE dbo.product_images (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_product_images PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  product_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_images_product REFERENCES dbo.products(id) ON DELETE CASCADE,
  /* NO ACTION on variant: CASCADE here + CASCADE product→variants would create multiple cascade paths in SQL Server. */
  variant_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_product_images_variant REFERENCES dbo.product_variants(id),
  url NVARCHAR(2000) NOT NULL,
  sort_order INT NOT NULL CONSTRAINT DF_images_sort DEFAULT (0)
);

CREATE TABLE dbo.warehouses (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_warehouses PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  code NVARCHAR(32) NOT NULL CONSTRAINT UQ_warehouses_code UNIQUE,
  name NVARCHAR(200) NOT NULL
);

CREATE TABLE dbo.inventory_quantity (
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_iq_variant REFERENCES dbo.product_variants(id) ON DELETE CASCADE,
  warehouse_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_iq_warehouse REFERENCES dbo.warehouses(id),
  quantity INT NOT NULL CONSTRAINT DF_iq_qty DEFAULT (0),
  CONSTRAINT PK_inventory_quantity PRIMARY KEY (variant_id, warehouse_id)
);

CREATE TABLE dbo.stock_movements (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_stock_movements PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_sm_variant REFERENCES dbo.product_variants(id),
  warehouse_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_sm_warehouse REFERENCES dbo.warehouses(id),
  delta_qty INT NOT NULL,
  reason NVARCHAR(80) NOT NULL,
  reference_type NVARCHAR(40) NULL,
  reference_id UNIQUEIDENTIFIER NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_sm_created DEFAULT (SYSUTCDATETIME())
);

CREATE TABLE dbo.store_promotions (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_store_promotions PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  slug NVARCHAR(120) NOT NULL CONSTRAINT UQ_promo_slug UNIQUE,
  title NVARCHAR(300) NOT NULL,
  subtitle NVARCHAR(500) NULL,
  image_url NVARCHAR(2000) NULL,
  link_path NVARCHAR(500) NULL,
  sort_order INT NOT NULL CONSTRAINT DF_promo_sort DEFAULT (0),
  is_active BIT NOT NULL CONSTRAINT DF_promo_active DEFAULT (1),
  starts_at DATETIME2 NULL,
  ends_at DATETIME2 NULL
);

CREATE TABLE dbo.hub_payment_category_items (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hub_pay_items PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  category_slug NVARCHAR(80) NOT NULL,
  item_kind NVARCHAR(20) NOT NULL,
  display_name NVARCHAR(300) NOT NULL,
  initials NVARCHAR(20) NULL,
  /* Optional caption per biller/contact (added by migration 003 in older DBs). */
  payment_method NVARCHAR(120) NULL,
  sort_order INT NOT NULL CONSTRAINT DF_hub_item_sort DEFAULT (0),
  is_active BIT NOT NULL CONSTRAINT DF_hub_item_active DEFAULT (1)
);

/* Payments / Services hub grids (GET /api/hub/navigation-tiles) */
CREATE TABLE dbo.hub_navigation_tiles (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hub_nav_tiles PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  hub_kind NVARCHAR(32) NOT NULL,
  slug NVARCHAR(80) NOT NULL,
  label NVARCHAR(160) NOT NULL,
  icon_key NVARCHAR(80) NOT NULL,
  list_style NVARCHAR(20) NULL,
  /* Optional caption shown under tiles (added by migration 003 in older DBs). */
  payment_methods_caption NVARCHAR(200) NULL,
  link_path NVARCHAR(256) NOT NULL,
  sort_order INT NOT NULL CONSTRAINT DF_hub_nav_sort DEFAULT (0),
  is_active BIT NOT NULL CONSTRAINT DF_hub_nav_active DEFAULT (1),
  CONSTRAINT UQ_hub_nav_slug_kind UNIQUE (hub_kind, slug)
);

/* Key/value overrides for PayToday, Keycloak, notify (non-empty values override process.env). */
CREATE TABLE dbo.integration_settings (
  setting_key NVARCHAR(128) NOT NULL CONSTRAINT PK_integration_settings PRIMARY KEY,
  setting_value NVARCHAR(MAX) NULL,
  updated_at DATETIME2 NOT NULL CONSTRAINT DF_integration_settings_updated DEFAULT (SYSUTCDATETIME())
);

/* ---- Auth & addresses ---- */
CREATE TABLE dbo.users (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_users PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  email NVARCHAR(320) NOT NULL CONSTRAINT UQ_users_email UNIQUE,
  /* Local users have a bcrypt hash; Keycloak users can be linked by keycloak_sub with NULL password_hash. */
  password_hash NVARCHAR(500) NULL,
  keycloak_sub NVARCHAR(255) NULL,
  full_name NVARCHAR(200) NULL,
  role NVARCHAR(32) NOT NULL,
  notification_channel NVARCHAR(20) NOT NULL CONSTRAINT DF_users_notify DEFAULT ('email'),
  wallet_demo_balance_cents BIGINT NOT NULL CONSTRAINT DF_users_wallet_demo DEFAULT (0),
  failed_login_count INT NOT NULL CONSTRAINT DF_users_failed_login_count DEFAULT (0),
  locked_until DATETIME2 NULL,
  email_verified BIT NOT NULL CONSTRAINT DF_users_email_verified DEFAULT (1),
  email_verification_token_hash VARBINARY(32) NULL,
  email_verification_expires_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created DEFAULT (SYSUTCDATETIME()),
  updated_at DATETIME2 NULL
);

/* Filtered unique index for Keycloak users (mirrors migration 008). */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UQ_users_keycloak_sub' AND object_id = OBJECT_ID(N'dbo.users')
)
BEGIN
  CREATE UNIQUE INDEX UQ_users_keycloak_sub ON dbo.users(keycloak_sub) WHERE keycloak_sub IS NOT NULL;
END;

CREATE TABLE dbo.user_refresh_tokens (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_refresh PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_refresh_user REFERENCES dbo.users(id) ON DELETE CASCADE,
  token_hash VARBINARY(64) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  revoked_at DATETIME2 NULL
);

CREATE TABLE dbo.password_reset_tokens (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_password_reset_tokens PRIMARY KEY DEFAULT NEWID(),
  user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_password_reset_tokens_user REFERENCES dbo.users(id) ON DELETE CASCADE,
  token_hash VARBINARY(32) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  used_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_password_reset_tokens_created DEFAULT (SYSUTCDATETIME())
);
CREATE INDEX IX_password_reset_tokens_lookup ON dbo.password_reset_tokens(token_hash) WHERE used_at IS NULL;

CREATE TABLE dbo.addresses (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_addresses PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_addr_user REFERENCES dbo.users(id) ON DELETE CASCADE,
  label NVARCHAR(120) NULL,
  line1 NVARCHAR(300) NOT NULL,
  line2 NVARCHAR(300) NULL,
  city NVARCHAR(120) NOT NULL,
  region NVARCHAR(120) NULL,
  postal_code NVARCHAR(40) NULL,
  country NVARCHAR(120) NOT NULL,
  is_default BIT NOT NULL CONSTRAINT DF_addr_default DEFAULT (0)
);

CREATE TABLE dbo.demo_wallet_ledger (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_demo_wallet_ledger PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_dwl_user REFERENCES dbo.users(id) ON DELETE CASCADE,
  delta_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  entry_type NVARCHAR(40) NOT NULL,
  reference NVARCHAR(120) NULL,
  correlation_id UNIQUEIDENTIFIER NULL,
  payee_label NVARCHAR(200) NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_dwl_created DEFAULT (SYSUTCDATETIME())
);

CREATE INDEX IX_demo_wallet_ledger_user_created ON dbo.demo_wallet_ledger(user_id, created_at DESC);

CREATE UNIQUE INDEX UQ_demo_wallet_ledger_user_corr ON dbo.demo_wallet_ledger(user_id, correlation_id)
WHERE correlation_id IS NOT NULL;

/* ---- Pickup / deposit ---- */
CREATE TABLE dbo.deposit_locations (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_deposit_loc PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  name NVARCHAR(200) NOT NULL,
  address_summary NVARCHAR(500) NULL
);

CREATE TABLE dbo.deposit_boxes (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_deposit_box PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  location_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_box_loc REFERENCES dbo.deposit_locations(id),
  code NVARCHAR(40) NOT NULL,
  capacity INT NOT NULL,
  current_load INT NOT NULL CONSTRAINT DF_box_load DEFAULT (0)
);

/* ---- Cart ---- */
CREATE TABLE dbo.carts (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_carts PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  session_token NVARCHAR(120) NULL,
  user_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_carts_user REFERENCES dbo.users(id),
  created_at DATETIME2 NOT NULL CONSTRAINT DF_carts_created DEFAULT (SYSUTCDATETIME()),
  updated_at DATETIME2 NOT NULL CONSTRAINT DF_carts_updated DEFAULT (SYSUTCDATETIME())
);

CREATE TABLE dbo.cart_lines (
  cart_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_cl_cart REFERENCES dbo.carts(id) ON DELETE CASCADE,
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_cl_variant REFERENCES dbo.product_variants(id),
  quantity INT NOT NULL,
  unit_price_cents INT NOT NULL CONSTRAINT DF_cart_lines_unit_price DEFAULT (0),
  line_currency CHAR(3) NOT NULL CONSTRAINT DF_cart_lines_currency DEFAULT ('NAD'),
  CONSTRAINT PK_cart_lines PRIMARY KEY (cart_id, variant_id)
);

/* ---- Orders & payments ---- */
CREATE TABLE dbo.orders (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_orders PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  user_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_orders_user REFERENCES dbo.users(id),
  guest_email NVARCHAR(320) NULL,
  status NVARCHAR(40) NOT NULL,
  delivery_method NVARCHAR(32) NOT NULL,
  shipping_address_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_orders_addr REFERENCES dbo.addresses(id),
  deposit_location_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_orders_deposit_loc REFERENCES dbo.deposit_locations(id),
  subtotal_cents INT NOT NULL,
  shipping_cents INT NOT NULL CONSTRAINT DF_orders_ship DEFAULT (0),
  tax_cents INT NOT NULL CONSTRAINT DF_orders_tax DEFAULT (0),
  total_cents INT NOT NULL,
  currency CHAR(3) NOT NULL CONSTRAINT DF_orders_cur DEFAULT ('NAD'),
  checkout_idempotency_key NVARCHAR(120) NULL,
  paytoday_reference NVARCHAR(200) NULL,
  paytoday_payment_intent_token NVARCHAR(128) NULL,
  refund_handling_fee_cents INT NULL,
  refund_net_cents INT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_orders_created DEFAULT (SYSUTCDATETIME()),
  updated_at DATETIME2 NULL,
  cancelled_at DATETIME2 NULL,
  refunded_at DATETIME2 NULL
);

CREATE UNIQUE INDEX UX_orders_checkout_idem ON dbo.orders(checkout_idempotency_key) WHERE checkout_idempotency_key IS NOT NULL;

CREATE TABLE dbo.order_lines (
  order_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ol_order REFERENCES dbo.orders(id) ON DELETE CASCADE,
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_ol_variant REFERENCES dbo.product_variants(id),
  quantity INT NOT NULL,
  unit_price_cents INT NOT NULL,
  CONSTRAINT PK_order_lines PRIMARY KEY (order_id, variant_id)
);

CREATE TABLE dbo.payments (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_payments PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_payments_order REFERENCES dbo.orders(id),
  status NVARCHAR(40) NOT NULL,
  idempotency_key NVARCHAR(120) NOT NULL,
  payment_reference NVARCHAR(200) NULL,
  browser_return_at DATETIME2 NULL,
  browser_return_status NVARCHAR(40) NULL,
  webhook_processed_at DATETIME2 NULL
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_payments_payment_reference' AND object_id = OBJECT_ID(N'dbo.payments')
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_payments_payment_reference
    ON dbo.payments(payment_reference)
    WHERE payment_reference IS NOT NULL;
END;

CREATE TABLE dbo.fulfillment_tasks (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_fulfillment PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL,
  stage NVARCHAR(40) NOT NULL,
  carrier_name NVARCHAR(200) NULL,
  tracking_reference NVARCHAR(200) NULL,
  updated_at DATETIME2 NULL,
  CONSTRAINT FK_fulfillment_order FOREIGN KEY (order_id) REFERENCES dbo.orders(id),
  CONSTRAINT UQ_fulfillment_order UNIQUE (order_id)
);

CREATE TABLE dbo.pickup_codes (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_pickup_codes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pc_order REFERENCES dbo.orders(id),
  box_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_pc_box REFERENCES dbo.deposit_boxes(id),
  code_hash VARBINARY(64) NOT NULL,
  expires_at DATETIME2 NOT NULL,
  used_at DATETIME2 NULL
);

CREATE TABLE dbo.return_cases (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_return_cases PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rc_order REFERENCES dbo.orders(id),
  user_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_rc_user REFERENCES dbo.users(id),
  guest_email NVARCHAR(320) NULL,
  reason NVARCHAR(2000) NOT NULL,
  status NVARCHAR(40) NOT NULL,
  rejection_reason NVARCHAR(1000) NULL,
  image_urls_json NVARCHAR(MAX) NULL,
  refund_subtotal_cents INT NULL,
  refund_handling_fee_cents INT NULL,
  refund_net_cents INT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_rc_created DEFAULT (SYSUTCDATETIME()),
  updated_at DATETIME2 NOT NULL CONSTRAINT DF_rc_updated DEFAULT (SYSUTCDATETIME()),
  received_at DATETIME2 NULL
);

CREATE NONCLUSTERED INDEX IX_return_cases_order ON dbo.return_cases(order_id);
CREATE NONCLUSTERED INDEX IX_return_cases_status ON dbo.return_cases(status);

CREATE TABLE dbo.return_case_lines (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_return_case_lines PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  return_case_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rcl_case REFERENCES dbo.return_cases(id) ON DELETE CASCADE,
  product_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rcl_product REFERENCES dbo.products(id),
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rcl_variant REFERENCES dbo.product_variants(id),
  quantity INT NOT NULL CONSTRAINT CK_rcl_qty CHECK (quantity > 0)
);

CREATE NONCLUSTERED INDEX IX_return_case_lines_case ON dbo.return_case_lines(return_case_id);

CREATE TABLE dbo.inventory_reservations (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_inv_res PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL,
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_inv_res_variant REFERENCES dbo.product_variants(id),
  warehouse_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_inv_res_warehouse REFERENCES dbo.warehouses(id),
  quantity INT NOT NULL CONSTRAINT DF_inv_res_line_qty DEFAULT (0)
);

CREATE UNIQUE NONCLUSTERED INDEX UX_inventory_reservations_order_variant_wh
  ON dbo.inventory_reservations(order_id, variant_id, warehouse_id);

/* ---- Misc ---- */
CREATE TABLE dbo.notification_outbox (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_notif PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  user_id UNIQUEIDENTIFIER NULL,
  email NVARCHAR(320) NULL,
  channel NVARCHAR(20) NOT NULL,
  template_key NVARCHAR(120) NOT NULL,
  payload NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_notif_created DEFAULT (SYSUTCDATETIME()),
  sent_at DATETIME2 NULL
);

/* In-app feed — worker copies from notification_outbox when channel is in_app or both (see notificationWorker.ts). */
CREATE TABLE dbo.user_notifications (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_user_notifications PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  source_outbox_id UNIQUEIDENTIFIER NULL,
  user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_user_notifications_user REFERENCES dbo.users(id) ON DELETE CASCADE,
  template_key NVARCHAR(80) NOT NULL,
  title NVARCHAR(200) NOT NULL,
  body NVARCHAR(1000) NULL,
  payload NVARCHAR(MAX) NULL,
  read_at DATETIME2 NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_user_notif_created DEFAULT (SYSUTCDATETIME())
);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UX_user_notifications_source_outbox' AND object_id = OBJECT_ID(N'dbo.user_notifications')
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_user_notifications_source_outbox
    ON dbo.user_notifications(source_outbox_id)
    WHERE source_outbox_id IS NOT NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_user_notifications_user_created' AND object_id = OBJECT_ID(N'dbo.user_notifications')
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_user_notifications_user_created
    ON dbo.user_notifications(user_id, created_at DESC);
END;

CREATE TABLE dbo.payment_webhook_events (
  event_id NVARCHAR(200) NOT NULL CONSTRAINT PK_webhook_ev PRIMARY KEY,
  payload NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_webhook_created DEFAULT (SYSUTCDATETIME())
);

CREATE TABLE dbo.payment_return_events (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_pay_ret PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  dedupe_key NVARCHAR(200) NOT NULL CONSTRAINT UQ_pay_ret_dedupe UNIQUE,
  order_id UNIQUEIDENTIFIER NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_pay_ret_created DEFAULT (SYSUTCDATETIME())
);

/* Optional: Node migrate.ts bookkeeping */
CREATE TABLE dbo.schema_migrations (
  version NVARCHAR(64) NOT NULL CONSTRAINT PK_migrations PRIMARY KEY,
  applied_at DATETIME2 NOT NULL CONSTRAINT DF_mig_applied DEFAULT (SYSUTCDATETIME())
);
GO

/* ===================== Seed data (stable GUIDs) ===================== */

DECLARE @wh UNIQUEIDENTIFIER = '10000000-0000-0000-0000-000000000001';
DECLARE @catGro UNIQUEIDENTIFIER = '20000000-0000-0000-0000-000000000001';
DECLARE @catEl UNIQUEIDENTIFIER = '20000000-0000-0000-0000-000000000002';
DECLARE @catHome UNIQUEIDENTIFIER = '20000000-0000-0000-0000-000000000003';
DECLARE @pMilk UNIQUEIDENTIFIER = '30000000-0000-0000-0000-000000000001';
DECLARE @pBread UNIQUEIDENTIFIER = '30000000-0000-0000-0000-000000000002';
DECLARE @pPhone UNIQUEIDENTIFIER = '30000000-0000-0000-0000-000000000003';
DECLARE @vMilk UNIQUEIDENTIFIER = '40000000-0000-0000-0000-000000000001';
DECLARE @vBread UNIQUEIDENTIFIER = '40000000-0000-0000-0000-000000000002';
DECLARE @vPhone32 UNIQUEIDENTIFIER = '40000000-0000-0000-0000-000000000003';
DECLARE @vPhone64 UNIQUEIDENTIFIER = '40000000-0000-0000-0000-000000000004';
DECLARE @userDemo UNIQUEIDENTIFIER = '50000000-0000-0000-0000-000000000001';
DECLARE @addr1 UNIQUEIDENTIFIER = '51000000-0000-0000-0000-000000000001';
DECLARE @locWind UNIQUEIDENTIFIER = '60000000-0000-0000-0000-000000000001';
DECLARE @locKat UNIQUEIDENTIFIER = '60000000-0000-0000-0000-000000000002';
DECLARE @boxW1 UNIQUEIDENTIFIER = '61000000-0000-0000-0000-000000000001';
DECLARE @boxK1 UNIQUEIDENTIFIER = '61000000-0000-0000-0000-000000000002';

INSERT INTO dbo.warehouses (id, code, name) VALUES (@wh, N'MAIN', N'Main warehouse');

INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active) VALUES
  (@catGro, N'groceries', N'Groceries', NULL, 10, 1),
  (@catEl, N'electronics', N'Electronics', NULL, 20, 1),
  (@catHome, N'home', N'Home & kitchen', NULL, 30, 1);

INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name) VALUES
  (@pMilk, @catGro, N'full-cream-milk', N'Spar full cream milk 1L', N'Fresh dairy, 1 litre — from Spar.', 1, N'spar', N'Spar'),
  (@pBread, @catGro, N'brown-bread', N'Spar brown bread loaf', N'Baked daily — from Spar.', 1, N'spar', N'Spar'),
  (@pPhone, @catEl, N'budget-smartphone', N'Budget smartphone', N'Dual SIM, essentials only.', 1, NULL, NULL);

INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold) VALUES
  (@vMilk, @pMilk, N'MILK-1L-FC', N'1 Litre', 2899, N'NAD', 5),
  (@vBread, @pBread, N'BRD-BRN-700', N'700 g', 1999, N'NAD', 10),
  (@vPhone32, @pPhone, N'PHN-BUD-32', N'32 GB', 329900, N'NAD', 2),
  (@vPhone64, @pPhone, N'PHN-BUD-64', N'64 GB', 359900, N'NAD', 2);

INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
  (@pMilk, N'https://images.unsplash.com/photo-1563636619-e9143d4c3b2c?auto=format&fit=crop&w=800&q=80', 0),
  (@pBread, N'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80', 0),
  (@pPhone, N'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80', 0);

INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity) VALUES
  (@vMilk, @wh, 120),
  (@vBread, @wh, 80),
  (@vPhone32, @wh, 15),
  (@vPhone64, @wh, 8);

/* bcrypt hash for password: PayToday123! */
INSERT INTO dbo.users (id, email, password_hash, full_name, role, notification_channel)
VALUES (
  @userDemo,
  N'demo@paytoday.local',
  N'$2b$10$yHL1enO0hQsVLFZx/1EPsO4D5z4if5.DDx2YR/TKCw5XvmGn4un62',
  N'Demo Shopper',
  N'customer',
  N'email'
);

/* App admin: existing row → role admin; otherwise seed row (same bcrypt as demo: PayToday123!) — change password after first login. */
IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(LTRIM(RTRIM(N'louis.viljoen@crvw.com.na'))))
BEGIN
  INSERT INTO dbo.users (id, email, password_hash, full_name, role, notification_channel)
  VALUES (
    '55000000-0000-0000-0000-000000000001',
    N'louis.viljoen@crvw.com.na',
    N'$2b$10$yHL1enO0hQsVLFZx/1EPsO4D5z4if5.DDx2YR/TKCw5XvmGn4un62',
    N'Louis Viljoen',
    N'admin',
    N'email'
  );
END
ELSE
BEGIN
  UPDATE dbo.users
  SET role = N'admin', updated_at = SYSUTCDATETIME()
  WHERE LOWER(LTRIM(RTRIM(email))) = LOWER(LTRIM(RTRIM(N'louis.viljoen@crvw.com.na')));
END;

INSERT INTO dbo.addresses (id, user_id, label, line1, line2, city, region, postal_code, country, is_default)
VALUES (
  @addr1,
  @userDemo,
  N'Home',
  N'123 Independence Ave',
  NULL,
  N'Windhoek',
  N'Khomas',
  N'00000',
  N'Namibia',
  1
);

INSERT INTO dbo.deposit_locations (id, name, address_summary) VALUES
  (@locWind, N'Windhoek CBD locker', N'Independence Ave — near main mall'),
  (@locKat, N'Katutura collection point', N'Freedom Plaza area');

INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load) VALUES
  (@boxW1, @locWind, N'W-BOX-01', 50, 0),
  (@boxK1, @locKat, N'K-BOX-01', 40, 0);

INSERT INTO dbo.store_promotions (slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at)
VALUES
  (N'welcome', N'Deals near you', N'Pay with PayToday in one tap.',
   N'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80',
   N'/shop', 0, 1, NULL, NULL),
  (N'pickup', N'Store pickup', N'Order online, collect at a pickup point.',
   N'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1400&q=80',
   N'/shop', 1, 1, NULL, NULL),
  (N'secure', N'Secure payments', N'Your wallet, your way.',
   N'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1400&q=80',
   N'/wallet', 2, 1, NULL, NULL);

/* ---- Expanded demo catalogue + deposit points (same as migration 016_expand_demo_catalog.sql) ---- */
IF COL_LENGTH('dbo.categories', 'parent_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'soft-drinks')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000001',
      N'soft-drinks',
      N'Soft drinks',
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      20,
      1
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'snacks-pantry')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000002',
      N'snacks-pantry',
      N'Snacks & pantry',
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      30,
      1
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'fresh-produce')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000003',
      N'fresh-produce',
      N'Fresh produce',
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      10,
      1
    );
END;
GO

IF COL_LENGTH('dbo.categories', 'parent_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'electronics')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'accessories')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000004',
      N'accessories',
      N'Phone & laptop accessories',
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      10,
      1
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'audio')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000005',
      N'audio',
      N'Audio',
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      20,
      1
    );
END;
GO

IF COL_LENGTH('dbo.categories', 'parent_id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'home')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'cleaning')
    INSERT INTO dbo.categories (id, slug, name, parent_id, sort_order, is_active)
    VALUES (
      '7E100001-0000-4000-8000-000000000006',
      N'cleaning',
      N'Cleaning & laundry',
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      10,
      1
    );
END;
GO

DECLARE @p1 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000001';
DECLARE @v1 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000001';
DECLARE @p2 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000002';
DECLARE @v2 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000002';
DECLARE @p3 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000003';
DECLARE @v3 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000003';
DECLARE @p4 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000004';
DECLARE @v4 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000004';
DECLARE @p5 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000005';
DECLARE @v5 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000005';
DECLARE @p6 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000006';
DECLARE @v6 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000006';
DECLARE @p7 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000007';
DECLARE @v7a UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000007';
DECLARE @v7b UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000008';
DECLARE @p8 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000008';
DECLARE @v8 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000009';
DECLARE @p9 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000009';
DECLARE @v9 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000010';
DECLARE @p10 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000010';
DECLARE @v10 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000011';
DECLARE @p11 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000011';
DECLARE @v11 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000012';
DECLARE @p12 UNIQUEIDENTIFIER = '7F200001-0000-4000-8000-000000000012';
DECLARE @v12 UNIQUEIDENTIFIER = '7F300001-0000-4000-8000-000000000013';

IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'groceries')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'sparkling-water-500ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p1,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'sparkling-water-500ml',
      N'Sparkling mineral water 500 ml',
      N'Chilled sparkling water — great with meals.',
      1,
      N'aqua-vita',
      N'Aqua Vita'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v1, @p1, N'WATER-SPK-500', N'500 ml', 1899, N'NAD', 8, 2299, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p1, N'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v1, CAST(id AS UNIQUEIDENTIFIER), 200 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'cola-2l-bottle')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p2,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'cola-2l-bottle',
      N'Cola soft drink 2 L',
      N'Classic cola — share size.',
      1,
      N'fizz-co',
      N'Fizz Co'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v2, @p2, N'SOFT-COLA-2L', N'2 Litre', 4599, N'NAD', 6, 5299, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p2, N'https://images.unsplash.com/photo-1622483767028-3f66f32c67b6?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v2, CAST(id AS UNIQUEIDENTIFIER), 140 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'long-life-milk-1l')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p3,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'long-life-milk-1l',
      N'Long life milk 1 L',
      N'UHT dairy — pantry staple.',
      1,
      N'spar',
      N'Spar'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v3, @p3, N'MILK-UHT-1L', N'1 Litre', 2699, N'NAD', 10, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p3, N'https://images.unsplash.com/photo-1563636619-e9143d4c3b2c?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v3, CAST(id AS UNIQUEIDENTIFIER), 160 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'white-rice-2kg')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p4,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'white-rice-2kg',
      N'White rice 2 kg',
      N'Parboiled rice — family pack.',
      1,
      N'grain-house',
      N'Grain House'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v4, @p4, N'RICE-WHT-2KG', N'2 kg', 8999, N'NAD', 5, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p4, N'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v4, CAST(id AS UNIQUEIDENTIFIER), 90 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'potato-chips-150g')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p5,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'potato-chips-150g',
      N'Potato chips salted 150 g',
      N'Crunchy snack — party size.',
      1,
      N'crisp-co',
      N'Crisp Co'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v5, @p5, N'SNACK-CHIPS-150', N'150 g', 2499, N'NAD', 12, 2999, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p5, N'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v5, CAST(id AS UNIQUEIDENTIFIER), 110 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'apples-1-5kg-bag')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p6,
      (SELECT id FROM dbo.categories WHERE slug = N'groceries'),
      N'apples-1-5kg-bag',
      N'Apples 1.5 kg bag',
      N'Crisp red apples — sourced locally when available.',
      1,
      N'fresh-pick',
      N'Fresh Pick'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v6, @p6, N'FRUIT-APL-15', N'1.5 kg', 4299, N'NAD', 6, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p6, N'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v6, CAST(id AS UNIQUEIDENTIFIER), 45 FROM dbo.warehouses WHERE code = N'MAIN';
  END;
END;

IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'electronics')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'usb-c-cable-2m')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p7,
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      N'usb-c-cable-2m',
      N'USB-C fast charge cable',
      N'Braided cable for phones and laptops — 60 W rated.',
      1,
      N'link-tech',
      N'Link Tech'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES
      (@v7a, @p7, N'CABLE-USBC-1M', N'1 m', 19900, N'NAD', 15, 24900, N'track'),
      (@v7b, @p7, N'CABLE-USBC-2M', N'2 m', 25900, N'NAD', 15, 31900, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p7, N'https://images.unsplash.com/photo-1583863788444-cbe32897a469?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v7a, CAST(id AS UNIQUEIDENTIFIER), 120 FROM dbo.warehouses WHERE code = N'MAIN';
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v7b, CAST(id AS UNIQUEIDENTIFIER), 95 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'bluetooth-speaker-mini')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p8,
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      N'bluetooth-speaker-mini',
      N'Mini Bluetooth speaker',
      N'Portable 360° sound — 10 h battery.',
      1,
      N'sound-wave',
      N'Sound Wave'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v8, @p8, N'AUDIO-BT-MINI', N'Black', 89900, N'NAD', 4, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p8, N'https://images.unsplash.com/photo-1608043152269-423dbba4e7e2?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v8, CAST(id AS UNIQUEIDENTIFIER), 35 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'aa-batteries-8-pack')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p9,
      (SELECT id FROM dbo.categories WHERE slug = N'electronics'),
      N'aa-batteries-8-pack',
      N'AA alkaline batteries 8 pack',
      N'Long-lasting power for remotes and toys.',
      1,
      N'volt-plus',
      N'Volt Plus'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v9, @p9, N'BATT-AA-8', N'8 pack', 12900, N'NAD', 8, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p9, N'https://images.unsplash.com/photo-1619641805757-1b923f6b4c42?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v9, CAST(id AS UNIQUEIDENTIFIER), 180 FROM dbo.warehouses WHERE code = N'MAIN';
  END;
END;

IF EXISTS (SELECT 1 FROM dbo.categories WHERE slug = N'home')
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'dishwashing-liquid-750ml')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p10,
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      N'dishwashing-liquid-750ml',
      N'Dishwashing liquid 750 ml',
      N'Cuts grease — citrus scent.',
      1,
      N'shine-home',
      N'Shine Home'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v10, @p10, N'CLEAN-DISH-750', N'750 ml', 4599, N'NAD', 10, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p10, N'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v10, CAST(id AS UNIQUEIDENTIFIER), 75 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'electric-kettle-1-7l')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p11,
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      N'electric-kettle-1-7l',
      N'Electric kettle 1.7 L',
      N'Stainless steel — auto shut-off.',
      1,
      N'kitchen-pro',
      N'Kitchen Pro'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, compare_at_price_cents, inventory_policy)
    VALUES (@v11, @p11, N'KETTLE-17L-SS', N'1.7 L stainless', 59900, N'NAD', 3, 69900, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p11, N'https://images.unsplash.com/photo-1574269909862-7e1d70bb8077?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v11, CAST(id AS UNIQUEIDENTIFIER), 28 FROM dbo.warehouses WHERE code = N'MAIN';
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.products WHERE slug = N'cotton-bath-towel')
  BEGIN
    INSERT INTO dbo.products (id, category_id, slug, name, description, is_active, brand_slug, brand_name)
    VALUES (
      @p12,
      (SELECT id FROM dbo.categories WHERE slug = N'home'),
      N'cotton-bath-towel',
      N'Premium cotton bath towel',
      N'Plush 600 GSM — quick dry.',
      1,
      N'linen-co',
      N'Linen Co'
    );
    INSERT INTO dbo.product_variants (id, product_id, sku, name, price_cents, currency, low_stock_threshold, inventory_policy)
    VALUES (@v12, @p12, N'TOWEL-BATH-WHT', N'White', 34900, N'NAD', 5, N'track');
    INSERT INTO dbo.product_images (product_id, url, sort_order) VALUES
      (@p12, N'https://images.unsplash.com/photo-1584345604476-8ec5e82e1aa5?auto=format&fit=crop&w=800&q=80', 0);
    INSERT INTO dbo.inventory_quantity (variant_id, warehouse_id, quantity)
    SELECT @v12, CAST(id AS UNIQUEIDENTIFIER), 40 FROM dbo.warehouses WHERE code = N'MAIN';
  END;
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_locations WHERE id = '7D100001-0000-4000-8000-000000000001')
  INSERT INTO dbo.deposit_locations (id, name, address_summary)
  VALUES (
    '7D100001-0000-4000-8000-000000000001',
    N'Swakopmund seafront locker',
    N'Sam Nujoma Ave — near jetty parking'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_locations WHERE id = '7D100001-0000-4000-8000-000000000002')
  INSERT INTO dbo.deposit_locations (id, name, address_summary)
  VALUES (
    '7D100001-0000-4000-8000-000000000002',
    N'Ongwediva PayToday hub',
    N'Evululuko complex — main entrance'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_locations WHERE id = '7D100001-0000-4000-8000-000000000003')
  INSERT INTO dbo.deposit_locations (id, name, address_summary)
  VALUES (
    '7D100001-0000-4000-8000-000000000003',
    N'Walvis Bay harbour kiosk',
    N'Port road — pickup lane B'
  );

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'SWK-BOX-01')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000001', '7D100001-0000-4000-8000-000000000001', N'SWK-BOX-01', 48, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'SWK-BOX-02')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000002', '7D100001-0000-4000-8000-000000000001', N'SWK-BOX-02', 48, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'ONG-BOX-01')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000003', '7D100001-0000-4000-8000-000000000002', N'ONG-BOX-01', 36, 0);

IF NOT EXISTS (SELECT 1 FROM dbo.deposit_boxes WHERE code = N'WVB-BOX-01')
  INSERT INTO dbo.deposit_boxes (id, location_id, code, capacity, current_load)
  VALUES ('7D200001-0000-4000-8000-000000000004', '7D100001-0000-4000-8000-000000000003', N'WVB-BOX-01', 30, 0);
GO

IF OBJECT_ID(N'dbo.store_promotions', N'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.store_promotions WHERE slug = N'weekend-snacks')
    INSERT INTO dbo.store_promotions (slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at)
    VALUES (
      N'weekend-snacks',
      N'Snack smarter',
      N'Chips, drinks & treats for movie night.',
      N'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=1200&q=80',
      N'/shop',
      15,
      1,
      NULL,
      NULL
    );

  IF NOT EXISTS (SELECT 1 FROM dbo.store_promotions WHERE slug = N'home-essentials')
    INSERT INTO dbo.store_promotions (slug, title, subtitle, image_url, link_path, sort_order, is_active, starts_at, ends_at)
    VALUES (
      N'home-essentials',
      N'Home essentials',
      N'Cleaning, kitchen & comfort picks.',
      N'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
      N'/shop',
      25,
      1,
      NULL,
      NULL
    );
END;
GO

/* Payments hub drill-down (GET /api/hub/payment-category-items?category=...) — richer demo data */
INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, payment_method, sort_order, is_active)
VALUES
  /* businesses */
  (N'businesses', N'business', N'Okahandja Traders', NULL, N'Wallet · Card · EFT ref', 10, 1),
  (N'businesses', N'business', N'Windhoek Fresh Market', NULL, N'Wallet · Tap to pay · QR', 20, 1),
  (N'businesses', N'business', N'Namibia Auto Parts', NULL, N'Wallet · Card · invoice ref', 30, 1),
  (N'businesses', N'business', N'Coastal Coffee Co.', NULL, N'Wallet · loyalty stamps', 40, 1),
  (N'businesses', N'business', N'Desert Bloom Pharmacy', NULL, N'Wallet · medical aid · card', 50, 1),
  (N'businesses', N'business', N'Katutura Hardware & Paint', NULL, N'Wallet · bulk quote ref', 60, 1),
  (N'businesses', N'business', N'Walvis Bay Marine Supplies', NULL, N'Wallet · PO number', 70, 1),
  (N'businesses', N'business', N'Oshakati Electronics Hub', NULL, N'Wallet · lay-by ref', 80, 1),
  /* contacts */
  (N'contacts', N'contact', N'Anna Nghipondoka', N'AN', N'Wallet only · P2P', 10, 1),
  (N'contacts', N'contact', N'Johan van Wyk', N'JW', N'Wallet · request money', 20, 1),
  (N'contacts', N'contact', N'Lisa #Shapumba', N'LS', N'Wallet only · P2P', 30, 1),
  (N'contacts', N'contact', N'Tomas Hamutenya', N'TH', N'Wallet · split bill', 40, 1),
  (N'contacts', N'contact', N'Helvi Ndapandula', N'HN', N'Wallet only', 50, 1),
  (N'contacts', N'contact', N'Petro #Kahimise', N'PK', N'Wallet · request link', 60, 1),
  (N'contacts', N'contact', N'Chrizelle du Preez', N'CD', N'Wallet · P2P', 70, 1),
  /* airtime */
  (N'airtime', N'business', N'MTC Prepaid', NULL, N'Wallet · MTC app · *682#', 10, 1),
  (N'airtime', N'business', N'TN Mobile', NULL, N'Wallet · TN voucher · USSD', 20, 1),
  (N'airtime', N'business', N'RechargeNow Namibia', NULL, N'Wallet · MSISDN lookup', 30, 1),
  (N'airtime', N'business', N'Corporate airtime pool', NULL, N'Wallet · company account ref', 40, 1),
  (N'airtime', N'business', N'Tourist SIM top-up', NULL, N'Card · passport ref on file', 50, 1),
  /* electricity */
  (N'electricity', N'business', N'Nampower Prepaid', NULL, N'Meter · wallet · card', 10, 1),
  (N'electricity', N'business', N'City of Windhoek prepaid', NULL, N'Meter · wallet · USSD', 20, 1),
  (N'electricity', N'business', N'Erongo RED prepaid', NULL, N'Meter · wallet', 30, 1),
  (N'electricity', N'business', N'Omaheke municipal prepaid', NULL, N'Meter · wallet · branch code', 40, 1),
  /* bills */
  (N'bills', N'business', N'City of Windhoek — rates & refuse', NULL, N'Account · wallet · ref', 10, 1),
  (N'bills', N'business', N'MultiChoice Namibia (DStv)', NULL, N'Smartcard · wallet · card', 20, 1),
  (N'bills', N'business', N'NamWater — municipal bulk', NULL, N'Account · wallet', 30, 1),
  (N'bills', N'business', N'School fees — Khomas cluster', NULL, N'Learner ID · wallet', 40, 1),
  (N'bills', N'business', N'Namibia Medical Aid (demo)', NULL, N'Member no. · wallet · card', 50, 1),
  /* food */
  (N'food', N'business', N'Joe''s Beerhouse — Windhoek', NULL, N'Wallet · table QR', 10, 1),
  (N'food', N'business', N'The Stellenbosch — Klein Windhoek', NULL, N'Wallet · booking ref', 20, 1),
  (N'food', N'business', N'Local Eats Collective', NULL, N'Wallet · rider tip', 30, 1),
  (N'food', N'business', N'Swakopmund Jetty Restaurant', NULL, N'Wallet · split bill', 40, 1),
  (N'food', N'business', N'Oshakati open-market vendors', NULL, N'Wallet · stall code', 50, 1),
  /* fuel */
  (N'fuel', N'business', N'Engen — Independence Ave', NULL, N'Rewards · wallet · card', 10, 1),
  (N'fuel', N'business', N'Puma Energy — B1 stop', NULL, N'Fleet card · wallet', 20, 1),
  (N'fuel', N'business', N'Shell V-Power — Hosea Kutako', NULL, N'Card · wallet', 30, 1),
  (N'fuel', N'business', N'TotalEnergies — coastal route', NULL, N'Loyalty · wallet', 40, 1),
  (N'fuel', N'business', N'Truck diesel — Walvis corridor', NULL, N'Fleet ref · wallet', 50, 1),
  /* parking */
  (N'parking', N'business', N'Grove Mall — underground P1', NULL, N'Plate · wallet · QR', 10, 1),
  (N'parking', N'business', N'Hosea Kutako short stay', NULL, N'Ticket · wallet', 20, 1),
  (N'parking', N'business', N'CBD Zone A — street meters', NULL, N'Bay code · wallet', 30, 1),
  (N'parking', N'business', N'Swakopmund plaza parking', NULL, N'SMS code · wallet', 40, 1),
  /* vouchers */
  (N'vouchers', N'business', N'National Bookstore', NULL, N'Voucher SKU · wallet · card', 10, 1),
  (N'vouchers', N'business', N'Pick n Pay gift cards', NULL, N'Barcode · wallet', 20, 1),
  (N'vouchers', N'business', N'Woermann Brock — grocery voucher', NULL, N'Store ref · wallet', 30, 1),
  (N'vouchers', N'business', N'Cinema combo — Grove', NULL, N'Showtime · wallet', 40, 1),
  /* stay */
  (N'stay', N'business', N'Coastal Guesthouse — Swakop', NULL, N'Booking ref · wallet · card', 10, 1),
  (N'stay', N'business', N'Hilton Windhoek (demo)', NULL, N'Confirmation no. · wallet', 20, 1),
  (N'stay', N'business', N'Etosha lodge partners', NULL, N'Park permit ref · wallet', 30, 1),
  (N'stay', N'business', N'Farm stay — Khomas Hochland', NULL, N'Host code · wallet', 40, 1),
  (N'stay', N'business', N'Airbnb-style host payout', NULL, N'Listing ID · wallet', 50, 1),
  /* services */
  (N'services', N'business', N'PayToday Service Desk', NULL, N'Wallet · case ref', 10, 1),
  (N'services', N'business', N'NamPost parcel COD', NULL, N'Waybill · wallet', 20, 1),
  (N'services', N'business', N'Courier Namibia — same day', NULL, N'Pickup code · wallet', 30, 1),
  (N'services', N'business', N'IT support — Windhoek SME', NULL, N'Ticket no. · wallet', 40, 1),
  (N'services', N'business', N'Plumbing 24 — emergency', NULL, N'Call-out ref · wallet', 50, 1),
  (N'services', N'business', N'Laundry & dry-clean — CBD', NULL, N'Bag tag · wallet', 60, 1);

/* Hub grids — same slugs/link paths as former static data */
INSERT INTO dbo.hub_navigation_tiles (hub_kind, slug, label, icon_key, list_style, link_path, sort_order, is_active)
VALUES
  (N'payments', N'businesses', N'Businesses', N'business', N'business', N'payments/businesses', 10, 1),
  (N'payments', N'contacts', N'Contacts', N'contacts', N'contacts', N'payments/contacts', 20, 1),
  (N'payments', N'airtime', N'Airtime', N'airtime', N'business', N'payments/airtime', 30, 1),
  (N'payments', N'electricity', N'Electricity', N'electricity', N'business', N'payments/electricity', 40, 1),
  (N'payments', N'bills', N'Bills', N'bills', N'business', N'payments/bills', 50, 1),
  (N'payments', N'food', N'Food', N'food', N'business', N'payments/food', 60, 1),
  (N'payments', N'fuel', N'Fuel', N'fuel', N'business', N'payments/fuel', 70, 1),
  (N'payments', N'parking', N'Parking', N'parking', N'business', N'payments/parking', 80, 1),
  (N'payments', N'vouchers', N'Vouchers', N'vouchers', N'business', N'payments/vouchers', 90, 1),
  (N'payments', N'stay', N'Stay', N'stay', N'business', N'payments/stay', 100, 1),
  (N'payments', N'services', N'Services', N'services', N'business', N'payments/services', 110, 1),
  (N'services', N'airtime', N'Airtime', N'airtime', NULL, N'services/airtime', 10, 1),
  (N'services', N'water', N'Water', N'water', NULL, N'services/water', 20, 1),
  (N'services', N'electricity', N'Electricity', N'electricity', NULL, N'services/electricity', 30, 1),
  (N'services', N'parking', N'Parking', N'parking', NULL, N'services/parking', 40, 1),
  (N'services', N'vouchers', N'Vouchers', N'vouchers', NULL, N'services/vouchers', 50, 1),
  (N'services', N'insurance', N'Insurance', N'insurance', NULL, N'services/insurance', 60, 1),
  (N'services', N'ussd', N'USSD', N'ussd', NULL, N'services/ussd', 70, 1),
  (N'services', N'store', N'Store', N'storefront', NULL, N'shop', 80, 1);

/*
  Sample notification_outbox rows — template_key values used by Hub payment demo + notify worker.
  Worker runs every ~30s: drains rows with sent_at IS NULL; sets NOTIFY_SERVICE_API_KEY for real email.
*/
INSERT INTO dbo.notification_outbox (user_id, email, channel, template_key, payload)
VALUES (
  @userDemo,
  N'demo@paytoday.local',
  N'both',
  N'hub_demo_pending_payment',
  N'{"correlationId":"70000000-0000-0000-0000-000000000001","reference":"seed-hub-pending","variant":"services","categorySlug":"water","itemId":null,"serviceSlug":"water","payeeName":"NamWater (seed demo)","amountCents":150000,"currency":"NAD","payMethod":"wallet","stage":"pending"}'
),
(
  @userDemo,
  N'demo@paytoday.local',
  N'both',
  N'hub_demo_payment_completed',
  N'{"correlationId":"70000000-0000-0000-0000-000000000002","reference":"seed-hub-done","variant":"services","categorySlug":"water","itemId":null,"serviceSlug":"water","payeeName":"NamWater (seed demo)","amountCents":150000,"currency":"NAD","payMethod":"wallet","stage":"completed"}'
);

PRINT N'paytoday schema + seed complete.';
PRINT N'Demo user: demo@paytoday.local / PayToday123!';
PRINT N'Seeded dbo.notification_outbox: hub_demo_pending_payment, hub_demo_payment_completed (worker + NOTIFY_SERVICE_API_KEY).';
GO

