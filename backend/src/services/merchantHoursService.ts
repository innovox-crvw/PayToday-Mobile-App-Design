import type { ConnectionPool } from 'mssql'
import { env } from '../config/env.js'
import {
  bindRestrictedCategorySlugParams,
  productMatchesLiquorGateSql,
  restrictedCategorySubtreeCte,
} from './ageRestrictedCategoryService.js'
import { isHomeDeliveryMethod } from '../lib/checkoutDelivery.js'
import {
  getLiquorSellingHoursFromWide,
  getStoreSellingHoursFromWide,
  minutesToHmLabel,
  upsertLiquorSellingHoursFromGranular,
  upsertStoreSellingHoursFromGranular,
  type LiquorSellingHoursRow,
} from './sellingHoursWide.js'

export type { LiquorSellingHoursRow } from './sellingHoursWide.js'
export { minutesToHmLabel } from './sellingHoursWide.js'

export type MerchantHoursKind = 'general' | 'liquor'

/** Per weekday 0=Sun .. 6=Sat: closed OR open/close "HH:MM" 24h */
export type WeeklyDaySchedule = { closed?: boolean; open?: string; close?: string }

export type WeeklyHoursJson = Record<string, WeeklyDaySchedule>

function dayKey(d: Date): string {
  return String(d.getUTCDay())
}

