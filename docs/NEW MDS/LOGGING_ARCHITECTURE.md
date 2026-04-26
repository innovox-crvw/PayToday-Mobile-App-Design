# NedAccess Logging Architecture

This document describes how logging works across the NedAccess platform – from ephemeral
stdout/PM2 logs to the persisted `verifytoday_logs` database. It covers the structured
JSON logger, request tracing, security/audit events, document access logs, API-key request
logs, PII redaction, and how each piece is wired together.

---

## 1. Overview

NedAccess uses a **multi-layer logging strategy**:

| Layer | Where it lives | Purpose | Retention |
|---|---|---|---|
| **Structured stdout logger** (`logger`) | PM2 `~/.pm2/logs/` (per-process `*.log`) | Real-time observability, debugging, alerting | Whatever PM2 / log rotation is configured to keep |
| **Request access log** (`requestLogger` middleware) | PM2 stdout | Per-request method / path / status / duration | Same as stdout |
| **Audit log** (`audit_log` table) | `verifytoday_logs` MSSQL DB | Compliance / forensic trail of all sensitive actions | Long term (compliance) |
| **API-key request log** (`api_key_request_logs` table) | `verifytoday_logs` MSSQL DB | Third-party API usage analytics, rate-limit forensics | Long term |
| **Document access log** (`document_access_logs` table) | `verifytoday` (ops) MSSQL DB | Track every download / view / forbidden access of customer documents | 90 days default (`cleanupOldAuditLogs`) |
| **Risk events** (`risk_events` table) | `verifytoday` (ops) MSSQL DB | KYC / fraud risk indicators tied to a session | Long term |
| **Workflow events** (`workflow_events` table) | `verifytoday` (ops) MSSQL DB | State-machine transitions for applications | Long term |

Two physically separated MSSQL databases are used:

- **`verifytoday`** (ops) — application/business data + ops-side audit-style tables
  (`document_access_logs`, `risk_events`, `workflow_events`).
- **`verifytoday_logs`** (logs) — append-only logging tables (`audit_log`,
  `api_key_request_logs`).

Both are configured separately so the logs DB can be sized, backed up and retained
independently from operational data.

---

## 2. Database Connections

### `verifytoday_logs` (LogsDataSource)

Configured in `backend/src/config/typeorm.logs.ts`:

```10:35:backend/src/config/typeorm.logs.ts
export const LogsDataSource = new DataSource({
  type: 'mssql',
  host: env.LOGS_DB_HOST,
  port: env.LOGS_DB_PORT || 1433,
  username: env.LOGS_DB_USER,
  password: env.LOGS_DB_PASS,
  database: env.LOGS_DB_NAME,
  synchronize: false,
  migrationsRun: false,
  logging: false,
  entities: [entityGlob],
  migrations: [migrationGlob],
  ...
});
```

Driven by these env vars (validated by Zod in `backend/src/config/env.ts`):

- `LOGS_DB_HOST`
- `LOGS_DB_PORT`
- `LOGS_DB_USER`
- `LOGS_DB_PASS`
- `LOGS_DB_NAME`

The data source loads entities from `backend/src/entities/logs/` and migrations from
`backend/src/migrations/logs/`.

### `verifytoday` (AppDataSource)

The ops connection (`backend/src/config/typeorm.ops.ts`) is used for `document_access_logs`,
`risk_events`, and `workflow_events`. Standard `runQuery` infrastructure applies (see
`backend/src/queries/base.ts`).

---

## 3. The Structured Logger (`logger`)

`backend/src/utils/logger.ts` provides the canonical structured logger used throughout
the codebase.

### API

```typescript
import { logger } from '../utils/logger';

logger.info('User created', { userId, requestId });
logger.warn('Slow query', { durationMs: 1234, path: '/foo' });
logger.error('Failed to send email', { error });
logger.debug('Cache hit', { key });
logger.security('auth.login.failed', { ip, requestId, reason: 'invalid_password' });
```

### Output Format

Every log line is JSON on a single line, ready for log shippers:

```json
{
  "ts": "2026-04-26T07:08:00.123Z",
  "level": "info",
  "message": "User created",
  "userId": "123",
  "requestId": "abc-..."
}
```

`debug` is suppressed in production (`NODE_ENV === 'production'`).

