/**
 * dbo.product_variants — SQL Server column identifiers (snake_case), in table order.
 * Use for admin copy and alignment with API ↔ DB mapping.
 */
export const PRODUCT_VARIANTS_TABLE = 'dbo.product_variants'

export const PRODUCT_VARIANTS_SQL_COLUMN_NAMES = [
  'id',
  'product_id',
  'sku',
  'name',
  'price_cents',
  'currency',
  'low_stock_threshold',
  'compare_at_price_cents',
  'inventory_policy',
  'package_length_mm',
  'package_width_mm',
  'package_height_mm',
  'gross_weight_g',
] as const

export const PRODUCT_VARIANTS_SQL_COLUMN_LIST = PRODUCT_VARIANTS_SQL_COLUMN_NAMES.join(', ')