function parseHm(s: string | undefined): number | null {
  if (!s || typeof s !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/u.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

function nowMinutesUtc(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function parseWeeklyHoursJson(raw: string | null | undefined): WeeklyHoursJson | null {
  if (!raw?.trim()) return null
  try {
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return null
    return o as WeeklyHoursJson
  } catch {
    return null
  }
}

/** True if `now` falls inside the configured window for that weekday; true when no schedule / closed day means closed. */
export function isOpenAccordingToWeeklyJson(weekly: WeeklyHoursJson | null, now: Date): boolean {
  if (!weekly || Object.keys(weekly).length === 0) return true
  const key = dayKey(now)
  const day = weekly[key] ?? weekly[String(Number(key))]
  if (!day) return true
  if (day.closed === true) return false
  const o = parseHm(day.open)
  const c = parseHm(day.close)
  if (o == null || c == null) return true
  const n = nowMinutesUtc(now)
  if (c >= o) {
    return n >= o && n < c
  }
  /* overnight window e.g. 22:00–02:00 */
  return n >= o || n < c
}

export async function getMerchantWeeklyJson(
  pool: ConnectionPool,
  merchantId: number,
  kind: MerchantHoursKind,
): Promise<string | null> {
  const r = await pool
    .request()
    .input('mid', merchantId)
    .input('k', kind)
    .query<{ weekly_json: string }>(
      `SELECT weekly_json FROM dbo.merchant_operating_hours WHERE pay_today_merchant_id = @mid AND kind = @k`,
    )
  return r.recordset[0]?.weekly_json ?? null
}

export async function upsertMerchantWeeklyJson(
  pool: ConnectionPool,
  merchantId: number,
  kind: MerchantHoursKind,
  weeklyJson: string,
): Promise<void> {
  await pool
    .request()
    .input('mid', merchantId)
    .input('k', kind)
    .input('j', weeklyJson)
    .query(`
      MERGE dbo.merchant_operating_hours AS t
      USING (SELECT @mid AS pay_today_merchant_id, @k AS kind) AS s
      ON t.pay_today_merchant_id = s.pay_today_merchant_id AND t.kind = s.kind
      WHEN MATCHED THEN UPDATE SET weekly_json = @j, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (pay_today_merchant_id, kind, weekly_json) VALUES (@mid, @k, @j);
    `)
}

/* ── Liquor selling hours (per-merchant, per-day-of-week, Africa/Windhoek wall clock) ─────────────── */

const WH_SHORT_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

/** ISO weekday 1=Mon … 7=Sun; minutes 0–1439 in Africa/Windhoek. */
export function windhoekIsoDowAndMinutes(d: Date): { dowIso: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Windhoek',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  let wd = 'Mon'
  let hh = 0
  let mm = 0
  for (const p of parts) {
    if (p.type === 'weekday' && p.value) wd = p.value.slice(0, 3)
    if (p.type === 'hour') hh = Number(p.value)
    if (p.type === 'minute') mm = Number(p.value)
  }
  const dowIso = WH_SHORT_TO_ISO[wd] ?? 1
  const minutes = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0)
  return { dowIso, minutes: Math.min(1439, Math.max(0, minutes)) }
}

export type GranularSellingHoursRow = Pick<
  LiquorSellingHoursRow,
  'day_of_week' | 'start_minute' | 'end_minute' | 'is_active'
>

const ISO_DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}

export function formatGranularHoursSummary(rows: GranularSellingHoursRow[]): string {
  const active = rows
    .filter((r) => r.is_active)
    .sort((a, b) => a.day_of_week - b.day_of_week)
  if (!active.length) return ''
  return active
    .map(
      (r) =>
        `${ISO_DAY_LABELS[r.day_of_week] ?? `Day ${r.day_of_week}`} ${minutesToHmLabel(r.start_minute)}–${minutesToHmLabel(r.end_minute)}`,
    )
    .join(' · ')
}

/** One wide DB row per merchant; expanded to per-day rows for checkout/admin APIs. */
export async function getLiquorSellingHours(
  pool: ConnectionPool,
  merchantId: number,
): Promise<LiquorSellingHoursRow[]> {
  return getLiquorSellingHoursFromWide(pool, merchantId)
}

export async function upsertLiquorSellingHours(
  pool: ConnectionPool,
  merchantId: number,
  rows: { dayOfWeek: number; startMinute: number; endMinute: number; isActive: boolean }[],
): Promise<void> {
  await upsertLiquorSellingHoursFromGranular(pool, merchantId, rows)
}

export async function getStoreSellingHours(
  pool: ConnectionPool,
  merchantId: number,
): Promise<LiquorSellingHoursRow[]> {
  return getStoreSellingHoursFromWide(pool, merchantId)
}

export async function upsertStoreSellingHours(
  pool: ConnectionPool,
  merchantId: number,
  rows: { dayOfWeek: number; startMinute: number; endMinute: number; isActive: boolean }[],
): Promise<void> {
  await upsertStoreSellingHoursFromGranular(pool, merchantId, rows)
}

export type StoreHoursStatus = {
  payTodayMerchantId: number
  configured: boolean
  openNow: boolean
  hoursSummary: string
  items: LiquorSellingHoursRow[]
  nextOpenLabel: string | null
  /** Permitted alcohol sale windows (Africa/Windhoek), for checkout scheduling. */
  liquorItems: LiquorSellingHoursRow[]
  liquorConfigured: boolean
  liquorOpenNow: boolean
  liquorHoursSummary: string
}

export function computeNextStoreOpenLabel(rows: GranularSellingHoursRow[], now: Date): string | null {
  if (!rows.some((r) => r.is_active)) return null
  for (let d = 0; d < 8; d += 1) {
    const dayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 12, 0, 0, 0)
    const { dowIso, minutes } = windhoekIsoDowAndMinutes(d === 0 ? now : dayBase)
    const row = granularRowForDow(rows as LiquorSellingHoursRow[], dowIso)
    if (!row) continue
    if (d === 0 && minutes < row.start_minute) {
      return `Today at ${minutesToHmLabel(row.start_minute)}`
    }
    if (d === 0 && minutes >= row.start_minute && minutes <= row.end_minute) {
      continue
    }
    if (d > 0 || minutes > row.end_minute) {
      const label = ISO_DAY_LABELS[dowIso] ?? 'Next open day'
      return `${label} at ${minutesToHmLabel(row.start_minute)}`
    }
  }
  return null
}

export async function getStoreHoursStatus(pool: ConnectionPool, merchantId: number): Promise<StoreHoursStatus> {
  let granular: LiquorSellingHoursRow[] = []
  try {
    granular = await getStoreSellingHours(pool, merchantId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/store_selling_hours|Invalid object name/i.test(msg)) throw e
  }
  const generalRaw = await getMerchantWeeklyJson(pool, merchantId, 'general')
  const general = parseWeeklyHoursJson(generalRaw)
  const configured = granular.length > 0 || Boolean(generalRaw?.trim())
  const now = new Date()
  let openNow = true
  if (granular.length > 0) {
    openNow = isMomentInsideGranularLiquorHours(granular, now)
  } else if (generalRaw) {
    openNow = isOpenAccordingToWeeklyJson(general, now)
  }
  const hoursSummary =
    granular.length > 0 ? formatGranularHoursSummary(granular) : generalRaw ? 'See weekly schedule' : ''
  const nextOpenLabel = openNow ? null : computeNextStoreOpenLabel(granular, now)
  let liquorGranular: LiquorSellingHoursRow[] = []
  try {
    liquorGranular = await getLiquorSellingHours(pool, merchantId)
  } catch {
    liquorGranular = []
  }
  const liquorActive = liquorGranular.filter((r) => r.is_active)
  const liquorConfigured = liquorActive.length > 0
  const liquorOpenNow =
    liquorConfigured && isMomentInsideGranularLiquorHours(liquorGranular, now)
  return {
    payTodayMerchantId: merchantId,
    configured,
    openNow,
    hoursSummary,
    items: granular,
    nextOpenLabel,
    liquorItems: liquorActive,
    liquorConfigured,
    liquorOpenNow,
    liquorHoursSummary: liquorConfigured ? formatGranularHoursSummary(liquorGranular) : '',
  }
}