### PII Redaction

`redactPII()` in `backend/src/utils/logger.ts` walks the context object and:

1. **Replaces sensitive keys with `[REDACTED]`** based on `PII_KEY_PATTERNS`
   (email, phone, id_number, passport, dob, address, password, secret, token, key, …).
2. **Detects PII-shaped values** with `PII_VALUE_PATTERNS` (email-like, 10–15-digit phone-like).
3. **Truncates strings > 500 chars** with `...[TRUNCATED]`.
4. **Whitelists safe keys** via `ALLOWED_KEYS` (`count`, `total`, `duration_ms`, `request_id`, `user_id`, `application_id`, `doc_key`, `doc_type`, …) so they’re never accidentally redacted.

This means even a sloppy `logger.info('msg', { email: req.body.email })` will not
leak the email — the field is auto-replaced with `[REDACTED]`.

### Logging Metrics & Alerts

`backend/src/services/loggingMetrics.ts` keeps an in-process 5-minute rolling window
of error / warning counts. When a threshold is crossed, it itself logs a
critical alert (`High error rate detected` / `High warning rate detected`).

```typescript
LoggingMetrics.incrementErrorCount();   // call from error paths
LoggingMetrics.incrementWarningCount(); // call from warn paths
LoggingMetrics.getMetrics();            // returns health JSON
```

Thresholds:
- **Error**: 100 / 5 min → alert level `critical`
- **Warning**: 500 / 5 min → alert level `warning`

---

## 4. Request Logging Middleware

Mounted very early in `backend/src/app.ts`:

```20:24:backend/src/app.ts
// Correlation ID middleware (very early in chain, before logging)
app.use(correlationIdMiddleware);

// Request logging (early in the chain)
app.use(requestLogger);
```

### `correlationIdMiddleware`

`backend/src/middleware/correlationId.ts`:
- Reads `x-correlation-id` from the request, or generates one with `crypto.randomUUID()`.
- Sets `req.id`.
- Sets the response headers `x-correlation-id` and `X-Request-ID`.

This ID is propagated into log context (`requestId`) for end-to-end tracing.

### `requestLogger`

`backend/src/middleware/logger.ts` emits two structured JSON lines per request:

- `phase: "start"` immediately on receipt.
- `phase: "end"` on `finish` / `close` (with `status` and `durationMs`).
- `phase: "error"` on `error`.

Each line includes `method`, `path`, `userId`, `apiKey` name, `ip`. Output goes to
stdout → PM2 log files (`/home/deployer/.pm2/logs/backend-staging-*.log`).

There is also a second, more verbose request-logging block right after CSRF protection
in `app.ts` that emits emoji-prefixed lines like `📥 ... GET /foo` and
`✅ 200 12ms GET /foo uid=42 cookie=y size=1234B` for at-a-glance ops visibility.

### Error Handler Logging

`backend/src/middleware/error.ts` always logs the full error context to stderr
(`[ERROR_HANDLER] {...}`) before mapping to a sanitized HTTP response. The user
never sees stack traces in production; ops sees them in PM2 logs.

---

## 5. Audit Log (compliance / forensics)

This is the **central log table** that answers “who did what, when, on which resource?”
Every meaningful state-changing or sensitive action writes a row here.

### Table: `audit_log` (in `verifytoday_logs`)

Defined by the entity `backend/src/entities/logs/AuditLog.ts` and created by
`backend/src/migrations/logs/20250101000001-CreateLogsTables.ts`:

| Column | Type | Description |
|---|---|---|
| `id` | `BIGINT IDENTITY` | Primary key |
| `actor_id` | `NVARCHAR(64)` | User ID, `'system'`, or `'anonymous'` |
| `action` | `NVARCHAR(64)` | Dotted action name, e.g. `application.update`, `kyc.reviews.list`, `auth.login.failed` |
| `resource_type` | `NVARCHAR(64)` | `application`, `user`, `api_key`, `security`, `system`, … |
| `resource_id` | `NVARCHAR(64)` | The ID of the resource being acted upon |
| `application_id` | `BIGINT NULL` | Optional FK-style link to an application |
| `ip` | `NVARCHAR(64) NULL` | Source IP (from `x-forwarded-for` or `req.ip`) |
| `meta` | `NVARCHAR(MAX) NULL` | JSON blob of *sanitized* extra context |
| `created_at` | `DATETIME2` | UTC timestamp (`GETUTCDATE()`) |

