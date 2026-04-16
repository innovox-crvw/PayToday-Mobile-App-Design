/* Add payment_method to drill-down list table (run if API/repo reports invalid column). */
USE [paytoday];
GO

IF OBJECT_ID(N'dbo.hub_payment_category_items', N'U') IS NOT NULL
  AND COL_LENGTH('dbo.hub_payment_category_items', 'payment_method') IS NULL
  ALTER TABLE dbo.hub_payment_category_items ADD payment_method NVARCHAR(120) NULL;
GO