async function storeOpenNowForMerchant(pool: ConnectionPool, merchantId: number, now: Date): Promise<boolean> {
  let granular: LiquorSellingHoursRow[] = []
  try {
    granular = await getStoreSellingHours(pool, merchantId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/store_selling_hours|Invalid object name/i.test(msg)) throw e
  }
  if (granular.length > 0) {
    return isMomentInsideGranularLiquorHours(granular, now)
  }
  const generalRaw = await getMerchantWeeklyJson(pool, merchantId, 'general')
  if (!generalRaw) return true
  return isOpenAccordingToWeeklyJson(parseWeeklyHoursJson(generalRaw), now)
}

export type CartMerchantAgg = { merchantId: number; hasAlcohol: boolean }

export async function listCartMerchantsWithAlcohol(pool: ConnectionPool, cartId: string): Promise<CartMerchantAgg[]> {
  const slugs = env.ageRestrictedCategorySlugs
  const cte = restrictedCategorySubtreeCte(slugs)
  const req = pool.request().input('cid', cartId)
  bindRestrictedCategorySlugParams(req, slugs)
  const pred = productMatchesLiquorGateSql(slugs)
  /*
   * Avoid MAX(CASE WHEN … IN (SELECT …)) — SQL Server rejects nested aggregate/subquery
   * in that shape (checkout calls this via assertCheckoutAllowedByMerchantHours).
   */
  const ctePrefix = cte ? `${cte},` : ''
  const withClause = `;WITH ${ctePrefix}`
  try {
    const r = await req.query<{ mid: number | null; has_alcohol: number }>(`
      ${withClause}
      merchants AS (
        SELECT DISTINCT p.pay_today_merchant_id AS mid
        FROM dbo.cart_lines cl
        INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE cl.cart_id = @cid AND p.pay_today_merchant_id IS NOT NULL
      ),
      alcohol_merchants AS (
        SELECT DISTINCT p.pay_today_merchant_id AS mid
        FROM dbo.cart_lines cl
        INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
        INNER JOIN dbo.products p ON p.id = v.product_id
        WHERE cl.cart_id = @cid AND p.pay_today_merchant_id IS NOT NULL AND (${pred})
      )
      SELECT m.mid,
        CAST(CASE WHEN a.mid IS NOT NULL THEN 1 ELSE 0 END AS INT) AS has_alcohol
      FROM merchants m
      LEFT JOIN alcohol_merchants a ON a.mid = m.mid
    `)
    const out: CartMerchantAgg[] = []
    for (const row of r.recordset) {
      if (row.mid == null || !Number.isFinite(Number(row.mid))) continue
      out.push({ merchantId: Number(row.mid), hasAlcohol: Number(row.has_alcohol ?? 0) === 1 })
    }
    return out
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/contains_alcohol/i.test(msg)) {
      const r2 = await pool.request().input('cid', cartId).query<{ mid: number | null; has_alcohol: number }>(`
        ;WITH merchants AS (
          SELECT DISTINCT p.pay_today_merchant_id AS mid
          FROM dbo.cart_lines cl
          INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
          INNER JOIN dbo.products p ON p.id = v.product_id
          WHERE cl.cart_id = @cid AND p.pay_today_merchant_id IS NOT NULL
        ),
        alcohol_merchants AS (
          SELECT DISTINCT p.pay_today_merchant_id AS mid
          FROM dbo.cart_lines cl
          INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
          INNER JOIN dbo.products p ON p.id = v.product_id
          WHERE cl.cart_id = @cid AND p.pay_today_merchant_id IS NOT NULL
            AND ISNULL(p.contains_alcohol, 0) = 1
        )
        SELECT m.mid,
          CAST(CASE WHEN a.mid IS NOT NULL THEN 1 ELSE 0 END AS INT) AS has_alcohol
        FROM merchants m
        LEFT JOIN alcohol_merchants a ON a.mid = m.mid
      `)
      const out: CartMerchantAgg[] = []
      for (const row of r2.recordset) {
        if (row.mid == null || !Number.isFinite(Number(row.mid))) continue
        out.push({ merchantId: Number(row.mid), hasAlcohol: Number(row.has_alcohol ?? 0) === 1 })
      }
      return out
    }
    throw e
  }
}