Indexes:
- `idx_audit_app` on `application_id`
- `idx_audit_created` on `created_at`
- `idx_audit_action` on `action` (added 2026-02-21)

### Writing an audit row

`backend/src/services/audit.ts` exposes a single function:

```typescript
import { audit } from '../services/audit';

await audit({
  actorId: req.user!.id,
  action: 'application.update',
  resourceType: 'application',
  resourceId: String(applicationId),
  applicationId: String(applicationId),
  ip: (req.headers['x-forwarded-for'] as string) || req.ip || null,
  meta: { fieldsChanged: ['email'], reason: 'agent_correction' }
});
```

The service:

1. Lazily initialises `LogsDataSource`.
2. Creates an `AuditLog` entity via the TypeORM repository.
3. Calls `sanitizeMeta()` on `meta` before persisting:
   - **Drops sensitive keys** (email, phone, id_number, passport, names, dob, address, …).
   - **Drops values that look like PII** (email-shaped strings, phone-shaped, long IDs).
   - **Trims strings to 256 chars**.
   - **Recurses up to depth 3** and only retains primitives or whitelisted keys
     (`count`, `total`, `attempts`, `success(es)`, `failed`, `doc_key`, `doc_type`, `duration_ms`, `bytes`, `size`, `status`, `code`).
4. Saves the row. The audit row is itself the source of truth — even if structured logs
   are lost, the DB row remains.

### Action taxonomy (examples used in code)

The codebase has ~60 files calling `audit({...})` with hundreds of distinct
`action` values. Naming convention is **dot-namespaced**:

| Domain | Examples |
|---|---|
| Authentication | `auth.login.success`, `auth.login.failed`, `auth.logout`, `auth.otp.failed` |
| Authorization | `authz.unauthorized`, `authz.forbidden`, `authz.privilege_escalation` |
| Account | `account.locked`, `account.password.changed`, `account.email.verified` |
| Token | `token.revoked`, `token.expired`, `token.invalid` |
| Application lifecycle | `application.update`, `application.submit`, `application.cancel`, `application.approved`, `application.offer.created`, `application.full.view` |
| Application form | `application.notes`, `application.submit.blocked_corrections_limit`, `application.submit.corrections_limit_override` |
| KYC | `kyc.reviews.list`, `kyc.session.create`, … |
| OCR | `document.ocr.completed`, `document.ocr.failed`, `workflow.ocr.triggered`, `admin.ocr.retry` |
| Income / invoice | `income.verification.completed`, `invoice.verification.completed` |
| Admin / users | `user.unlock`, `user.roles_updated`, `user.product_access_granted`, `user.product_access_revoked`, `admin.user.password.reset`, `user.bulk_create` |
| API keys | `api_key.create`, `api_key.revoke`, `api_key.activate`, `api_key.deactivate` |
| SFTP | `sftp.export.retry`, `sftp.export.trigger`, `sftp.config.upsert`, `sftp.config.test`, `sftp.config.delete` |
| Forms / lookups | `form.activate`, `lookup.upsert`, `signature_template.upsert`, `signature_template.delete` |
| Email creds | `admin.email.creds.upsert`, `admin.email.creds.validate`, `admin.email.creds.activate`, `admin.email.creds.delete` |
| Dashboards | `dashboard.overview.view`, `dashboard.processing_times.view`, `dashboard.portfolio.view`, `dashboard.agents.view` |
| Data subject rights | `data_subject_rights.export_requested`, `data_subject_rights.export_downloaded`, `data_subject_rights.consent_given`, `data_subject_rights.consent_withdrawn` |
| Suspicious activity | `suspicious.multiple_failed_logins`, `suspicious.unusual_access`, `suspicious.enumeration` |
| Rate limit | `rate_limit.exceeded` |

When adding a new audited action, follow this pattern: `<domain>.<entity>.<verb>` and
keep the `action` short enough to fit in `NVARCHAR(64)`.

---

## 6. Security Event Logger

`backend/src/services/securityLogger.ts` is a thin wrapper that **does both** layers
in one call: structured logger + persisted audit row.

