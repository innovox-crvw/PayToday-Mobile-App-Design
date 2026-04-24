/*
  Demo wallet: balance column on dbo.users + ledger table for /api/wallet/balance and /api/wallet/demo/fund.
  Idempotent — matches backend/scripts/paytoday-add-demo-wallet.sql.
*/

IF COL_LENGTH(N'dbo.users', N'wallet_demo_balance_cents') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD wallet_demo_balance_cents BIGINT NOT NULL CONSTRAINT DF_users_wallet_demo DEFAULT (0);
END;

IF OBJECT_ID(N'dbo.demo_wallet_ledger', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.demo_wallet_ledger (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_demo_wallet_ledger PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_dwl_user REFERENCES dbo.users(id) ON DELETE CASCADE,
    delta_cents BIGINT NOT NULL,
    balance_after_cents BIGINT NOT NULL,
    entry_type NVARCHAR(40) NOT NULL,
    reference NVARCHAR(120) NULL,
    correlation_id UNIQUEIDENTIFIER NULL,
    payee_label NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_dwl_created DEFAULT (SYSUTCDATETIME())
  );

  CREATE INDEX IX_demo_wallet_ledger_user_created ON dbo.demo_wallet_ledger(user_id, created_at DESC);

  CREATE UNIQUE INDEX UQ_demo_wallet_ledger_user_corr ON dbo.demo_wallet_ledger(user_id, correlation_id)
  WHERE correlation_id IS NOT NULL;
END;

PRINT N'024_demo_wallet_schema: finished.';
