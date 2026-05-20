import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import {
  formatBusinessAddress,
  pickupStoreForCategory,
  type PickupStoreFallback,
} from '../lib/catalogPickupStores.js'
import { getCartLines } from './cartService.js'

export type StorePickupLineDto = {
  productName: string
  sku: string
  quantity: number
}

export type StorePickupStoreDto = {
  merchantId: number
  storeName: string
  addressSummary: string
  lines: StorePickupLineDto[]
}

type ResolvedStore = {
  merchantId: number
  storeName: string
  addressSummary: string
  lines: StorePickupLineDto[]
}

function applyFallback(mid: number, fb: PickupStoreFallback, target: ResolvedStore): ResolvedStore {
  return {
    merchantId: mid,
    storeName: fb.storeName,
    addressSummary: formatBusinessAddress({
      name: fb.storeName,
      addressLine1: fb.addressLine,
      town: fb.town,
    }),
    lines: target.lines,
  }
}

export async function getCartStorePickupStores(pool: ConnectionPool, cartId: string): Promise<StorePickupStoreDto[]> {
  const items = await getCartLines(pool, cartId)
  if (!items.length) return []

  const variantIds = items.map((i) => i.variantId)
  const req = pool.request()
  variantIds.forEach((id, idx) => req.input(`v${idx}`, id))

  const inList = variantIds.map((_, idx) => `@v${idx}`).join(', ')
  if (!inList) return []

  type Row = {
    variant_id: string
    pay_today_merchant_id: number | null
    business_name: string | null
    address_line1: string | null
    address_line2: string | null
    town: string | null
    zipcode: string | null
    category_slug: string | null
  }

  let rows: Row[] = []
  try {
    const r = await req.query<Row>(`
      SELECT
        CAST(v.id AS NVARCHAR(36)) AS variant_id,
        p.pay_today_merchant_id,
        b.name AS business_name,
        b.address_line1,
        b.address_line2,
        b.town,
        b.zipcode,
        LTRIM(RTRIM(c.slug)) AS category_slug
      FROM dbo.product_variants v
      INNER JOIN dbo.products p ON p.id = v.product_id
      LEFT JOIN dbo.categories c ON c.id = p.category_id
      LEFT JOIN dbo.businesses b ON b.pay_today_merchant_id = p.pay_today_merchant_id
      WHERE v.id IN (${inList})
    `)
    rows = r.recordset
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/pay_today_merchant_id|address_line1|Invalid column name/i.test(msg)) throw e
    const r2 = await pool.request().query<Row>(`
      SELECT
        CAST(v.id AS NVARCHAR(36)) AS variant_id,
        CAST(NULL AS INT) AS pay_today_merchant_id,
        CAST(NULL AS NVARCHAR(200)) AS business_name,
        CAST(NULL AS NVARCHAR(200)) AS address_line1,
        CAST(NULL AS NVARCHAR(200)) AS address_line2,
        CAST(NULL AS NVARCHAR(120)) AS town,
        CAST(NULL AS NVARCHAR(40)) AS zipcode,
        LTRIM(RTRIM(c.slug)) AS category_slug
      FROM dbo.product_variants v
      INNER JOIN dbo.products p ON p.id = v.product_id
      LEFT JOIN dbo.categories c ON c.id = p.category_id
      WHERE v.id IN (${inList})
    `)
    rows = r2.recordset
  }

  const byVariant = new Map(rows.map((row) => [row.variant_id, row]))
  const groups = new Map<number, ResolvedStore>()

  for (const line of items) {
    const meta = byVariant.get(line.variantId)
    const catSlug = meta?.category_slug ?? line.categorySlug
    let merchantId = meta?.pay_today_merchant_id ?? null
    if (merchantId == null || !Number.isFinite(merchantId)) {
      const fb = pickupStoreForCategory(catSlug)
      merchantId = fb?.merchantId ?? env.defaultStoreMerchantId ?? 0
    }
    const mid = Number(merchantId)

    let group = groups.get(mid)
    if (!group) {
      const bizName = meta?.business_name?.trim()
      const addressSummary = bizName
        ? formatBusinessAddress({
            name: bizName,
            addressLine1: meta?.address_line1,
            addressLine2: meta?.address_line2,
            town: meta?.town,
            postal: meta?.zipcode,
          })
        : ''
      group = {
        merchantId: mid,
        storeName: bizName || 'Store pickup',
        addressSummary,
        lines: [],
      }
      const fb = pickupStoreForCategory(catSlug)
      if (fb && (!bizName || mid === fb.merchantId)) {
        group = applyFallback(mid, fb, group)
      } else if (!bizName && mid === (env.defaultStoreMerchantId ?? 0)) {
        group.storeName = 'AvoToday — Default store'
        group.addressSummary = group.addressSummary || 'Windhoek, Namibia'
      }
      groups.set(mid, group)
    }

    group.lines.push({
      productName: line.productName,
      sku: line.sku,
      quantity: line.quantity,
    })
  }

  return [...groups.values()].sort((a, b) => a.storeName.localeCompare(b.storeName))
}
