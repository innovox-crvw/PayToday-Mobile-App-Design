/* Customer payment / fulfilment disputes (separate from physical returns). */

IF OBJECT_ID(N'dbo.order_disputes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.order_disputes (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_order_disputes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    order_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NULL,
    guest_email_norm NVARCHAR(320) NULL,
    reason NVARCHAR(500) NOT NULL,
    description NVARCHAR(4000) NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_order_disputes_status DEFAULT (N'open'),
    admin_resolution_note NVARCHAR(2000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_order_disputes_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_order_disputes_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_order_disputes_order FOREIGN KEY (order_id) REFERENCES dbo.orders (id) ON DELETE CASCADE,
    CONSTRAINT CK_order_disputes_status CHECK (
      status IN (N'open', N'in_review', N'resolved', N'dismissed')
    )
  );
  CREATE NONCLUSTERED INDEX IX_order_disputes_order_id ON dbo.order_disputes (order_id);
  CREATE NONCLUSTERED INDEX IX_order_disputes_status_created ON dbo.order_disputes (status, created_at DESC);
END;
GO
