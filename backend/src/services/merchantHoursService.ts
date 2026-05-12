import type { ConnectionPool } from 'mssql'

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

export interface LiquorSellingHoursRow {
  id: string
  pay_today_merchant_id: number
  day_of_week: number
  start_minute: number
  end_minute: number
  is_active: boolean
}

export async function getLiquorSellingHours(
  pool: ConnectionPool,
  merchantId: number,
): Promise<LiquorSellingHoursRow[]> {
  const r = await pool.request().input('mid', merchantId).query<LiquorSellingHoursRow>(`
    SELECT CAST(id AS NVARCHAR(36)) AS id, pay_today_merchant_id, day_of_week,
      start_minutes AS start_minute, end_minutes AS end_minute,
      CAST(is_active AS BIT) AS is_active
    FROM dbo.liquor_selling_hours
    WHERE pay_today_merchant_id = @mid
    ORDER BY day_of_week
  `)
  return r.recordset
}

export async function upsertLiquorSellingHours(
  pool: ConnectionPool,
  merchantId: number,
  rows: { dayOfWeek: number; startMinute: number; endMinute: number; isActive: boolean }[],
): Promise<void> {
  for (const row of rows) {
    await pool
      .request()
      .input('mid', merchantId)
      .input('dow', row.dayOfWeek)
      .input('start', row.startMinute)
      .input('end', row.endMinute)
      .input('active', row.isActive ? 1 : 0)
      .query(`
        MERGE dbo.liquor_selling_hours AS t
        USING (SELECT @mid AS pay_today_merchant_id, @dow AS day_of_week) AS s
          ON t.pay_today_merchant_id = s.pay_today_merchant_id AND t.day_of_week = s.day_of_week
        WHEN MATCHED THEN
          UPDATE SET start_minutes = @start, end_minutes = @end, is_active = @active
        WHEN NOT MATCHED THEN
          INSERT (pay_today_merchant_id, day_of_week, start_minutes, end_minutes, is_active)
          VALUES (@mid, @dow, @start, @end, @active);
      `)
  }
}

export type CartMerchantAgg = { merchantId: number; hasAlcohol: boolean }

export async function listCartMerchantsWithAlcohol(pool: ConnectionPool, cartId: string): Promise<CartMerchantAgg[]> {
  const r = await pool.request().input('cid', cartId).query<{ mid: number | null; has_alcohol: number }>(`
    SELECT p.pay_today_merchant_id AS mid,
      MAX(CASE WHEN ISNULL(p.contains_alcohol, 0) = 1 THEN 1 ELSE 0 END) AS has_alcohol
    FROM dbo.cart_lines cl
    INNER JOIN dbo.product_variants v ON v.id = cl.variant_id
    INNER JOIN dbo.products p ON p.id = v.product_id
    WHERE cl.cart_id = @cid
    GROUP BY p.pay_today_merchant_id
  `)
  const out: CartMerchantAgg[] = []
  for (const row of r.recordset) {
    if (row.mid == null || !Number.isFinite(Number(row.mid))) continue
    out.push({ merchantId: Number(row.mid), hasAlcohol: Number(row.has_alcohol ?? 0) === 1 })
  }
  return out
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
 * When alcohol is outside the current liquor window, home delivery may proceed if the customer picks a window
 * that falls entirely inside permitted liquor hours.
 */
export async function assertCheckoutAllowedByMerchantHours(
  pool: ConnectionPool,
  cartId: string,
  ctx: { deliveryMethod: 'home' | 'deposit_box'; scheduling: LiquorCheckoutScheduling },
): Promise<void> {
  const now = new Date()
  const groups = await listCartMerchantsWithAlcohol(pool, cartId)
  for (const g of groups) {
    const generalRaw = await getMerchantWeeklyJson(pool, g.merchantId, 'general')
    const general = parseWeeklyHoursJson(generalRaw)
    if (generalRaw && !isOpenAccordingToWeeklyJson(general, now)) {
      throw new Error('This store is closed right now. Please try again during opening hours.')
    }
    if (!g.hasAlcohol) continue

    const granular = await getLiquorSellingHours(pool, g.merchantId)
    const liqRaw = await getMerchantWeeklyJson(pool, g.merchantId, 'liquor')
    const liqWeekly = parseWeeklyHoursJson(liqRaw)

    const openNow =
      granular.length > 0 ? isMomentInsideGranularLiquorHours(granular, now) : !liqRaw || isOpenAccordingToWeeklyJson(liqWeekly, now)

    if (openNow) continue

    if (ctx.deliveryMethod === 'home') {
      let ok = false
      if (granular.length > 0) {
        ok = isWindowInsideGranularLiquorHours(
          granular,
          ctx.scheduling.homeDeliveryWindowStart,
          ctx.scheduling.homeDeliveryWindowEnd,
        )
      } else if (liqRaw && liqWeekly) {
        ok = scheduledWeeklyLiquorOk(liqWeekly, ctx.scheduling)
      }
      if (ok) continue
      throw new Error(
        'Your cart includes alcohol and the store is outside liquor selling hours right now. Choose a home delivery time window that falls within permitted liquor hours, or try again later.',
      )
    }

    throw new Error(
      'Alcohol is not available for pickup at this time. Try again during liquor selling hours or remove alcohol from your cart.',
    )
  }
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
