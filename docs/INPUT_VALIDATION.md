# Input validation (API)

Server-side rules are implemented in [`backend/src/lib/inputValidators.ts`](../backend/src/lib/inputValidators.ts). The API remains the source of truth; the frontend may mirror helpers in [`frontend/src/lib/inputValidators.ts`](../frontend/src/lib/inputValidators.ts).

## High-priority mutating routes (inventory)

| Area | Route(s) | Notes |
|------|-----------|--------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `PATCH /api/auth/me` | Email via `parseEmailString`; profile `fullName` via `parseOptionalDisplayName` |
| Checkout | `POST /api/checkout` | Guest `guestEmail` required + valid when unauthenticated; names/phone trimmed and bounded |
| Addresses | `POST/PATCH /api/addresses` | `line1`, `city`, etc. max lengths; no control characters |
| Admin products | `POST /api/admin/products`, `POST /api/admin/products/import-csv` | Slug, SKU, HTTPS image URL, currency, compare-at vs sale price |
| Other | Cart, orders, returns, deposit, notifications, … | Incrementally align with `inputValidators` as fields are touched |

## Field rules (summary)

| Field | Rule |
|-------|------|
| Email | [`isValidEmailFormat`](../backend/src/lib/emailValidation.ts); trim; lower-case for storage; max 320 |
| Product slug | Lowercase `[a-z0-9-]+`, 1–160 chars, no leading/trailing `-`, no `--` |
| SKU | Printable ASCII `[A-Za-z0-9][A-Za-z0-9._\-/]{0,79}` |
| Catalog image URL | `https://…` **or** same-origin upload path `/api/uploads/products/{uuid}.{ext}`; max length; reject `data:`, `file:`, `javascript:`; reject bare `http://` for external URLs |
| Currency | Exactly 3 × `A-Z` |
| Money (`price_cents`) | Integer ≥ 0, upper bound guard |
| Display name | Trim; max 200; reject ASCII control chars (except tab/newline stripped to space) |
| Description | Max 8000; reject NUL |

## File uploads

Multipart uploads are only accepted on dedicated routes (e.g. `POST /api/admin/products/upload-image`) with `multer` image MIME filter. JSON `imageUrl` fields must pass HTTPS URL validation (not a file upload).
