/*
  PayToday — full schema + sample data for SSMS / sqlcmd
  Run as a user that can CREATE DATABASE (or comment out the CREATE DATABASE block and use an existing DB).

  Includes dbo.notification_outbox, dbo.user_notifications, and two seed outbox rows
  (hub_demo_pending_payment, hub_demo_payment_completed) for the notify worker + in-app feed.
  Configure NOTIFY_SERVICE_API_KEY (env or dbo.integration_settings) for outbound email.

  Demo login (after seed):  demo@paytoday.local  /  PayToday123!

  Prefer the bundled all-in-one: backend/scripts/paytoday-database-all-in-one.sql (run: node backend/scripts/build-all-in-one-sql.mjs)
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
IF OBJECT_ID(N'dbo.product_variants', N'U') IS NOT NULL DROP TABLE dbo.product_variants;
IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL DROP TABLE dbo.products;
IF OBJECT_ID(N'dbo.categories', N'U') IS NOT NULL DROP TABLE dbo.categories;
IF OBJECT_ID(N'dbo.hub_navigation_tiles', N'U') IS NOT NULL DROP TABLE dbo.hub_navigation_tiles;
IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL DROP TABLE dbo.hub_payment_category_items;
IF OBJECT_ID(N'dbo.notification_outbox', N'U') IS NOT NULL DROP TABLE dbo.notification_outbox;
IF OBJECT_ID(N'dbo.user_notifications', N'U') IS NOT NULL DROP TABLE dbo.user_notifications;
IF OBJECT_ID(N'dbo.user_refresh_tokens', N'U') IS NOT NULL DROP TABLE dbo.user_refresh_tokens;
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
  name NVARCHAR(200) NOT NULL
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
  low_stock_threshold INT NULL
);

CREATE TABLE dbo.product_images (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_product_images PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  product_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_images_product REFERENCES dbo.products(id) ON DELETE CASCADE,
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
  idempotency_key NVARCHAR(120) NOT NULL
);

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

CREATE TABLE dbo.return_requests (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_returns PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rr_order REFERENCES dbo.orders(id),
  user_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_rr_user REFERENCES dbo.users(id),
  guest_email NVARCHAR(320) NULL,
  reason NVARCHAR(2000) NOT NULL,
  status NVARCHAR(40) NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_rr_created DEFAULT (SYSUTCDATETIME()),
  resolved_at DATETIME2 NULL
);

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

INSERT INTO dbo.categories (id, slug, name) VALUES
  (@catGro, N'groceries', N'Groceries'),
  (@catEl, N'electronics', N'Electronics'),
  (@catHome, N'home', N'Home & kitchen');

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

/* Payments hub drill-down (GET /api/hub/payment-category-items?category=...) */
INSERT INTO dbo.hub_payment_category_items (category_slug, item_kind, display_name, initials, sort_order, is_active)
VALUES
  /* businesses */
  (N'businesses', N'business', N'Okahandja Traders', NULL, 10, 1),
  (N'businesses', N'business', N'Windhoek Fresh Market', NULL, 20, 1),
  (N'businesses', N'business', N'Namibia Auto Parts', NULL, 30, 1),
  /* contacts */
  (N'contacts', N'contact', N'Anna Nghipondoka', N'AN', 10, 1),
  (N'contacts', N'contact', N'Johan van Wyk', N'JW', 20, 1),
  (N'contacts', N'contact', N'Lisa #Shapumba', N'LS', 30, 1),
  /* sample billers per category */
  (N'airtime', N'business', N'MTC Prepaid', NULL, 10, 1),
  (N'airtime', N'business', N'TN Mobile', NULL, 20, 1),
  (N'electricity', N'business', N'Nampower Prepaid', NULL, 10, 1),
  (N'bills', N'business', N'Municipality — Windhoek', NULL, 10, 1),
  (N'food', N'business', N'Local Eats Collective', NULL, 10, 1),
  (N'fuel', N'business', N'Engen Rewards', NULL, 10, 1),
  (N'parking', N'business', N'CBD Parking Zone A', NULL, 10, 1),
  (N'vouchers', N'business', N'National Bookstore', NULL, 10, 1),
  (N'stay', N'business', N'Coastal Guesthouse', NULL, 10, 1),
  (N'services', N'business', N'PayToday Service Desk', NULL, 10, 1);

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
