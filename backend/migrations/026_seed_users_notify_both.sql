/* Demo / seeded staff accounts: prefer in-app + email so hub and order notifications appear without a Settings change. */
UPDATE dbo.users
SET notification_channel = N'both', updated_at = SYSUTCDATETIME()
WHERE notification_channel = N'email'
  AND LOWER(LTRIM(RTRIM(email))) IN (N'demo@paytoday.local', N'louis.viljoen@crvw.com.na', N'brendus.devilliers@gmail.com');
GO

/* Pending outbox rows queued as email-only: allow worker to persist in-app copies for signed-in users. */
IF COL_LENGTH(N'dbo.notification_outbox', N'channel') IS NOT NULL
BEGIN
  UPDATE dbo.notification_outbox
  SET channel = N'both'
  WHERE sent_at IS NULL
    AND channel = N'email'
    AND user_id IS NOT NULL;
END;
