# Database Query Architecture

> Detailed reference for how SQL queries are organised, executed, and enforced
> across the NedAccess backend.

---

## 1. Overview

NedAccess uses **MS SQL Server** with **TypeORM** as the data-source driver.
Despite TypeORM being an ORM, the project deliberately uses **raw SQL** via
`AppDataSource.query()` instead of the entity/repository pattern. This is for:

- Predictable performance (no hidden N+1 queries from ORM relations).
- Full control over MS SQL syntax (`OUTPUT INSERTED`, `TOP`, `OFFSET … FETCH`).
- Clear, reviewable SQL during compliance audits.

The architectural rule of the codebase is:

> **All SQL must live in `backend/src/queries/`. Route handlers and most services must NOT contain inline SQL.**

This document explains how that rule is implemented, how to use it, and how it
is enforced.

---

## 2. Directory Layout

```
backend/src/queries/
├── index.ts                    # Re-exports every query module as a namespace
├── base.ts                     # runQuery, withTransaction, ensureOpsDataSource
├── README.md                   # Short developer reference (kept next to code)
│
├── users.ts                    # User auth, registration, lookup
├── userProfiles.ts             # Profile data
├── userProductAccess.ts        # Per-user product authorisation
├── userConsents.ts             # POPIA / consent records
│
├── applications.ts             # Customer + agent application lifecycle (unified)
├── applicationAnswers.ts       # Per-field answers for a form submission
├── applicationSections.ts      # Section-level state for a form
│
├── workflow.ts                 # workflow_instances + state transitions
├── products.ts                 # Product catalogue
├── productSettings.ts          # Per-product configuration
│
├── forms.ts                    # Form definitions (JSON schema)
├── dropdownValues.ts           # Lookup table values
├── signatureTemplates.ts       # Document templates
│
├── documents.ts                # Generic uploaded documents
├── tempUploads.ts              # Pre-application uploads
├── certificates.ts             # Cert / supporting documents
│
├── kycSessions.ts              # KYC orchestration sessions
├── kycDocuments.ts             # KYC artefacts (ID, selfie, etc.)
├── kycReviews.ts               # Manual KYC review actions
├── identities.ts               # Verified identity records
├── livenessVerifications.ts    # AWS Rekognition liveness results
├── ocrReviews.ts               # Textract OCR review actions
│
├── agentKyc.ts                 # Agent-onboarding KYC
├── agentProfiles.ts            # Agent profile / hierarchy
│
├── incomeVerifications.ts      # Bank statement / payslip income checks
├── invoiceVerifications.ts     # Invoice / VAF supplier checks
│
├── addresses.ts                # Address normalisation
├── contactDetails.ts           # Phone / email contact records
├── employmentDetails.ts        # Employment information
│
├── notifications.ts            # In-app + email notifications
├── notificationProviders.ts    # SMTP / SMS gateway config
├── otpCodes.ts                 # One-time passcodes
├── emailCreds.ts               # Per-tenant email credentials
│
├── securityEvents.ts           # Audit log
├── reports.ts                  # Reporting aggregations
├── dashboard.ts                # Dashboard counters / KPIs
│
├── apiKeys.ts                  # External API key management
├── apiConfigurations.ts        # 3rd-party API configuration
├── awsConfig.ts                # AWS credential settings
├── sftpExports.ts              # Outbound SFTP integration
├── mobileHandoff.ts            # Mobile-app handoff tokens
└── systemSettings.ts           # Global feature flags / system config
```

Every file represents **one domain**. New queries should be added to the
matching domain file rather than creating ad-hoc files.

---

## 3. The Foundation: `base.ts`

`base.ts` is the only place that talks to TypeORM directly. Every other query
module sits on top of these three primitives.

### 3.1 `SqlParams` type

```ts
export type SqlParams = Array<string | number | boolean | null | Date>;
```

This restricts what can be passed as parameters. It is intentionally narrow to
prevent accidental object/array binding (which TypeORM's `mssql` driver does
not accept).

### 3.2 `ensureOpsDataSource()`

```ts
export async function ensureOpsDataSource(): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
}
```

A lazy initialiser. Routes that fire before the data source has finished
initialising (e.g., during cold starts) are safe because the first query will
trigger initialisation.

