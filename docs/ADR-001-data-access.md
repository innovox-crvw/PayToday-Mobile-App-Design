# ADR-001: Data access — raw SQL vs TypeORM

## Status

Accepted (v1)

## Context

The client proposal mentions TypeORM for entities and migrations with a central query layer.

## Decision

The PayToday Store v1 codebase uses **hand-written MS SQL migrations** (`backend/migrations/*.sql`) and **parameterized queries** in repositories and services (`backend/src/repos`, `backend/src/services`). There is no TypeORM dependency.

## Consequences

- **Pros:** Full control over SQL, straightforward performance tuning, no ORM impedance mismatch with existing schema.
- **Cons:** No generated entities; schema drift must be caught by migrations and tests.
- **Future:** TypeORM (or Drizzle) can be introduced later for new subdomains if the client mandates it; migrating the whole surface is high cost and not required for v1 acceptance.

## Embed identity

The embedded storefront (`/embed/*`) uses the same cookie-backed session as the standalone site unless PayToday provides SSO or token handoff. Document the chosen model in [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md) when the App team confirms.
