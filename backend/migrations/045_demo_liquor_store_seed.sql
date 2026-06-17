/* Seed liquor selling hours for demo merchant 991001.
   Matches the data visible in SSMS:
     Mon(1) 600–1200, Tue(2) 900–1200, Wed(3) 900–1200,
     Thu(4) 600–1200, Fri(5) 600–1200, Sat(6) 600–1200.
   Times are minutes from midnight (Africa/Windhoek local).
*/

SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.liquor_selling_hours', N'U') IS NOT NULL
  AND EXISTS (SELECT 1 FROM dbo.businesses WHERE pay_today_merchant_id = 991001)
BEGIN
  /* Only seed if no rows exist for this merchant to remain re-runnable. */
  IF NOT EXISTS (SELECT 1 FROM dbo.liquor_selling_hours WHERE pay_today_merchant_id = 991001)
  BEGIN
    INSERT INTO dbo.liquor_selling_hours (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
    VALUES
      (991001, 1,  600, 1200, 1),  /* Monday    10:00–20:00 */
      (991001, 2,  900, 1200, 1),  /* Tuesday   15:00–20:00 */
      (991001, 3,  900, 1200, 1),  /* Wednesday 15:00–20:00 */
      (991001, 4,  600, 1200, 1),  /* Thursday  10:00–20:00 */
      (991001, 5,  600, 1200, 1),  /* Friday    10:00–20:00 */
      (991001, 6,  600, 1200, 1);  /* Saturday  10:00–20:00 */
  END;
END;
GO
