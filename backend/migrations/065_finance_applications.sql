/* Demo Nedbank-style finance applications + admin approval workflow. */

IF OBJECT_ID(N'dbo.finance_applications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.finance_applications (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_finance_applications PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    applicant_sub NVARCHAR(255) NULL,
    applicant_name NVARCHAR(200) NOT NULL,
    applicant_email NVARCHAR(320) NOT NULL,
    applicant_phone NVARCHAR(50) NULL,
    category_slug NVARCHAR(80) NULL,
    product_slug NVARCHAR(160) NULL,
    product_name NVARCHAR(500) NULL,
    amount_cents INT NULL,
    term_months INT NULL,
    notes NVARCHAR(2000) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_finance_applications_status DEFAULT (N'pending'),
    reviewed_at DATETIME2 NULL,
    reviewed_by_sub NVARCHAR(255) NULL,
    admin_note NVARCHAR(2000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_finance_applications_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_finance_applications_status CHECK (
      status IN (N'pending', N'approved', N'rejected')
    )
  );
  CREATE NONCLUSTERED INDEX IX_finance_applications_status_created
    ON dbo.finance_applications (status, created_at DESC);
  CREATE NONCLUSTERED INDEX IX_finance_applications_applicant_sub
    ON dbo.finance_applications (applicant_sub)
    WHERE applicant_sub IS NOT NULL;
END;
GO