function granularRowForDow(rows: LiquorSellingHoursRow[], dowIso: number): LiquorSellingHoursRow | null {
  const active = rows.filter((r) => r.is_active && r.day_of_week === dowIso)
  return active[0] ?? null
}

/** True if `when` falls inside an active granular liquor row for that Windhoek calendar day. */
export function isMomentInsideGranularLiquorHours(rows: LiquorSellingHoursRow[], when: Date): boolean {
  if (!rows.length) return false
  const { dowIso, minutes } = windhoekIsoDowAndMinutes(when)
  const row = granularRowForDow(rows, dowIso)
  if (!row) return false
  return minutes >= row.start_minute && minutes <= row.end_minute
}

/** Home delivery window must fall entirely inside one active granular row (same Windhoek day). */
export function isWindowInsideGranularLiquorHours(
  rows: LiquorSellingHoursRow[],
  start: Date | null,
  end: Date | null,
): boolean {
  if (!rows.length || !start || !end) return false
  if (!(start.getTime() < end.getTime())) return false
  const a = windhoekIsoDowAndMinutes(start)
  const b = windhoekIsoDowAndMinutes(end)
  if (a.dowIso !== b.dowIso) return false
  const row = granularRowForDow(rows, a.dowIso)
  if (!row) return false
  return a.minutes >= row.start_minute && b.minutes <= row.end_minute
}

function isMomentInsideWeeklyLiquor(liq: WeeklyHoursJson | null, when: Date): boolean {
  if (!liq) return true
  return isOpenAccordingToWeeklyJson(liq, when)
}

function scheduledWeeklyLiquorOk(liqWeekly: WeeklyHoursJson, scheduling: LiquorCheckoutScheduling): boolean {
  const s = scheduling.homeDeliveryWindowStart
  const e = scheduling.homeDeliveryWindowEnd
  if (!s || !e || !(s.getTime() < e.getTime())) return false
  return isMomentInsideWeeklyLiquor(liqWeekly, s) && isMomentInsideWeeklyLiquor(liqWeekly, e)
}

export type LiquorCheckoutScheduling = {
  deliveryScheduledFor: Date | null
  homeDeliveryWindowStart: Date | null
  homeDeliveryWindowEnd: Date | null
  homeDeliveryWindowLabel: string | null
}

async function liquorSellingOpenNowForMerchant(pool: ConnectionPool, merchantId: number, now: Date): Promise<boolean> {
  const granular = await getLiquorSellingHours(pool, merchantId)
  if (granular.length > 0) {
    return isMomentInsideGranularLiquorHours(granular, now)
  }
  const liqRaw = await getMerchantWeeklyJson(pool, merchantId, 'liquor')
  if (!liqRaw) return true
  const liq = parseWeeklyHoursJson(liqRaw)
  return isOpenAccordingToWeeklyJson(liq, now)
}

/**
 * Enforce merchant hours. Granular `liquor_selling_hours` use Africa/Windhoek; weekly JSON still uses UTC minutes.
 * When alcohol is outside the current liquor window, checkout may proceed if the customer picks a window
 * (home delivery or pickup) that falls entirely inside permitted liquor hours.
 */
