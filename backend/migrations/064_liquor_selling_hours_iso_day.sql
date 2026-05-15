/* App + admin use ISO weekday: 1 = Monday … 7 = Sunday (Africa/Windhoek logic in code).
   Some databases used CK_liquor_hours_day with 0–6 (Sunday = 0) or 1–6 only, which rejects Sunday = 7 and breaks MERGE from Admin Liquor hours. */

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NOT NULL
BEGIN
  /* JavaScript-style Sunday = 0 → ISO Sunday = 7 */
  UPDATE dbo.liquor_selling_hours
  SET day_of_week = 7
  WHERE day_of_week = 0;

  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.liquor_selling_hours', N'U')
      AND cc.name = N'CK_liquor_hours_day'
  )
    ALTER TABLE dbo.liquor_selling_hours DROP CONSTRAINT CK_liquor_hours_day;

  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.liquor_selling_hours', N'U')
      AND cc.name = N'CK_liquor_hours_dow'
  )
    ALTER TABLE dbo.liquor_selling_hours DROP CONSTRAINT CK_liquor_hours_dow;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.liquor_selling_hours', N'U')
      AND cc.name = N'CK_liquor_hours_iso_dow'
  )
    ALTER TABLE dbo.liquor_selling_hours
    ADD CONSTRAINT CK_liquor_hours_iso_dow CHECK (day_of_week BETWEEN 1 AND 7);
END;
GO
