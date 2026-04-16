import type { ConnectionPool } from 'mssql'

export interface AddressRow {
  id: string
  label: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postal_code: string | null
  country: string
  is_default: boolean
}

export async function listAddresses(pool: ConnectionPool, userId: string): Promise<AddressRow[]> {
  const r = await pool
    .request()
    .input('userId', userId)
    .query<AddressRow>(`
      SELECT CAST(id AS NVARCHAR(36)) AS id, label, line1, line2, city, region, postal_code, country, is_default
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
    city: string
    region: string | null
    postalCode: string | null
    country: string
    isDefault: boolean
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
    .input('city', input.city)
    .input('region', input.region)
    .input('postalCode', input.postalCode)
    .input('country', input.country)
    .input('isDefault', input.isDefault ? 1 : 0)
    .query<{ id: string }>(`
      INSERT INTO dbo.addresses (user_id, label, line1, line2, city, region, postal_code, country, is_default)
      OUTPUT CAST(INSERTED.id AS NVARCHAR(36)) AS id
      VALUES (@userId, @label, @line1, @line2, @city, @region, @postalCode, @country, @isDefault)
    `)
  return r.recordset[0].id
}