export async function assertCheckoutAllowedByMerchantHours(
  pool: ConnectionPool,
  cartId: string,
  ctx: { deliveryMethod: string; scheduling: LiquorCheckoutScheduling },
): Promise<void> {
  const now = new Date()
  const groups = await listCartMerchantsWithAlcohol(pool, cartId)
  for (const g of groups) {
    const storeOpen = await storeOpenNowForMerchant(pool, g.merchantId, now)
    if (!storeOpen) {
      let storeScheduledOk = false
      let storeGranular: LiquorSellingHoursRow[] = []
      try {
        storeGranular = await getStoreSellingHours(pool, g.merchantId)
      } catch {
        storeGranular = []
      }
      if (storeGranular.length > 0) {
        storeScheduledOk = isWindowInsideGranularLiquorHours(
          storeGranular,
          ctx.scheduling.homeDeliveryWindowStart,
          ctx.scheduling.homeDeliveryWindowEnd,
        )
      } else {
        const generalRaw = await getMerchantWeeklyJson(pool, g.merchantId, 'general')
        const general = parseWeeklyHoursJson(generalRaw)
        if (generalRaw && general) {
          storeScheduledOk = scheduledWeeklyLiquorOk(general, ctx.scheduling)
        }
      }
      if (!storeScheduledOk && g.hasAlcohol) {
        let liquorGranular: LiquorSellingHoursRow[] = []
        try {
          liquorGranular = await getLiquorSellingHours(pool, g.merchantId)
        } catch {
          liquorGranular = []
        }
        if (liquorGranular.length > 0) {
          storeScheduledOk = isWindowInsideGranularLiquorHours(
            liquorGranular,
            ctx.scheduling.homeDeliveryWindowStart,
            ctx.scheduling.homeDeliveryWindowEnd,
          )
        }
      }
      if (!storeScheduledOk) {
        throw new Error(
          'This store is closed right now. Choose a pickup or delivery time window during opening hours, or try again later.',
        )
      }
    }

    if (!g.hasAlcohol) continue

    const granular = await getLiquorSellingHours(pool, g.merchantId)
    const liqRaw = await getMerchantWeeklyJson(pool, g.merchantId, 'liquor')
    const liqWeekly = parseWeeklyHoursJson(liqRaw)

    const openNow =
      granular.length > 0 ? isMomentInsideGranularLiquorHours(granular, now) : !liqRaw || isOpenAccordingToWeeklyJson(liqWeekly, now)

    if (openNow) continue

    let scheduledOk = false
    if (granular.length > 0) {
      scheduledOk = isWindowInsideGranularLiquorHours(
        granular,
        ctx.scheduling.homeDeliveryWindowStart,
        ctx.scheduling.homeDeliveryWindowEnd,
      )
    } else if (liqRaw && liqWeekly) {
      scheduledOk = scheduledWeeklyLiquorOk(liqWeekly, ctx.scheduling)
    }
    if (scheduledOk) continue

    if (isHomeDeliveryMethod(ctx.deliveryMethod)) {
      throw new Error(
        'Your cart includes alcohol and the store is outside liquor selling hours right now. Choose a home delivery time window that falls within permitted liquor hours, or try again later.',
      )
    }
    throw new Error(
      'Your cart includes alcohol and the store is outside liquor selling hours right now. Choose a pickup time window that falls within permitted liquor hours, or try again later.',
    )
  }
}

export type StoreCheckoutPreview = {
  outsideStoreHours: boolean
  requiresScheduledTime: boolean
}

export async function getStoreCheckoutPreview(pool: ConnectionPool, cartId: string): Promise<StoreCheckoutPreview> {
  const now = new Date()
  const groups = await listCartMerchantsWithAlcohol(pool, cartId)
  if (!groups.length) {
    return { outsideStoreHours: false, requiresScheduledTime: false }
  }
  for (const g of groups) {
    if (!(await storeOpenNowForMerchant(pool, g.merchantId, now))) {
      return { outsideStoreHours: true, requiresScheduledTime: true }
    }
  }
  return { outsideStoreHours: false, requiresScheduledTime: false }
}

export type LiquorCheckoutPreview = {
  hasAlcohol: boolean
  outsideLiquorSellingWindow: boolean
  requiresDeliveryTime: boolean
}

export async function getLiquorCheckoutPreview(pool: ConnectionPool, cartId: string): Promise<LiquorCheckoutPreview> {
  const now = new Date()
  const groups = await listCartMerchantsWithAlcohol(pool, cartId)
  const hasAlcohol = groups.some((x) => x.hasAlcohol)
  if (!hasAlcohol) {
    return { hasAlcohol: false, outsideLiquorSellingWindow: false, requiresDeliveryTime: false }
  }
  let outside = false
  for (const g of groups) {
    if (!g.hasAlcohol) continue
    if (!(await liquorSellingOpenNowForMerchant(pool, g.merchantId, now))) {
      outside = true
      break
    }
  }
  return {
    hasAlcohol: true,
    outsideLiquorSellingWindow: outside,
    requiresDeliveryTime: outside,
  }
}
