/*
  PayToday Wallet: savings pocket balance, round-up settings, split-bill sessions.
*/

IF COL_LENGTH(N'dbo.users', N'wallet_savings_balance_cents') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD wallet_savings_balance_cents BIGINT NOT NULL CONSTRAINT DF_users_wallet_savings DEFAULT (0);
END;

IF COL_LENGTH(N'dbo.users', N'wallet_round_up_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD wallet_round_up_enabled BIT NOT NULL CONSTRAINT DF_users_wallet_round_up_enabled DEFAULT (0);
END;

IF COL_LENGTH(N'dbo.users', N'wallet_round_up_increment_cents') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD wallet_round_up_increment_cents INT NOT NULL CONSTRAINT DF_users_wallet_round_up_inc DEFAULT (500);
END;

IF OBJECT_ID(N'dbo.wallet_split_bills', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.wallet_split_bills (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_wallet_split_bills PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    creator_user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_wsb_creator REFERENCES dbo.users(id) ON DELETE CASCADE,
    order_id UNIQUEIDENTIFIER NULL,
    total_cents BIGINT NOT NULL,
    currency NVARCHAR(3) NOT NULL CONSTRAINT DF_wsb_currency DEFAULT (N'NAD'),
    creator_share_cents BIGINT NOT NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_wsb_status DEFAULT (N'active'),
    reference NVARCHAR(120) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_wsb_created DEFAULT (SYSUTCDATETIME())
  );
  CREATE INDEX IX_wallet_split_bills_creator ON dbo.wallet_split_bills(creator_user_id, created_at DESC);
END;

IF OBJECT_ID(N'dbo.wallet_split_participants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.wallet_split_participants (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_wallet_split_participants PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    split_bill_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_wsp_split REFERENCES dbo.wallet_split_bills(id) ON DELETE CASCADE,
    display_name NVARCHAR(120) NOT NULL,
    share_cents BIGINT NOT NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_wsp_status DEFAULT (N'pending'),
    sort_order INT NOT NULL CONSTRAINT DF_wsp_sort DEFAULT (0)
  );
  CREATE INDEX IX_wallet_split_participants_split ON dbo.wallet_split_participants(split_bill_id);
END;

PRINT N'068_wallet_savings_split: finished.';