### 3.3 `runQuery<T>()`

```ts
export async function runQuery<T = any>(
  sql: string,
  params?: SqlParams,
  runner?: QueryRunner
): Promise<T> {
  try {
    if (runner) return (runner.query as any)(sql, params || []) as Promise<T>;
    await ensureOpsDataSource();
    return (AppDataSource.query as any)(sql, params || []) as Promise<T>;
  } catch (err) {
    const { logger } = await import('../utils/logger');
    logger.error('Database query failed', {
      sql: sql.substring(0, 200),     // truncated for security & log size
      paramCount: params?.length || 0,
      error: err instanceof Error ? {
        name: err.name,
        message: err.message,
        code: (err as any).code || (err as any).number,
      } : String(err),
    });
    throw err;
  }
}
```

Key behaviours:

- **Single execution path** – every query in the system flows through this
  function, giving a single point for logging, metrics, and instrumentation.
- **Optional `QueryRunner`** – if a caller is inside a transaction, it passes
  the runner so that `runQuery` reuses the same connection / transaction
  scope.
- **Truncated SQL logging** – only the first 200 characters of the SQL are
  logged on failure. Parameters are **never logged** (they may contain PII /
  secrets); only the count is recorded.
- **Errors bubble up** – callers get the original error (including SQL Server
  error number) so route handlers can choose the right HTTP response.

### 3.4 `withTransaction<T>()`

```ts
export async function withTransaction<T>(
  fn: (runner: QueryRunner) => Promise<T>
): Promise<T> {
  await ensureOpsDataSource();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const result = await fn(qr);
    await qr.commitTransaction();
    return result;
  } catch (err) {
    await qr.rollbackTransaction();
    const { logger } = await import('../utils/logger');
    logger.error('Transaction rolled back', { /* ... */ });
    throw err;
  } finally {
    await qr.release();
  }
}
```

Provides ACID transactions across multiple query calls. Always:

- Commits on success.
- Rolls back on any thrown error.
- Releases the connection back to the pool in `finally`.
- Logs rollbacks with full error context.

---

## 4. Query Module Pattern

Every query file follows the same template.

```ts
import { QueryRunner } from 'typeorm';
import { runQuery, SqlParams } from './base';

interface UserRow {
  id: number;
  email: string;
  username: string;
  roles: string;
}

/**
 * Fetch a user by primary key.
 */
export async function getUserById(userId: number): Promise<UserRow[]> {
  return runQuery<UserRow[]>(
    'SELECT TOP 1 id, email, username, roles FROM users WHERE id = @0',
    [userId]
  );
}

/**
 * Update a user's status. Accepts an optional QueryRunner so it can
 * participate in a wider transaction.
 */
export async function updateUserStatus(
  userId: number,
  status: string,
  runner?: QueryRunner
): Promise<void> {
  const sql = 'UPDATE users SET status = @0 WHERE id = @1';
  const params: SqlParams = [status, userId];
  await runQuery<void>(sql, params, runner);
}
```

### Conventions

