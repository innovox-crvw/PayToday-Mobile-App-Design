/**
 * Minimal RFC4180-style CSV: comma-separated, double-quote for fields containing comma/newline.
 * First row = headers. UTF-8; leading BOM stripped.
 */

export type CsvDocument = { headers: string[]; rows: string[][] }

/** Remove full lines whose trimmed content starts with `#` (spreadsheet export comments). */
export function stripHashCommentLines(text: string): string {
  return text
    .replace(/\r\n/gu, '\n')
    .replace(/\r/gu, '\n')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return t.length > 0 && !t.startsWith('#')
    })
    .join('\n')
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/gu, '_')
}

/** Split `text` into records; each record is an array of raw field strings. */
export function parseCsvRecords(text: string): string[][] {
  const s = text.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n').replace(/\r/gu, '\n')
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  let inQuotes = false

  const endRow = () => {
    row.push(field)
    field = ''
    if (row.some((c) => c.trim() !== '')) {
      records.push(row)
    }
    row = []
  }

  while (i < s.length) {
    const c = s[i] ?? ''
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n') {
      endRow()
      i++
      continue
    }
    field += c
    i++
  }
  if (inQuotes) {
    throw new Error('CSV has an unclosed double-quote')
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) {
    records.push(row)
  }

  return records
}

export function parseCsvDocument(text: string): CsvDocument {
  const records = parseCsvRecords(text)
  if (records.length < 2) {
    throw new Error('CSV must include a header row and at least one data row')
  }
  const headers = records[0].map((h) => normalizeHeader(h))
  const seen = new Set<string>()
  for (const h of headers) {
    if (!h) throw new Error('CSV header row has an empty column name')
    if (seen.has(h)) throw new Error(`Duplicate header column: ${h}`)
    seen.add(h)
  }
  return { headers, rows: records.slice(1) }
}