```typescript
await logSecurityEvent(SecurityEventType.LOGIN_FAILED, {
  userId: '42',
  email: 'masked@example.com',
  ip: req.ip,
  userAgent: req.get('user-agent'),
  requestId: req.id,
  reason: 'invalid_password',
});
```

Internally it:

1. Calls `logger.security(eventType, { ...context, timestamp })` (real-time monitoring).
2. Calls `audit({ actorId, action: eventType, resourceType: 'security', resourceId: actorId, ip, meta: { ... } })`
   for compliance.
3. **Audit failures don’t fail the request** — they’re caught and re-logged via `logger.error`.

Convenience helpers exist for common scenarios:

- `logMultipleFailedLogins(email, ip, attemptCount, requestId)`
- `logAccountLocked(userId, email, ip, failedAttempts, lockoutExpiresAt, requestId)`
- `logPrivilegeEscalation(userId, attemptedRole, ip, requestId)`

The full enum of event types lives in `SecurityEventType` (auth, authz, account, token,
OTP, rate-limit, suspicious activity).

---

## 7. API Key Request Log (third-party API analytics)

This is a **fire-and-forget per-request log** that runs only when a request is
authenticated via API key (i.e. external partner integrations), implemented as
middleware.

### Table: `api_key_request_logs` (in `verifytoday_logs`)

Defined by entity `backend/src/entities/logs/ApiKeyRequestLog.ts` and migration
`backend/src/migrations/logs/20250111000001-CreateApiKeyRequestLogs.ts`.

Columns of interest (PII-free by design):

| Column | Notes |
|---|---|
| `timestamp` | Request finish time |
| `api_key_id`, `api_key_prefix`, `api_key_name` | Identify the partner without exposing the key |
| `method`, `endpoint`, `scope_used` | Sanitized path (numeric IDs / UUIDs / emails replaced with `:id`/`:email`) |
| `status_code`, `response_time_ms`, `response_size_bytes` | Performance/error tracking |
| `ip_address_hash` | **SHA-256 hash** of the IP — never the raw IP |
| `ip_country` | From `cf-ipcountry` / `cloudfront-viewer-country` / `x-azure-clientip-country` |
| `user_agent` | Truncated to 200 chars, emails stripped |
| `application_id`, `user_id` | Only when extractable as IDs / UUIDs (no emails) |
| `is_error`, `error_code`, `error_message` | Sanitized: emails, phones, UUIDs in the message are replaced with `[email]` / `[phone]` / `[id]`, then truncated to 500 chars |
| `rate_limited`, `requests_remaining` | From `X-RateLimit-Remaining` response header |
| `environment`, `server_instance` | `config.server.nodeEnv` and `process.env.HOSTNAME` |

Indexes: `(api_key_id, timestamp)`, `timestamp`, `endpoint`, `status_code`, plus a
filtered index `WHERE is_error = 1` on `is_error`.

### Middleware: `logApiKeyRequest`

`backend/src/services/apiKeyLogger.ts`:

```typescript
export function logApiKeyRequest(req, res, next) {
  const apiKeyData = (req as any).apiKey;
  if (!apiKeyData) return next();      // skip non-API-key traffic

  const startTime = Date.now();
  // capture response body via res.send override
  res.send = (body) => { responseBody = body; return originalSend(body); };

  res.on('finish', async () => {
    // build & save ApiKeyRequestLog row
  });

  next();
}
```

It must be placed **after** `requireIntegrationScope` so `req.apiKey` is populated.
The `res.on('finish')` handler does all the work asynchronously — request latency
is unaffected; errors are caught and logged via `console.error`.

### Querying API key logs

Helpers exposed by the same file (consumed by admin endpoints):

- `getApiKeyLogs({ apiKeyId, startDate, endDate, statusCode, isError, endpoint, limit, offset })`
- `getApiKeyStats(apiKeyId, days)` → totals, error count, success rate, avg/max
  response time, total bandwidth in MB.

---

## 8. Document Access Log (data-protection forensics)

Every download / view / forbidden access of a customer document is logged here.
This satisfies the “who looked at this document?” requirement for KYC, GDPR/POPIA, etc.

