# Data layer architecture

The PayToday Store scope text referenced **TypeORM** for entities and migrations. This repository’s **v1 implementation** intentionally uses:

- **Hand-written SQL migrations** (see `backend/src/db/` and `backend/scripts/paytoday-full-setup.sql`).
- **Parameterized queries** against **Microsoft SQL Server** via the `mssql` driver, mostly organized under `backend/src/repos/` and `backend/src/services/`.

## Rationale

The stack was chosen to align with existing PayToday SQL scripts, operational runbooks, and straightforward deployment to SQL Server without an ORM impedance layer.

## If TypeORM is required later

Introducing TypeORM (entities, repositories, or migrations) would be a **separate epic**: it touches every query path, transaction boundary, and migration story, and should not block shipping v1. A possible incremental approach is **read-only** metadata or **entity definitions only**—only after explicit product/engineering sign-off.

Related: [`docs/ADR-001-data-access.md`](ADR-001-data-access.md), [`docs/SCOPE_ALIGNMENT.md`](SCOPE_ALIGNMENT.md).
