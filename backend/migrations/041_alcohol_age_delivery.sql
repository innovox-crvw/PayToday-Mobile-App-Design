/* Alcohol age-gating groundwork: mark products as alcohol; require age verification for delivery. */

/* products.contains_alcohol — also added by migration 053 with same guard; idempotent. */
IF COL_LENGTH(N'dbo.products', N'contains_alcohol') IS NULL
BEGIN
  ALTER TABLE dbo.products ADD contains_alcohol BIT NOT NULL CONSTRAINT DF_products_contains_alcohol_041 DEFAULT (0);
END;
GO

/* Flag on orders that the cart contained alcohol (for post-fulfillment auditing). */
IF COL_LENGTH(N'dbo.orders', N'contains_alcohol') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD contains_alcohol BIT NOT NULL CONSTRAINT DF_orders_contains_alcohol_041 DEFAULT (0);
END;
GO

/* Minimum age required (years) for alcohol delivery — stored for audit; currently always 18. */
IF COL_LENGTH(N'dbo.orders', N'alcohol_age_verified') IS NULL
BEGIN
  ALTER TABLE dbo.orders ADD alcohol_age_verified BIT NOT NULL CONSTRAINT DF_orders_alcohol_age_verified DEFAULT (0);
END;
GO
