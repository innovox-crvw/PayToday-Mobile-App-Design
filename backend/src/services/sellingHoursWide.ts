import type { ConnectionPool } from 'mssql'

export const WEEKDAY_COLUMNS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

export type WeekdayColumn = (typeof WEEKDAY_COLUMNS)[number]

export const ISO_DOW_TO_COLUMN: Record<number, WeekdayColumn> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
}

export interface LiquorSellingHoursRow {
  id: string
  pay_today_merchant_id: number
  day_of_week: number
  start_minute: number
  end_minute: number
  is_active: boolean
}

export type SellingHoursWideRow = {
  id: number
  merchant_id: number
  monday: string | null
  tuesday: string | null
  wednesday: string | null
  thursday: string | null
  friday: string | null
  saturday: string | null
  sunday: string | null
  is_active: boolean
  created_at: string | null
}

export type GranularHoursInput = {
  dayOfWeek: number
  startMinute: number
  endMinute: number
  isActive: boolean
}

function normalizeIsoDayOfWeek(raw: number): number {
  let dow = Math.trunc(Number(raw))
  if (dow === 0) dow = 7
  return dow
}

export function minutesToHmLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

export function parseDayHoursWindow(raw: string | null | undefined): { start_minute: number; end_minute: number } | null {
  if (!raw?.trim()) return null
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/u.exec(raw.trim())
  if (!m) return null
  const sh = Number(m[1])
  const sm = Number(m[2])
  const eh = Number(m[3])
  const em = Number(m[4])
  if (
    !Number.isInteger(sh) ||
    !Number.isInteger(sm) ||
    !Number.isInteger(eh) ||
    !Number.isInteger(em) ||
    sh < 0 ||
    sh > 23 ||
    sm < 0 ||
    sm > 59 ||
    eh < 0 ||
    eh > 23 ||
    em < 0 ||
    em > 59
  ) {
    return null
  }
  const start_minute = sh * 60 + sm
  const end_minute = eh * 60 + em
  if (end_minute <= start_minute || end_minute > 1440 || start_minute >= 1440) return null
  return { start_minute, end_minute }
}

export function formatDayHoursWindow(startMinute: number, endMinute: number): string {
  return `${minutesToHmLabel(startMinute)}-${minutesToHmLabel(endMinute)}`
}

export function wideRowToGranularRows(merchantId: number, wide: SellingHoursWideRow): LiquorSellingHoursRow[] {
  if (!wide.is_active) return []
  const out: LiquorSellingHoursRow[] = []
  for (let iso = 1; iso <= 7; iso += 1) {
    const col = ISO_DOW_TO_COLUMN[iso]
    const win = parseDayHoursWindow(wide[col])
    if (!win) continue
    out.push({
      id: String(wide.id),
      pay_today_merchant_id: merchantId,
      day_of_week: iso,
      start_minute: win.start_minute,
      end_minute: win.end_minute,
      is_active: true,
    })
  }
  return out
}

export function granularInputsToWideFields(
  rows: GranularHoursInput[],
): Pick<SellingHoursWideRow, WeekdayColumn | 'is_active'> {
  const cols: Record<WeekdayColumn, string | null> = {
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  }
  let rowActive = false
  for (const row of rows) {
    const dow = normalizeIsoDayOfWeek(row.dayOfWeek)
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
      throw new Error(`Invalid dayOfWeek: ${String(row.dayOfWeek)} (use 1–7 Monday–Sunday, ISO)`)
    }
    const start = Math.trunc(Number(row.startMinute))
    const end = Math.trunc(Number(row.endMinute))
    if (!Number.isInteger(start) || start < 0 || start >= 1440) {
      throw new Error(`Invalid startMinute: ${String(row.startMinute)}`)
    }
    if (!Number.isInteger(end) || end <= 0 || end > 1440) {
      throw new Error(`Invalid endMinute: ${String(row.endMinute)}`)
    }
    if (end <= start) {
      throw new Error('endMinute must be greater than startMinute')
    }
    const col = ISO_DOW_TO_COLUMN[dow]
    if (row.isActive) {
      rowActive = true
      cols[col] = formatDayHoursWindow(start, end)
    } else {
      cols[col] = null
    }
  }
  return { ...cols, is_active: rowActive }
}

const WIDE_SELECT = `
  SELECT id, merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday,
    CAST(is_active AS BIT) AS is_active,
    CONVERT(NVARCHAR(30), created_at, 127) AS created_at
`

function validateWideFields(fields: Pick<SellingHoursWideRow, WeekdayColumn | 'is_active'>): void {
  for (const col of WEEKDAY_COLUMNS) {
    const raw = fields[col]
    if (raw == null || !String(raw).trim()) continue
    if (!parseDayHoursWindow(raw)) {
      throw new Error(`Invalid ${col} hours "${raw}" (use HH:mm-HH:mm, e.g. 09:00-20:00)`)
    }
  }
}

