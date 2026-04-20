/* Snapshot unit price + currency on cart lines so catalogue price changes do not alter the open cart */

IF COL_LENGTH('dbo.cart_lines', 'unit_price_cents') IS NULL
  ALTER TABLE dbo.cart_lines ADD unit_price_cents INT NULL;
GO

IF COL_LENGTH('dbo.cart_lines', 'line_currency') IS NULL
  ALTER TABLE dbo.cart_lines ADD line_currency CHAR(3) NULL;
GO

UPDATE cl
SET
  unit_price_cents = v.price_cents,
  line_currency = v.currency
FROM dbo.cart_lines cl
INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
WHERE cl.unit_price_cents IS NULL;

UPDATE dbo.cart_lines SET unit_price_cents = 0 WHERE unit_price_cents IS NULL;
UPDATE dbo.cart_lines SET line_currency = N'NAD' WHERE line_currency IS NULL OR LTRIM(RTRIM(line_currency)) = '';

ALTER TABLE dbo.cart_lines ALTER COLUMN unit_price_cents INT NOT NULL;
ALTER TABLE dbo.cart_lines ALTER COLUMN line_currency CHAR(3) NOT NULL;
GO
