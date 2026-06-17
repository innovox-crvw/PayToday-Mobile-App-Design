import type { ConnectionPool } from 'mssql'

export interface AddressRow {
  id: string
  label: string | null
  line1: string
  line2: string | null
  suburb: string | null
  city: string
  region: string | null
  postal_code: string | null
  country: string
  is_default: boolean
  lat: number | null
  lng: number | null
  geo_source: string | null
}

export async function listAddresses(pool: ConnectionPool, userId: string): Promise<AddressRow[]> {
  const r = await pool
    .request()
    .input('userId', userId)
    .query<AddressRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, label, line1, line2, suburb, city, region, postal_code, country,
        is_default, lat, lng, geo_source
      FROM dbo.addresses WHERE user_id = @userId ORDER BY is_default DESC, city
    `)
  return r.recordset
}

export async function createAddress(
  pool: ConnectionPool,
  userId: string,
  input: {
    label: string | null
    line1: string
    line2: string | null
    suburb?: string | null
    city: string
    region: string | null
    postalCode: string | null
    country: string
    isDefault: boolean
    lat?: number | null
    lng?: number | null
    geoSource?: string | null
  },
): Promise<string> {
  if (input.isDefault) {
    await pool.request().input('userId', userId).query(`UPDATE dbo.addresses SET is_default = 0 WHERE user_id = @userId`)
  }
  const r = await pool
    .request()
    .input('userId', userId)
    .input('label', input.label)
    .input('line1', input.line1)
    .input('line2', input.line2)
    .input('suburb', input.suburb ?? null)
    .input('city', input.city)
    .input('region', input.region)
    .input('postalCode', input.postalCode)
    .input('country', input.country)
    .input('isDefault', input.isDefault ? 1 : 0)
    .input('lat', input.lat ?? null)
    .input('lng', input.lng ?? null)
    .input('geoSource', input.geoSource ?? null)
    .query<{ id: string }>(`
      INSERT INTO dbo.addresses (user_id, label, line1, line2, suburb, city, region, postal_code, country, is_default, lat, lng, geo_source)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@userId, @label, @line1, @line2, @suburb, @city, @region, @postalCode, @country, @isDefault, @lat, @lng, @geoSource)
    `)
  return r.recordset[0].id
}

const MAX_ADDR = 255

function clip(s: string, max = MAX_ADDR): string {
  const t = s.trim()
  return t.length > max ? t.slice(0, max) : t
}

export async function updateAddress(
  pool: ConnectionPool,
  userId: string,
  addressId: string,
  input: {
    label: string | null
    line1: string
    line2: string | null
    suburb?: string | null
    city: string
    region: string | null
    postalCode: string | null
    country: string
    isDefault: boolean
    lat?: number | null
    lng?: number | null
    geoSource?: string | null
  },
): Promise<boolean> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    if (input.isDefault) {
      await transaction
        .request()
        .input('userId', userId)
        .query(`UPDATE dbo.addresses SET is_default = 0 WHERE user_id = @userId`)
    }
    const r = await transaction
      .request()
      .input('id', addressId)
      .input('userId', userId)
      .input('label', input.label)
      .input('line1', clip(input.line1))
      .input('line2', input.line2 ? clip(input.line2) : null)
      .input('city', clip(input.city))
      .input('region', input.region ? clip(input.region) : null)
      .input('postalCode', input.postalCode ? clip(input.postalCode, 32) : null)
      .input('country', clip(input.country, 8))
      .input('isDefault', input.isDefault ? 1 : 0)
      .input('suburb', input.suburb ? clip(input.suburb, 120) : null)
      .input('lat', input.lat ?? null)
      .input('lng', input.lng ?? null)
      .input('geoSource', input.geoSource ?? null)
      .query(`
        UPDATE dbo.addresses SET
          label = @label, line1 = @line1, line2 = @line2, suburb = @suburb, city = @city,
          region = @region, postal_code = @postalCode, country = @country, is_default = @isDefault,
          lat = COALESCE(@lat, lat), lng = COALESCE(@lng, lng), geo_source = COALESCE(@geoSource, geo_source)
        WHERE id = @id AND user_id = @userId
      `)
    const n = r.rowsAffected?.[0] ?? 0
    await transaction.commit()
    return n > 0
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

export async function deleteAddress(pool: ConnectionPool, userId: string, addressId: string): Promise<boolean> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    const chk = await transaction
      .request()
      .input('id', addressId)
      .input('userId', userId)
      .query<{ is_default: boolean }>(
        `SELECT is_default FROM dbo.addresses WHERE id = @id AND user_id = @userId`,
      )
    const row = chk.recordset[0]
    if (!row) {
      await transaction.rollback()
      return false
    }
    await transaction.request().input('id', addressId).input('userId', userId).query(`
      DELETE FROM dbo.addresses WHERE id = @id AND user_id = @userId
    `)
    if (row.is_default) {
      const pick = await transaction
        .request()
        .input('userId', userId)
        .query<{ id: string }>(
          `SELECT TOP 1 CAST(id AS NVARCHAR(36)) AS id FROM dbo.addresses WHERE user_id = @userId ORDER BY city`,
        )
      const nextId = pick.recordset[0]?.id
      if (nextId) {
        await transaction.request().input('nid', nextId).input('userId', userId).query(`
          UPDATE dbo.addresses SET is_default = 1 WHERE id = @nid AND user_id = @userId
        `)
      }
    }
    await transaction.commit()
    return true
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}

export async function setDefaultAddress(pool: ConnectionPool, userId: string, addressId: string): Promise<boolean> {
  const transaction = pool.transaction()
  await transaction.begin()
  try {
    await transaction.request().input('userId', userId).query(`
      UPDATE dbo.addresses SET is_default = 0 WHERE user_id = @userId
    `)
    const r = await transaction
      .request()
      .input('id', addressId)
      .input('userId', userId)
      .query(`UPDATE dbo.addresses SET is_default = 1 WHERE id = @id AND user_id = @userId`)
    const n = r.rowsAffected?.[0] ?? 0
    await transaction.commit()
    return n > 0
  } catch (e) {
    await transaction.rollback()
    throw e
  }
}
