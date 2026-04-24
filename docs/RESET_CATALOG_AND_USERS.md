# Reset users and catalogue

Use this when you want an empty **`dbo.users`** and **`dbo.products`** tree while **keeping** **`dbo.businesses`**, **`dbo.categories`**, warehouses, hub data, and **`dbo.schema_migrations`**.

## 1. Run the SQL reset

Execute **[`backend/scripts/reset-users-and-catalog.sql`](../backend/scripts/reset-users-and-catalog.sql)** against your database (SSMS or `sqlcmd`). It runs in a single transaction and prints progress steps.

From a shell (Windows integrated auth; add **`-C`** if ODBC 18 complains about the server certificate):

```powershell
sqlcmd -S "YOURSERVER\INSTANCE" -d paytoday -E -C -b -i backend/scripts/reset-users-and-catalog.sql
```

### Catalogue-only wipe (keep users and businesses)

To delete products and dependent rows (orders, carts, stock movements, etc.) but **not** delete **`dbo.users`**, use **[`backend/scripts/wipe-catalog-keep-users.sql`](../backend/scripts/wipe-catalog-keep-users.sql)** instead.

### Nictus three-merchant demo (20 products)

After a catalogue wipe, **[`backend/scripts/nictus-three-merchants-seed.sql`](../backend/scripts/nictus-three-merchants-seed.sql)** upserts three **`dbo.businesses`** rows (`pay_today_merchant_id` **931001–931003**), three **admin** users (**`nictus.admin.a@paytoday.local`**, **b**, **c**; same bcrypt password as the local demo account **PayToday123!**), **`user_businesses`** primary links, and **20** active Nictus products (7 / 7 / 6 per merchant) with images and inventory.

## 2. Register accounts

Cookies and JWTs from before the reset are invalid. Register new users (store sign-up / admin registration flow as you use locally).

## 3. Grant admin and link merchants

- Promote at least **one** account to **`admin`** (or **`ops`**) so **Admin → Products** is available:

  ```sql
  UPDATE dbo.users SET role = N'admin' WHERE email = N'you@example.com';
  ```

- Link each user to a **`pay_today_merchant_id`** that still exists in **`dbo.businesses`** after the reset (resolve `@userId` with `SELECT id FROM dbo.users WHERE email = N'...'`):

  ```sql
  INSERT INTO dbo.user_businesses (id, user_id, pay_today_merchant_id, role, is_primary)
  VALUES (NEWID(), @userId, 910001, N'member', 1);
  ```

  Repeat for merchants `910002`, `910003` (or whatever IDs your **`businesses`** rows use). Other columns use table defaults.

## 4. Restore the catalogue

Choose one of:

- **Admin UI:** sign in as **`admin`** or **`ops`**, open **Admin → Products**, and create products and variants per merchant (respect **`slug`** / **SKU** uniqueness and optional **`category_id`** links to **`dbo.categories`**).
- **SQL seed:** re-run the demo product blocks from **[`backend/scripts/paytoday-database-all-in-one.sql`](../backend/scripts/paytoday-database-all-in-one.sql)** (or your own `INSERT` scripts), adapted to your `business_id` / merchant layout.

## 5. Quick checks

```sql
SELECT COUNT(*) AS users FROM dbo.users;
SELECT COUNT(*) AS products FROM dbo.products;
SELECT pay_today_merchant_id, slug FROM dbo.products ORDER BY pay_today_merchant_id, slug;
```

Stock levels for variants live in **`dbo.inventory_quantity`**; adjust through **Admin → Inventory** (per-SKU edits) or controlled SQL against **`dbo.stock_movements`** if you maintain that path in your environment.
