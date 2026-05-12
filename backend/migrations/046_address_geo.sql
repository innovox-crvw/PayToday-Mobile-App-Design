/* Add geocoordinates to delivery addresses (populated by geocoding on save). */

IF COL_LENGTH(N'dbo.addresses', N'lat') IS NULL
BEGIN
  ALTER TABLE dbo.addresses ADD lat DECIMAL(10, 7) NULL;
END;
GO

IF COL_LENGTH(N'dbo.addresses', N'lng') IS NULL
BEGIN
  ALTER TABLE dbo.addresses ADD lng DECIMAL(10, 7) NULL;
END;
GO

/* Optional: geo_source records who/what set the coordinates (manual, google, nominatim, etc.). */
IF COL_LENGTH(N'dbo.addresses', N'geo_source') IS NULL
BEGIN
  ALTER TABLE dbo.addresses ADD geo_source NVARCHAR(40) NULL;
END;
GO
