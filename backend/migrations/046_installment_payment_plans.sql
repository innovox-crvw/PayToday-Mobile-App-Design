/* Instalment / payment-plan support: one plan per order with individual instalment rows. */

IF OBJECT_ID(N'dbo.order_payment_plans', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.order_payment_plans (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_order_payment_plans PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    order_id UNIQUEIDENTIFIER NOT NULL,
    plan_type NVARCHAR(40) NOT NULL CONSTRAINT DF_opp_plan_type DEFAULT (N'monthly'),
    total_instalments TINYINT NOT NULL,
    instalment_cents INT NOT NULL,
    currency NVARCHAR(10) NOT NULL CONSTRAINT DF_opp_currency DEFAULT (N'NAD'),
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_opp_status DEFAULT (N'active'),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_opp_created_at DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_opp_updated_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_opp_order FOREIGN KEY (order_id) REFERENCES dbo.orders (id) ON DELETE CASCADE,
    CONSTRAINT CK_opp_plan_type CHECK (plan_type IN (N'weekly', N'biweekly', N'monthly')),
    CONSTRAINT CK_opp_status CHECK (status IN (N'active', N'completed', N'cancelled', N'defaulted'))
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_order_payment_plans_order ON dbo.order_payment_plans (order_id);
END;
GO

IF OBJECT_ID(N'dbo.order_payment_plan_instalments', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.order_payment_plan_instalments (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_oppi PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    plan_id UNIQUEIDENTIFIER NOT NULL,
    instalment_number TINYINT NOT NULL,
    amount_cents INT NOT NULL,
    due_date DATE NOT NULL,
    paid_at DATETIME2 NULL,
    payment_ref NVARCHAR(200) NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_oppi_status DEFAULT (N'pending'),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_oppi_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_oppi_plan FOREIGN KEY (plan_id) REFERENCES dbo.order_payment_plans (id) ON DELETE CASCADE,
    CONSTRAINT CK_oppi_status CHECK (status IN (N'pending', N'paid', N'overdue', N'waived'))
  );
  CREATE NONCLUSTERED INDEX IX_oppi_plan ON dbo.order_payment_plan_instalments (plan_id, instalment_number);
  CREATE NONCLUSTERED INDEX IX_oppi_due ON dbo.order_payment_plan_instalments (due_date, status);
END;
GO
