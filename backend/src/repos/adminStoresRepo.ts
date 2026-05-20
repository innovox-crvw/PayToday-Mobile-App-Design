import type { ConnectionPool } from 'mssql'
import { formatBusinessAddress } from '../lib/catalogPickupStores.js'

export type AdminCatalogStoreRow = {
  payTodayMerchantId: number
  name: string
  addressLine1: string | null
  addressLine2: string | null
  town: string | null
  zipcode: string | null
  country: string | null
  contactNumber: string | null
  businessEmailAddress: string | null
  description: string | null
  slug: string | null
  businessActive: boolean
  productTotal: number
  productActive: number
  categorySummary: string | null
  addressSummary: string
  hasBusinessRow: boolean
}

export type AdminCatalogStoreDetail = AdminCatalogStoreRow & {
  products: { slug: string; name: string; isActive: boolean; categorySlug: string | null }[]
}

function merchantScopeClause(scope: number[] | undefined, alias = 'p'): string {
  if (!scope?.length) return ''
  const ids = scope.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
  if (!ids.length) return ' AND 1=0'
  return ` AND ${alias}.pay_today_merchant_id IN (${ids.join(', ')})`
}

export async function listAdminCatalogStores(
  pool: ConnectionPool,
  merchantScope?: number[],
): Promise<AdminCatalogStoreRow[]> {
  const scopeSql = merchantScopeClause(merchantScope, 'p')
  const r = await pool.request().query<{
    pay_today_merchant_id: number
    business_name: string | null
    address_line1: string | null
    address_line2: string | null
    town: string | null
    zipcode: string | null
    country: string | null
    contact_number: string | null
    business_email_address: string | null
    description: string | null
    slug: string | null
    business_active: number | boolean | null
    product_total: number
    product_active: number
    category_summary: string | null
    has_business_row: number
  }>(`
    SELECT
      p.pay_today_merchant_id,
      MAX(b.name) AS business_name,
      MAX(b.address_line1) AS address_line1,
      MAX(b.address_line2) AS address_line2,
      MAX(b.town) AS town,
      MAX(b.zipcode) AS zipcode,
      MAX(b.country) AS country,
      MAX(b.contact_number) AS contact_number,
      MAX(b.business_email_address) AS business_email_address,
      MAX(b.description) AS description,
      MAX(b.slug) AS slug,
      MAX(CONVERT(INT, b.active)) AS business_active,
      COUNT(*) AS product_total,
      SUM(CASE WHEN COALESCE(p.is_active, 1) = 1 THEN 1 ELSE 0 END) AS product_active,
      STRING_AGG(CAST(c.slug AS NVARCHAR(4000)), ', ') WITHIN GROUP (ORDER BY c.slug) AS category_summary,
      MAX(CASE WHEN b.pay_today_merchant_id IS NOT NULL THEN 1 ELSE 0 END) AS has_business_row
    FROM dbo.products p
    LEFT JOIN dbo.businesses b ON b.pay_today_merchant_id = p.pay_today_merchant_id
    LEFT JOIN dbo.categories c ON c.id = p.category_id
    WHERE p.pay_today_merchant_id IS NOT NULL
    ${scopeSql}
    GROUP BY p.pay_today_merchant_id
    HAVING COUNT(*) > 0
    ORDER BY MAX(b.name), p.pay_today_merchant_id
  `)

  return r.recordset.map((row) => {
    const mid = Number(row.pay_today_merchant_id)
    const name = row.business_name?.trim() || `Store ${mid}`
    const addressSummary = formatBusinessAddress({
      name,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      town: row.town,
      postal: row.zipcode,
    })
    return {
      payTodayMerchantId: mid,
      name,
      addressLine1: row.address_line1?.trim() || null,
      addressLine2: row.address_line2?.trim() || null,
      town: row.town?.trim() || null,
      zipcode: row.zipcode?.trim() || null,
      country: row.country?.trim() || null,
      contactNumber: row.contact_number?.trim() || null,
      businessEmailAddress: row.business_email_address?.trim() || null,
      description: row.description?.trim() || null,
      slug: row.slug?.trim() || null,
      businessActive: row.business_active === true || row.business_active === 1,
      productTotal: Number(row.product_total),
      productActive: Number(row.product_active),
      categorySummary: row.category_summary?.trim() || null,
      addressSummary,
      hasBusinessRow: Number(row.has_business_row) > 0,
    }
  })
}

