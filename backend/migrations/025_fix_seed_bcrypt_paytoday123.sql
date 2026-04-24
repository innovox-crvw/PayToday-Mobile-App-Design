/*
  Seed scripts used a bcrypt string that does not verify for password PayToday123!
  (documented demo / staff password). Replace the known-bad hash so local login works.
*/
UPDATE dbo.users
SET password_hash = N'$2b$10$.5RgDox23EnGCv9NKp/mouLCbMM6sfFMiJqHRWr6loRLK.Lj24/te'
WHERE password_hash = N'$2b$10$yHL1enO0hQsVLFZx/1EPsO4D5z4if5.DDx2YR/TKCw5XvmGn4un62';
