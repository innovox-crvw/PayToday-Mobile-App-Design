import { describe, expect, it } from 'vitest'
import { parseCsvDocument, parseCsvRecords, stripHashCommentLines } from '../backend/src/lib/simpleCsv.js'

describe('parseCsvRecords', () => {
  it('parses quoted fields with commas', () => {
    const recs = parseCsvRecords('a,"b,c",d\n1,2,3')
    expect(recs).toEqual([
      ['a', 'b,c', 'd'],
      ['1', '2', '3'],
    ])
  })
})

describe('stripHashCommentLines', () => {
  it('drops #-only lines before parse', () => {
    const doc = parseCsvDocument(stripHashCommentLines('# hi\nslug,name\na,b'))
    expect(doc.headers).toEqual(['slug', 'name'])
    expect(doc.rows).toEqual([['a', 'b']])
  })
})

describe('parseCsvDocument', () => {
  it('normalizes headers and returns data rows', () => {
    const doc = parseCsvDocument('Slug,Name,SKU\nx,y,z\n')
    expect(doc.headers).toEqual(['slug', 'name', 'sku'])
    expect(doc.rows).toEqual([['x', 'y', 'z']])
  })

  it('rejects duplicate headers', () => {
    expect(() => parseCsvDocument('sku,name,sku\na,b,c')).toThrow(/Duplicate header/)
  })
})
