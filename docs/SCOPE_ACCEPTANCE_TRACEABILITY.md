# Scope acceptance traceability

Rough mapping from common scope acceptance themes to **routes / pages** and **verification**. Status is a best-effort snapshot for v1.

| Scope theme | Implementation | Test / check | Status |
|-------------|----------------|--------------|--------|
| Storefront browse / product detail | SPA store routes, catalogue APIs | Manual UAT | Done / partial (see UAT checklist) |
| Cart & checkout | Cart + order creation APIs, checkout UI | Manual + `tests/api.smoke.test.ts` (return URL) | Partial |
| PayToday payment & webhook | Payment intent, return handler, webhook | `tests/api.smoke.test.ts` webhook dedupe | Partial |
| Order states Draft → PendingPayment → Paid → **Processing** | `orders.status` + `fulfillment_tasks.stage`; processing on pick/pack/packed | Manual fulfillment stage + DB/API | Partial → **processing** wired per `SCOPE_ALIGNMENT.md` |
| Inventory / low stock | `inventory_quantity`, low-stock admin API | Manual; admin home lists low stock | Done |
| Fulfillment stages | `PATCH /api/fulfillment/orders/:id/stage` | Manual | Done |
| Deposit / pickup codes (TTL, single-use) | `depositService`, pickup verify routes | Manual + env `PICKUP_CODE_TTL_HOURS` | Done / partial |
| Admin roles | JWT roles `admin`, `ops`, `fulfillment` | Manual sign-in | Done |
| **Revenue / dashboard summary** | Not implemented | N/A | **Phase 2** (see `SCOPE_ALIGNMENT.md`) |
| TypeORM | Not used; SQL + `mssql` | Doc only | N/A (documented) |
| Reserve at payment | Reserved at checkout in v1 | Doc + future epic | Phase 2 |

## Related docs

- [`docs/SCOPE_ALIGNMENT.md`](SCOPE_ALIGNMENT.md)
- [`docs/ARCHITECTURE_DATA_LAYER.md`](ARCHITECTURE_DATA_LAYER.md)
- [`docs/UAT_CHECKLIST.md`](UAT_CHECKLIST.md)
