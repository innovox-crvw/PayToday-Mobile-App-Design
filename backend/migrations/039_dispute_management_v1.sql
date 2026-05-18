/* Dispute management v1: customer_disputes table (superseded by order_disputes in migration 052). */

IF OBJECT_ID(N'dbo.customer_disputes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.customer_disputes (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_customer_disputes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    order_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NULL,
    guest_email NVARCHAR(320) NULL,
    category NVARCHAR(80) NOT NULL CONSTRAINT DF_cd_category DEFAULT (N'other'),
    description NVARCHAR(4000) NOT NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_cd_status DEFAULT (N'open'),
    resolution_note NVARCHAR(2000) NULL,
    resolved_by NVARCHAR(36) NULL,
    resolved_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_cd_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_cd_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_cd_order FOREIGN KEY (order_id) REFERENCES dbo.orders (id),
    CONSTRAINT CK_cd_status CHECK (status IN (N'open', N'in_review', N'resolved', N'dismissed')),
    CONSTRAINT CK_cd_category CHECK (
      category IN (N'not_received', N'wrong_item', N'damaged', N'billing', N'other')
    )
  );
  CREATE NONCLUSTERED INDEX IX_cd_order_id ON dbo.customer_disputes (order_id);
  CREATE NONCLUSTERED INDEX IX_cd_user_id ON dbo.customer_disputes (user_id);
  CREATE NONCLUSTERED INDEX IX_cd_status ON dbo.customer_disputes (status, created_at DESC);
END;
GO