async function upsertWideRow(
  pool: ConnectionPool,
  table: 'store_selling_hours' | 'liquor_selling_hours',
  merchantId: number,
  fields: Pick<SellingHoursWideRow, WeekdayColumn | 'is_active'>,
): Promise<void> {
  const req = pool
    .request()
    .input('mid', merchantId)
    .input('mon', fields.monday)
    .input('tue', fields.tuesday)
    .input('wed', fields.wednesday)
    .input('thu', fields.thursday)
    .input('fri', fields.friday)
    .input('sat', fields.saturday)
    .input('sun', fields.sunday)
    .input('active', fields.is_active ? 1 : 0)

  if (table === 'store_selling_hours') {
    await req.query(`
      MERGE dbo.store_selling_hours AS t
      USING (SELECT @mid AS merchant_id) AS s
        ON t.merchant_id = s.merchant_id
      WHEN MATCHED THEN
        UPDATE SET
          monday = @mon, tuesday = @tue, wednesday = @wed, thursday = @thu,
          friday = @fri, saturday = @sat, sunday = @sun, is_active = @active
      WHEN NOT MATCHED THEN
        INSERT (merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
        VALUES (@mid, @mon, @tue, @wed, @thu, @fri, @sat, @sun, @active);
    `)
    return
  }

  await req.query(`
    MERGE dbo.liquor_selling_hours AS t
    USING (SELECT @mid AS merchant_id) AS s
      ON t.merchant_id = s.merchant_id
    WHEN MATCHED THEN
      UPDATE SET
        monday = @mon, tuesday = @tue, wednesday = @wed, thursday = @thu,
        friday = @fri, saturday = @sat, sunday = @sun, is_active = @active
    WHEN NOT MATCHED THEN
      INSERT (merchant_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, is_active)
      VALUES (@mid, @mon, @tue, @wed, @thu, @fri, @sat, @sun, @active);
  `)
}

export async function getStoreSellingHoursWide(
  pool: ConnectionPool,
  merchantId: number,
): Promise<SellingHoursWideRow | null> {
  const r = await pool.request().input('mid', merchantId).query<SellingHoursWideRow>(`
    ${WIDE_SELECT}
    FROM dbo.store_selling_hours
    WHERE merchant_id = @mid
  `)
  return r.recordset[0] ?? null
}

export async function getLiquorSellingHoursWide(
  pool: ConnectionPool,
  merchantId: number,
): Promise<SellingHoursWideRow | null> {
  const r = await pool.request().input('mid', merchantId).query<SellingHoursWideRow>(`
    ${WIDE_SELECT}
    FROM dbo.liquor_selling_hours
    WHERE merchant_id = @mid
  `)
  return r.recordset[0] ?? null
}

export async function upsertStoreSellingHoursWide(
  pool: ConnectionPool,
  merchantId: number,
  fields: Pick<SellingHoursWideRow, WeekdayColumn | 'is_active'>,
): Promise<void> {
  validateWideFields(fields)
  await upsertWideRow(pool, 'store_selling_hours', merchantId, fields)
}

export async function upsertLiquorSellingHoursWide(
  pool: ConnectionPool,
  merchantId: number,
  fields: Pick<SellingHoursWideRow, WeekdayColumn | 'is_active'>,
): Promise<void> {
  validateWideFields(fields)
  await upsertWideRow(pool, 'liquor_selling_hours', merchantId, fields)
}

export async function getStoreSellingHoursFromWide(
  pool: ConnectionPool,
  merchantId: number,
): Promise<LiquorSellingHoursRow[]> {
  const wide = await getStoreSellingHoursWide(pool, merchantId)
  if (!wide) return []
  return wideRowToGranularRows(merchantId, wide)
}

export async function getLiquorSellingHoursFromWide(
  pool: ConnectionPool,
  merchantId: number,
): Promise<LiquorSellingHoursRow[]> {
  const wide = await getLiquorSellingHoursWide(pool, merchantId)
  if (!wide) return []
  return wideRowToGranularRows(merchantId, wide)
}

export async function upsertStoreSellingHoursFromGranular(
  pool: ConnectionPool,
  merchantId: number,
  rows: GranularHoursInput[],
): Promise<void> {
  await upsertStoreSellingHoursWide(pool, merchantId, granularInputsToWideFields(rows))
}

export async function upsertLiquorSellingHoursFromGranular(
  pool: ConnectionPool,
  merchantId: number,
  rows: GranularHoursInput[],
): Promise<void> {
  await upsertLiquorSellingHoursWide(pool, merchantId, granularInputsToWideFields(rows))
}
