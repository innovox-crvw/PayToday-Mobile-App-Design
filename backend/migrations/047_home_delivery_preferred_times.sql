/* Home delivery areas and time presets.
   Columns match exactly what is visible in the SSMS screenshots provided:
     home_delivery_areas : id, code, display_name, sort_order, created_at
     home_delivery_area_time_presets : id, area_id, sort_order, label,
       start_time_local, end_time_local, days_of_week, iana_tz, created_at
*/

IF OBJECT_ID(N'dbo.home_delivery_areas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.home_delivery_areas (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_home_delivery_areas PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    code NVARCHAR(80) NOT NULL,
    display_name NVARCHAR(200) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_hda_sort_order DEFAULT (0),
    /* Optional link to shipping_zones for rate lookup. */
    shipping_zone_id UNIQUEIDENTIFIER NULL,
    is_active BIT NOT NULL CONSTRAINT DF_hda_is_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_hda_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_hda_zone FOREIGN KEY (shipping_zone_id) REFERENCES dbo.shipping_zones (id)
  );
  CREATE UNIQUE NONCLUSTERED INDEX UX_hda_code ON dbo.home_delivery_areas (code);

  /* Seed three Windhoek areas matching the SSMS screenshot and shipping_zones seed above. */
  INSERT INTO dbo.home_delivery_areas (id, code, display_name, sort_order, shipping_zone_id)
  SELECT
    CAST(N'A0000001-0001-4000-8000-000000000001' AS UNIQUEIDENTIFIER),
    N'whk_south_central',
    N'Klein Windhoek · CBD · Academia',
    10,
    z.id
  FROM dbo.shipping_zones z WHERE z.code = N'whk_south_central';

  INSERT INTO dbo.home_delivery_areas (id, code, display_name, sort_order, shipping_zone_id)
  SELECT
    CAST(N'A0000001-0002-4000-8000-000000000002' AS UNIQUEIDENTIFIER),
    N'whk_katutura_khomasdal',
    N'Katutura · Khomasdal',
    20,
    z.id
  FROM dbo.shipping_zones z WHERE z.code = N'whk_katutura_khomasdal';

  INSERT INTO dbo.home_delivery_areas (id, code, display_name, sort_order, shipping_zone_id)
  SELECT
    CAST(N'A0000001-0003-4000-8000-000000000003' AS UNIQUEIDENTIFIER),
    N'whk_north_east',
    N'Olympia · Eros · Pioneers Park',
    30,
    z.id
  FROM dbo.shipping_zones z WHERE z.code = N'whk_north_east';
END;
GO

IF OBJECT_ID(N'dbo.home_delivery_area_time_presets', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.home_delivery_area_time_presets (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_hdatp PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    area_id UNIQUEIDENTIFIER NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_hdatp_sort DEFAULT (0),
    label NVARCHAR(200) NOT NULL,
    /* Local time strings HH:MM (interpreted in iana_tz). */
    start_time_local NVARCHAR(5) NOT NULL,
    end_time_local NVARCHAR(5) NOT NULL,
    /* Comma-separated ISO weekdays: 1=Mon … 7=Sun.  e.g. N'1,2,3,4,5' */
    days_of_week NVARCHAR(20) NOT NULL,
    iana_tz NVARCHAR(60) NOT NULL CONSTRAINT DF_hdatp_tz DEFAULT (N'Africa/Windhoek'),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_hdatp_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_hdatp_area FOREIGN KEY (area_id) REFERENCES dbo.home_delivery_areas (id) ON DELETE CASCADE
  );
  CREATE NONCLUSTERED INDEX IX_hdatp_area ON dbo.home_delivery_area_time_presets (area_id, sort_order);

  /* Seed time presets matching the SSMS screenshot rows exactly. */
  INSERT INTO dbo.home_delivery_area_time_presets
    (id, area_id, sort_order, label, start_time_local, end_time_local, days_of_week, iana_tz)
  VALUES
    /* whk_south_central — 09:00–12:00 and 17:00–20:00 weekdays */
    (CAST(N'B0000001-0001-4000-8000-000000000001' AS UNIQUEIDENTIFIER),
     CAST(N'A0000001-0001-4000-8000-000000000001' AS UNIQUEIDENTIFIER),
     1, N'Weekday mornings (09:00-12:00)',  N'09:00', N'12:00', N'1,2,3,4,5', N'Africa/Windhoek'),
    (CAST(N'B0000001-0001-4000-8000-000000000002' AS UNIQUEIDENTIFIER),
     CAST(N'A0000001-0001-4000-8000-000000000001' AS UNIQUEIDENTIFIER),
     2, N'Weekday evenings (17:00-20:00)',  N'17:00', N'20:00', N'1,2,3,4,5', N'Africa/Windhoek'),

    /* whk_katutura_khomasdal — Mon–Sat afternoons + Tue & Thu afternoon window */
    (CAST(N'B0000001-0002-4000-8000-000000000001' AS UNIQUEIDENTIFIER),
     CAST(N'A0000001-0002-4000-8000-000000000002' AS UNIQUEIDENTIFIER),
     1, N'Mon-Sat afternoons (16:00-19:00)', N'16:00', N'19:00', N'1,2,3,4,5,6', N'Africa/Windhoek'),
    (CAST(N'B0000001-0003-4000-8000-000000000003' AS UNIQUEIDENTIFIER),
     CAST(N'A0000001-0002-4000-8000-000000000002' AS UNIQUEIDENTIFIER),
     2, N'Tue & Thu afternoons (14:00-18:00)', N'14:00', N'18:00', N'2,4', N'Africa/Windhoek'),

    /* whk_north_east — weekday mornings only */
    (CAST(N'B0000001-0001-4000-8000-000000000003' AS UNIQUEIDENTIFIER),
     CAST(N'A0000001-0003-4000-8000-000000000003' AS UNIQUEIDENTIFIER),
     1, N'Weekday mornings (09:00-12:00)',  N'09:00', N'12:00', N'1,2,3,4,5', N'Africa/Windhoek');
END;
GO