### Table: `document_access_logs` (in `verifytoday` / ops DB)

Created by `backend/src/migrations/ops/20251106140000-CreateDocumentAccessLogs.ts`:

| Column | Type |
|---|---|
| `id` | `BIGINT IDENTITY` |
| `document_type` | `NVARCHAR(20)` — `'application_document'`, `'kyc_document'`, `'agent_application_document'` |
| `document_id` | `BIGINT` |
| `user_id` | `BIGINT NULL` (FK → `users.id`) |
| `api_key_id` | `BIGINT NULL` (FK → `api_keys.id`) |
| `access_method` | `NVARCHAR(20)` — `'direct'`, `'signed_url'`, `'api_key'` |
| `ip_address` | `NVARCHAR(45) NULL` |
| `user_agent` | `NVARCHAR(500) NULL` |
| `status` | `NVARCHAR(20)` — `'success'`, `'forbidden'`, `'not_found'`, `'error'`, `'expired'` |
| `error_message` | `NVARCHAR(MAX) NULL` |
| `disposition` | `NVARCHAR(20) NULL` — `'inline'` or `'attachment'` |
| `created_at` | `DATETIME2` (UTC) |

Indexes: `(document_type, document_id)`, `(user_id, created_at DESC)`,
`(api_key_id, created_at DESC)`.

A later migration (`20251201110000-ExpandDocumentAccessLogsColumn.ts`) widens the
`error_message` column.

### Service: `documentAuditLog`

`backend/src/services/documentAuditLog.ts` exposes:

- `logDocumentAccess(data)` — generic insert.
- `logDocumentAccessFromRequest(req, type, id, accessMethod, disposition)` — success path.
- `logDocumentAccessFailure(req, type, id, accessMethod, status, errorMessage?)` — failure path.
- `getDocumentAccessLogs(type, id, limit)` — read access trail per document.
- `getUserDocumentAccessCount(userId, type?, since?)` — usage count per user.
- `getFailedAccessAttempts(ipAddress?, userId?, since?, limit)` — security monitoring.
- `isIpRateLimited(ipAddress, threshold=10, windowMinutes=15)` — convenience.
- `cleanupOldAuditLogs(retentionDays=90)` — data-retention helper.

All inserts are wrapped in `try/catch` with `console.error` so logging never breaks
the actual document download.

---

## 9. Other Logging-Adjacent Tables (in ops DB)

### `risk_events`

Entity: `backend/src/entities/ops/RiskEvent.ts`. Records KYC/fraud risk indicators
(face mismatch, age mismatch, address staleness, etc.) tied to a `kyc_session_id`.
Includes `risk_level`, `risk_score`, `description`, `source`, `metadata`,
`resolved`, `resolved_at`, `resolved_by`. Used by `services/kyc.ts`,
`services/reviewsAndRisk.ts`, `services/unverifiedUserCleanup.ts`.

### `workflow_events`

Entity: `backend/src/entities/ops/WorkflowEvent.ts`. Append-only state-machine
transitions (`workflow_instance_id`, `from_state`, `to_state`, `event_name`,
`actor_id`, payload). Used by the orchestration framework (`services/workflow.ts`).

These are operational data more than “logs”, but they support the same forensic
questions and are queried alongside `audit_log` in admin views.

---

## 10. Migrations

Logs DB migrations live in `backend/src/migrations/logs/` and run against
`LogsDataSource`:

- `20250101000000-InitialSchema.ts` — original `audit_log` creation.
- `20250101000001-CreateLogsTables.ts` — idempotent re-creation of `audit_log` + `api_key_request_logs`.
- `20250111000001-CreateApiKeyRequestLogs.ts` — dedicated migration with extra index `idx_api_key_request_logs_is_error`.
- `20260221000000-AddActionIndex.ts` — adds `idx_audit_action`.

Run with TypeORM CLI (note the separate data source):

```powershell
cd backend
yarn typeorm -d src/config/typeorm.logs.ts migration:run
```

---

## 11. End-to-End Flow Example

A user submitting an application:

1. Frontend `POST /applications/:id/submit` arrives.
2. `correlationIdMiddleware` assigns `req.id` (or trusts incoming header).
3. `requestLogger` logs `phase: "start"` to PM2 stdout with `requestId`, `userId`, `path`, `ip`.
4. Auth middleware validates the user (logs `auth.login.failed` via `logSecurityEvent`
   on failure).