export async function getAdminCatalogStoreDetail(
  pool: ConnectionPool,
  merchantId: number,
): Promise<AdminCatalogStoreDetail | null> {
  const list = await listAdminCatalogStores(pool)
  const base = list.find((s) => s.payTodayMerchantId === merchantId)
  if (!base) return null

  const prods = await pool.request().input('mid', merchantId).query<{
    slug: string
    name: string
    is_active: number | boolean
    category_slug: string | null
  }>(`
    SELECT p.slug, p.name, COALESCE(p.is_active, 1) AS is_active, c.slug AS category_slug
    FROM dbo.products p
    LEFT JOIN dbo.categories c ON c.id = p.category_id
    WHERE p.pay_today_merchant_id = @mid
    ORDER BY p.name
  `)

  return {
    ...base,
    products: prods.recordset.map((p) => ({
      slug: p.slug,
      name: p.name,
      isActive: p.is_active === true || p.is_active === 1,
      categorySlug: p.category_slug?.trim() || null,
    })),
  }
}

export type AdminStorePatch = {
  name?: string
  addressLine1?: string | null
  addressLine2?: string | null
  town?: string | null
  zipcode?: string | null
  contactNumber?: string | null
  businessEmailAddress?: string | null
  description?: string | null
}

export async function updateAdminCatalogStore(
  pool: ConnectionPool,
  merchantId: number,
  patch: AdminStorePatch,
): Promise<void> {
  const exists = await pool
    .request()
    .input('mid', merchantId)
    .query<{ c: number }>(`SELECT COUNT_BIG(1) AS c FROM dbo.businesses WHERE pay_today_merchant_id = @mid`)
  if (Number(exists.recordset[0]?.c ?? 0) === 0) {
    throw new Error('No business profile for this merchant. Run merchant seed or create the business row first.')
  }

  const sets: string[] = ['updated_at = SYSUTCDATETIME()']
  const req = pool.request().input('mid', merchantId)

  if (patch.name !== undefined) {
    req.input('name', patch.name.trim().slice(0, 200))
    sets.push('name = @name', 'registered_business_name = @name')
  }
  if (patch.addressLine1 !== undefined) {
    req.input('a1', patch.addressLine1?.trim().slice(0, 500) ?? null)
    sets.push('address_line1 = @a1')
  }
  if (patch.addressLine2 !== undefined) {
    req.input('a2', patch.addressLine2?.trim().slice(0, 500) ?? null)
    sets.push('address_line2 = @a2')
  }
  if (patch.town !== undefined) {
    req.input('town', patch.town?.trim().slice(0, 120) ?? null)
    sets.push('town = @town')
  }
  if (patch.zipcode !== undefined) {
    req.input('zip', patch.zipcode?.trim().slice(0, 40) ?? null)
    sets.push('zipcode = @zip')
  }
  if (patch.contactNumber !== undefined) {
    req.input('phone', patch.contactNumber?.trim().slice(0, 80) ?? null)
    sets.push('contact_number = @phone')
  }
  if (patch.businessEmailAddress !== undefined) {
    req.input('email', patch.businessEmailAddress?.trim().slice(0, 200) ?? null)
    sets.push('business_email_address = @email')
  }
  if (patch.description !== undefined) {
    req.input('desc', patch.description?.trim().slice(0, 2000) ?? null)
    sets.push('description = @desc')
  }

  if (sets.length === 1) return

  await req.query(`UPDATE dbo.businesses SET ${sets.join(', ')} WHERE pay_today_merchant_id = @mid`)
}
