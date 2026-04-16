# Bulk inventory CSV (admin / ops)

Staff with roles **`admin`** or **`ops`** can post adjustments through:

`POST /api/fulfillment/inventory/csv`

- **Auth:** session JWT (same as other fulfillment routes).
- **CSRF:** follow the usual SPA flow (`GET /api/csrf` then `X-CSRF-Token` on mutating requests).
- **Body:** JSON `{ "csv": "<file contents as a single string>" }`.

## Format

- UTF-8 text, one row per line; **no quoted fields or embedded commas** in values.
- **With header (recommended):** first line must be exactly:

  `sku,qty_delta,reason`

  - **`sku`** — matches `product_variants.sku`.
  - **`qty_delta`** — signed integer (stock increase or decrease).
  - **`reason`** — required on every data row for audit (stored on `stock_movements.reason`, max 80 characters; longer values are truncated).

- **Without header:** each row is `sku,qty_delta`. A default reason of `csv_import` is used.

If any **parse** error is present on a line, the import does not run. If every row parses but any row fails in the database (unknown SKU, negative stock, etc.), the transaction is **rolled back** and the API returns HTTP 400 with an `errors` array (line numbers refer to the CSV file, counting from line 1).

## Example

```csv
sku,qty_delta,reason
BLUE-TSHIRT-M,24,yearly stock count
BLUE-TSHIRT-L,-2,damaged in warehouse
```

## Persistence

- Adjustments apply to the default warehouse (`warehouses` ordered by `code`, first row).
- `inventory_quantity` is updated (inserted if missing).
- Each row creates a `stock_movements` row with `reference_type = 'csv_import'` and a shared batch `reference_id` (UUID) for the request.

See also [`docs/SCOPE_ACCEPTANCE_TRACEABILITY.md`](SCOPE_ACCEPTANCE_TRACEABILITY.md).