5. Route handler runs business logic; on success it calls
   `audit({ action: 'application.submit', resourceType: 'application', resourceId, applicationId, actorId, ip, meta: {...} })`.
6. `audit()` sanitizes `meta` and inserts a row into `verifytoday_logs.audit_log`.
7. Response returns. `requestLogger` logs `phase: "end"` with `status` and `durationMs`.
8. The user’s correlation ID is returned in `x-correlation-id` so they can quote it
   in support tickets — ops can grep PM2 logs and `audit_log` for that ID.

---

## 12. Operational Pointers

### Reading logs in staging

```powershell
ssh deployer@nedaccess.today-ww.net "pm2 logs backend-staging --lines 200"
ssh deployer@nedaccess.today-ww.net "pm2 logs backend-staging --err --lines 200"
```

### Querying the audit DB

```sql
-- Recent admin actions
SELECT TOP 100 created_at, actor_id, action, resource_type, resource_id, ip, meta
FROM audit_log
ORDER BY created_at DESC;

-- All security events for a user in the last 24h
SELECT * FROM audit_log
WHERE resource_type = 'security'
  AND actor_id = @0
  AND created_at >= DATEADD(hour, -24, GETUTCDATE())
ORDER BY created_at DESC;

-- Top API endpoints by error rate (last 7d)
SELECT endpoint,
       COUNT(*) AS total,
       SUM(CASE WHEN is_error = 1 THEN 1 ELSE 0 END) AS errors
FROM api_key_request_logs
WHERE timestamp >= DATEADD(day, -7, GETUTCDATE())
GROUP BY endpoint
ORDER BY errors DESC;
```

### Adding a new audit action — checklist

1. Decide on a dot-namespaced `action` name (≤ 64 chars).
2. In the route or service, call `audit({ actorId, action, resourceType, resourceId, applicationId?, ip?, meta? })`.
3. Put **only IDs and counts** in `meta`. PII keys (`email`, `phone`, `id_number`, …) are
   silently dropped by `sanitizeMeta` — use IDs instead.
4. If the event is security-relevant, prefer `logSecurityEvent(SecurityEventType.X, ctx)`
   so it also goes through the structured logger.
5. Don’t `await` audit calls in hot paths if latency matters — but they’re already
   designed to never throw to the caller (catch-and-log internally).

### Adding a new field to `audit_log`

1. Create a new migration in `backend/src/migrations/logs/`.
2. Add the column to `backend/src/entities/logs/AuditLog.ts`.
3. Update `AuditParams` and `audit()` in `backend/src/services/audit.ts`.
4. Run migrations against the logs DB.

---

## 13. Files & Paths Cheat-Sheet

| Concern | File |
|---|---|
| Structured logger | `backend/src/utils/logger.ts` |
| Logging metrics | `backend/src/services/loggingMetrics.ts` |
| Request logging middleware | `backend/src/middleware/logger.ts` |
| Correlation IDs | `backend/src/middleware/correlationId.ts` |
| Error handler logging | `backend/src/middleware/error.ts` |
| Audit service (DB write) | `backend/src/services/audit.ts` |
| Security event logger | `backend/src/services/securityLogger.ts` |
| Document access log service | `backend/src/services/documentAuditLog.ts` |
| API key request log middleware | `backend/src/services/apiKeyLogger.ts` |
| Logs DB connection | `backend/src/config/typeorm.logs.ts` |
| Ops DB connection | `backend/src/config/typeorm.ops.ts` |
| `audit_log` entity | `backend/src/entities/logs/AuditLog.ts` |
| `api_key_request_logs` entity | `backend/src/entities/logs/ApiKeyRequestLog.ts` |
| `risk_events` entity | `backend/src/entities/ops/RiskEvent.ts` |
| `workflow_events` entity | `backend/src/entities/ops/WorkflowEvent.ts` |
| Logs DB migrations | `backend/src/migrations/logs/` |
| `document_access_logs` migration | `backend/src/migrations/ops/20251106140000-CreateDocumentAccessLogs.ts` |
| Security-event helper queries | `backend/src/queries/securityEvents.ts` |
