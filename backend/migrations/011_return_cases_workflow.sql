/* Structured return workflow: pending → approved/rejected → received (restock) → completed (refund). */

IF OBJECT_ID(N'dbo.return_case_lines', N'U') IS NOT NULL
  DROP TABLE dbo.return_case_lines;
GO

IF OBJECT_ID(N'dbo.return_cases', N'U') IS NOT NULL
  DROP TABLE dbo.return_cases;
GO

IF OBJECT_ID(N'dbo.return_requests', N'U') IS NOT NULL
  DROP TABLE dbo.return_requests;
GO

CREATE TABLE dbo.return_cases (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_return_cases PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  order_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rc_order REFERENCES dbo.orders(id),
  user_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_rc_user REFERENCES dbo.users(id),
  guest_email NVARCHAR(320) NULL,
  reason NVARCHAR(2000) NOT NULL,
  status NVARCHAR(40) NOT NULL,
  rejection_reason NVARCHAR(1000) NULL,
  image_urls_json NVARCHAR(MAX) NULL,
  refund_subtotal_cents INT NULL,
  refund_handling_fee_cents INT NULL,
  refund_net_cents INT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_rc_created DEFAULT (SYSUTCDATETIME()),
  updated_at DATETIME2 NOT NULL CONSTRAINT DF_rc_updated DEFAULT (SYSUTCDATETIME()),
  received_at DATETIME2 NULL
);
GO

CREATE NONCLUSTERED INDEX IX_return_cases_order ON dbo.return_cases(order_id);
CREATE NONCLUSTERED INDEX IX_return_cases_status ON dbo.return_cases(status);
GO

CREATE TABLE dbo.return_case_lines (
  id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_return_case_lines PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  return_case_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rcl_case REFERENCES dbo.return_cases(id) ON DELETE CASCADE,
  product_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rcl_product REFERENCES dbo.products(id),
  variant_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_rcl_variant REFERENCES dbo.product_variants(id),
  quantity INT NOT NULL CONSTRAINT CK_rcl_qty CHECK (quantity > 0)
);
GO

CREATE NONCLUSTERED INDEX IX_return_case_lines_case ON dbo.return_case_lines(return_case_id);
GO