| Convention                           | Why                                                       |
| ------------------------------------ | --------------------------------------------------------- |
| Functions exported by **name**       | Allows tree-shakable, namespaced imports.                 |
| Explicit parameter types             | Catches type bugs at compile time.                        |
| Explicit return types                | Documents the row shape for consumers.                    |
| Optional trailing `runner?`          | Lets the function be reused inside `withTransaction`.     |
| `@0`, `@1`, `@2` placeholders        | MS SQL parameter syntax (never `?` – that's MySQL).       |
| `SELECT TOP 1` for single-row reads  | MS SQL equivalent of `LIMIT 1`.                           |
| `OUTPUT INSERTED.id` for new rows    | MS SQL equivalent of MySQL's `LAST_INSERT_ID()`.          |
| `GETUTCDATE()` for timestamps        | Always store UTC.                                         |

---

## 5. The `index.ts` Re-export Pattern

`backend/src/queries/index.ts` exposes every domain module as a **namespace**.

```ts
export * as base from './base';
export * as applications from './applications';
export * as users from './users';
export * as products from './products';
export * as workflow from './workflow';
export * as forms from './forms';
export * as documents from './documents';
// … etc
```

This produces a clean import style throughout the codebase:

```ts
import { users as QUsers, applications as QApplications } from '../queries';

const rows = await QUsers.getUserById(userId);
const app  = await QApplications.getApplicationBasicInfo(applicationId);
```

The `Q` prefix is a convention used in routes/services to make it obvious at
call sites that you are calling into the **query layer**.

Modules that have been retired are commented out (rather than deleted) so the
removal is visible in code review:

```ts
// export * as agentApplications from './agentApplications'; // REMOVED – Unified with applications
// export * as profileKyc from './profileKyc';               // Removed – KYC uses normalized tables now
```

---

## 6. Common Query Recipes

### 6.1 Simple SELECT

```ts
export async function findUserIdByEmail(email: string) {
  return runQuery<any>(
    'SELECT TOP 1 id FROM users WHERE email = @0',
    [email]
  );
}
```

### 6.2 INSERT with returned identity

MS SQL does not have `LAST_INSERT_ID()`; use `OUTPUT INSERTED.<col>`:

```ts
export async function insertUserRegister(params: {
  email: string;
  username: string;
  passwordHash: string;
  rolesJson: string;
}) {
  return runQuery<any>(
    `INSERT INTO users (email, username, password_hash, roles)
     OUTPUT INSERTED.id
     VALUES (@0, @1, @2, @3)`,
    [params.email, params.username, params.passwordHash, params.rolesJson]
  );
}
```

The function returns `[{ id: 123 }]`; callers read `result[0]?.id`.

### 6.3 UPDATE

```ts
export async function markEmailVerified(userId: number) {
  return runQuery<any>(
    `UPDATE users
     SET email_verified_at = GETUTCDATE(),
         email_verification_token = NULL,
         email_verification_expires_at = NULL
     WHERE id = @0`,
    [userId]
  );
}
```

### 6.4 Count / boolean helpers

```ts
export async function applicationExists(applicationId: number): Promise<boolean> {
  const rows = await runQuery<Array<{ '': number }>>(
    'SELECT TOP 1 1 FROM applications WHERE id = @0',
    [applicationId]
  );
  return rows.length > 0;
}
```

### 6.5 Pagination (`OFFSET … FETCH`)

```ts
const sql = `
  SELECT a.id, a.user_id, a.product_id, wi.current_state AS status
  FROM applications a
  LEFT JOIN workflow_instances wi ON wi.application_id = a.id
  WHERE a.user_id = @0
  ORDER BY a.created_at DESC
  OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY
`;
return runQuery<any>(sql, [userId, offset, pageSize]);
```

### 6.6 Dynamic WHERE clauses

When filters are optional, build the clause and parameter array together to
keep the indices aligned:

```ts
const where: string[] = [];
const params: SqlParams = [];
let i = 0;

if (filters.status) {
  where.push(`wi.current_state = @${i++}`);
  params.push(filters.status);
}
if (filters.fromDate) {
  where.push(`a.submitted_at >= @${i++}`);
  params.push(filters.fromDate);
}
if (filters.searchQuery) {
  where.push(`(u.email LIKE @${i} OR u.first_name LIKE @${i} OR u.last_name LIKE @${i})`);
  params.push(filters.searchQuery);
  i++;
}

params.push(offset, pageSize);
const sql = `
  SELECT … FROM applications a
  LEFT JOIN users u ON u.id = a.user_id
  ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  ORDER BY a.created_at DESC
  OFFSET @${i++} ROWS FETCH NEXT @${i} ROWS ONLY
`;
```

### 6.7 IN-list queries

```ts
export async function getUsersByIds(userIds: number[]): Promise<UserRow[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map((_, i) => `@${i}`).join(',');
  return runQuery<UserRow[]>(
    `SELECT id, email, username FROM users WHERE id IN (${placeholders})`,
    userIds
  );
}
```

### 6.8 Atomic counters (transaction-aware)

```ts
export async function incrementCorrectionCount(
  applicationId: number | string,
  qr?: QueryRunner
) {
  return runQuery<any>(
    'UPDATE applications SET correction_count = correction_count + 1 WHERE id = @0',
    [applicationId],
    qr
  );
}
```

When called from a workflow transition, the workflow service passes the
existing `QueryRunner` so the increment is committed atomically with the state
change.

---

## 7. Transactions

### 7.1 Basic usage

```ts
import { withTransaction } from '../queries/base';
import { users as QUsers, securityEvents as QEvents } from '../queries';

await withTransaction(async (qr) => {
  await QUsers.updateUserStatus(userId, 'ACTIVE', qr);
  await QEvents.recordEvent({ userId, type: 'STATUS_CHANGED' }, qr);
});
```

If either query throws, both are rolled back.

### 7.2 Rules for transaction-aware queries

Every query that may be called inside a transaction must:

1. Accept `runner?: QueryRunner` as the **last** parameter.
2. Pass it through to `runQuery(sql, params, runner)`.
3. Never start its own transaction.

Queries that are guaranteed to be standalone (e.g., simple lookups used only
by a route that doesn't transact) may omit the parameter. When in doubt, add
it – the cost is one optional parameter.

---

## 8. Where Inline SQL **is** Allowed

The "no inline SQL" rule has well-defined exceptions. Inline
`AppDataSource.query(...)` calls **are permitted** in:

| Location                | Reason                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `src/queries/**`        | This is the query layer itself.                            |
| `src/scripts/**`        | One-off maintenance / data-fix scripts.                    |
| `src/migrations/**`     | TypeORM migrations are by definition raw DDL/DML.          |

Inline SQL is **forbidden** in:

- `src/routes/**` (HTTP layer)
- `src/services/**` (business logic – should call the query layer)
- `src/middleware/**`
- `src/workers/**` (workers should use queries or services)

---

## 9. Enforcement

### 9.1 Static check script

`backend/src/scripts/check-query-structure.ts` walks every `.ts` file under
`src/routes/` and flags any line that matches `AppDataSource\.query\s*\(`.

Run it locally:

```powershell
cd backend
yarn check:queries
```

Output on a clean tree:

```
🔍 Checking query structure...
✅ All SQL queries are properly structured!
   Checked NN route files
```

Output when a violation is found:

```
❌ Found inline SQL queries in route files:

  src/routes/admin.ts:31
    const sessRows = await AppDataSource.query(
…
💡 Move these queries to src/queries/ directory
💡 See src/queries/README.md for guidelines
```

The script exits non-zero on violations so it can be wired into CI or a
pre-commit hook.

### 9.2 ESLint (optional)

`backend/.eslintrc.js` contains a rule that flags `AppDataSource.query(` in
route files. Enabling it requires installing `eslint`,
`@typescript-eslint/parser`, and `@typescript-eslint/eslint-plugin`.

### 9.3 Cursor rules

The repo ships several Cursor rules under `backend/.cursor/rules/` that teach
AI assistants the conventions:

- `01-sql-files-rule.mdc` – core rule (queries live in `src/queries/`)
- `02-query-structure.mdc` – directory + import patterns
- `03-query-patterns.mdc` – function signatures, transactions, null handling
- `04-type-safety-checklist.mdc` – TS strict-mode pitfalls
- `05-query-enforcement-summary.mdc` – overview of tooling
- `01-ms-sql-rules.mdc` – MySQL → MSSQL syntax cheat-sheet

---

## 10. MS SQL-Specific Gotchas

The codebase was migrated from MySQL. Several patterns differ:

| MySQL                          | MS SQL (NedAccess)                                |
| ------------------------------ | ------------------------------------------------- |
| `?` parameter placeholders     | `@0`, `@1`, `@2` (positional, **zero-indexed**)   |
| `LIMIT 10`                     | `SELECT TOP 10 …`                                 |
| `LIMIT 10 OFFSET 20`           | `OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY`          |
| `INSERT … ; SELECT LAST_INSERT_ID()` | `INSERT … OUTPUT INSERTED.id VALUES (…)`    |
| `CURRENT_TIMESTAMP`            | `GETUTCDATE()`                                    |
| `UTC_TIMESTAMP()`              | `GETUTCDATE()`                                    |
| `ON DUPLICATE KEY UPDATE`      | Separate `IF EXISTS … UPDATE … ELSE INSERT` flow  |
| `CAST(? AS JSON)`              | Pass JSON strings directly                        |
| `tinyint(1)` / boolean         | `BIT`                                             |
| `enum('a','b')`                | `varchar(20)` + CHECK constraint                  |
| `longtext`                     | `nvarchar(max)` or `text`                         |

Common SQL Server error symptoms:

- `Incorrect syntax near '?'` – you used MySQL placeholders.
- `Must declare scalar variable '@N'` – parameter index off by one.
- `Incorrect syntax near 'TOP'` – `TOP` must come **immediately after** `SELECT`.
- `Data type 'enum' not supported` – migrate to `varchar` + check constraint.

---

## 11. End-to-End Example

Putting it all together: how a route in `routes/auth.ts` reads a user.

### 11.1 Query module – `src/queries/users.ts`

```ts
import { runQuery } from './base';

export interface UserRow {
  id: number;
  email: string;
  email_verified_at: Date | null;
}

export async function findUserByEmail(email: string): Promise<UserRow[]> {
  return runQuery<UserRow[]>(
    `SELECT TOP 1 id, email, email_verified_at
     FROM users
     WHERE email = @0`,
    [email]
  );
}
```

### 11.2 Re-export – `src/queries/index.ts`

```ts
export * as users from './users';
```

### 11.3 Route handler – `src/routes/auth.ts`

```ts
import { Router } from 'express';
import { users as QUsers } from '../queries';

const router = Router();

router.get('/users/by-email/:email', async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'invalid_email' });

  const rows = await QUsers.findUserByEmail(email);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'user_not_found' });
  }

  return res.json(rows[0]);
});
```

Notes on this example:

1. The route never imports `AppDataSource`.
2. The route never writes SQL.
3. The query function is reusable from any service or worker.
4. The query function can be unit-tested in isolation by mocking `runQuery`.
5. If the call ever needs to be transactional, only the query function changes
   (add `runner?: QueryRunner`); the route stays the same.

---

## 12. Adding a New Query – Checklist

When you need new database access, follow this checklist:

1. **Pick the right domain file** in `src/queries/` (or create a new one if
   the domain genuinely doesn't exist yet).
2. **Define an explicit row interface** for the SELECT result. Avoid `any`
   for new code where possible.
3. **Write the function** using `runQuery<T>()`. Use MS SQL syntax (`@N`
   parameters, `TOP`, `OUTPUT INSERTED`, `GETUTCDATE()`).
4. **Add an optional `runner?: QueryRunner` parameter** if the function may
   ever be called from a transaction.
5. **JSDoc the function** – at minimum a one-line summary plus parameter
   descriptions.
6. If you created a new file, **add an export** to `src/queries/index.ts`.
7. **Use it from the route/service** with the `Q<Module>` import style.
8. **Run** `yarn check:queries` and `yarn tsc --noEmit` before committing.

---

## 13. FAQ

**Q: Why not use the TypeORM repository / entity APIs?**
The project standardised on raw SQL early because (a) the schema predates
TypeORM, (b) MS SQL's syntax differs enough that the abstraction leaks, and
(c) explicit SQL is easier to review for compliance.

**Q: Can I return DTOs instead of raw rows?**
Yes – the query layer returns rows; map them to DTOs in the calling
service/route. Don't put mapping logic in `src/queries/`.

**Q: Where do prepared statement caches live?**
The TypeORM `mssql` driver handles statement caching at the connection-pool
level. Application code does not manage statement lifecycle.

**Q: What about read replicas?**
Currently the app uses a single data source (`AppDataSource`). If a read
replica is added later, the abstraction in `runQuery` is the right place to
route reads vs. writes.

**Q: How do I log query timings?**
Add timing inside `runQuery` in `base.ts` – every query goes through there,
so it's a single point of instrumentation.

---

## 14. Related Files

- `backend/src/queries/base.ts` – core helpers
- `backend/src/queries/index.ts` – module re-exports
- `backend/src/queries/README.md` – short developer reference (in-tree)
- `backend/src/scripts/check-query-structure.ts` – enforcement script
- `backend/.cursor/rules/01-sql-files-rule.mdc` – primary cursor rule
- `backend/.cursor/rules/03-query-patterns.mdc` – query function patterns
- `backend/.cursor/rules/01-ms-sql-rules.mdc` – MySQL → MSSQL cheat-sheet
- `docs/ARCHITECTURE.md` – higher-level system architecture
