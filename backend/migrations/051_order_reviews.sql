/* One customer review per order (post-delivery). */

IF OBJECT_ID(N'dbo.order_reviews', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.order_reviews (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_order_reviews PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    order_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NULL,
    rating TINYINT NOT NULL,
    comment NVARCHAR(2000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_order_reviews_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_order_reviews_order FOREIGN KEY (order_id) REFERENCES dbo.orders (id) ON DELETE CASCADE,
    CONSTRAINT CK_order_reviews_rating CHECK (rating >= 1 AND rating <= 5)
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_order_reviews_order_id ON dbo.order_reviews (order_id);
END;
GO
