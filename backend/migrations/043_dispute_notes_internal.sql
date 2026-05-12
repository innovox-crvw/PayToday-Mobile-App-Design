/* Internal notes on customer disputes (visible to staff only, never to customers). */

IF OBJECT_ID(N'dbo.dispute_notes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.dispute_notes (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_dispute_notes PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    /* References the v1 customer_disputes table; nullable so the row survives table cleanup. */
    dispute_id UNIQUEIDENTIFIER NOT NULL,
    body NVARCHAR(4000) NOT NULL,
    is_internal BIT NOT NULL CONSTRAINT DF_dispute_notes_internal DEFAULT (1),
    author_id NVARCHAR(36) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_dispute_notes_created_at DEFAULT (SYSUTCDATETIME())
  );
  CREATE NONCLUSTERED INDEX IX_dispute_notes_dispute ON dbo.dispute_notes (dispute_id, created_at);
END;
GO
