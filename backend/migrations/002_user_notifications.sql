/* In-app notification feed (store orders / checkout); worker inserts rows with source_outbox_id for idempotency. */
IF OBJECT_ID(N'dbo.user_notifications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_notifications (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_user_notifications PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    source_outbox_id UNIQUEIDENTIFIER NULL,
    user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_user_notifications_user REFERENCES dbo.users(id) ON DELETE CASCADE,
    template_key NVARCHAR(80) NOT NULL,
    title NVARCHAR(200) NOT NULL,
    body NVARCHAR(1000) NULL,
    payload NVARCHAR(MAX) NULL,
    read_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_user_notif_created DEFAULT (SYSUTCDATETIME())
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UX_user_notifications_source_outbox' AND object_id = OBJECT_ID(N'dbo.user_notifications')
)
  CREATE UNIQUE NONCLUSTERED INDEX UX_user_notifications_source_outbox
  ON dbo.user_notifications(source_outbox_id)
  WHERE source_outbox_id IS NOT NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_user_notifications_user_created' AND object_id = OBJECT_ID(N'dbo.user_notifications')
)
  CREATE NONCLUSTERED INDEX IX_user_notifications_user_created
  ON dbo.user_notifications(user_id, created_at DESC);
GO
