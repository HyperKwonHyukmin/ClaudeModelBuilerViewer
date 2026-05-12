import { describe, it, expect } from 'vitest'
import { InputAuditData, isInputAuditJson } from './InputAuditData.js'

describe('InputAuditData', () => {
  const sample = {
    meta: { schemaVersion: '1.0', timestamp: '2026-04-29T00:00:00Z', unit: 'mm' },
    inputFiles: [
      { kind: 'Structure', path: 'a.csv', exists: true, header: ['name'], dataRowCount: 2 },
    ],
    summary: {
      totalDataRows: 4, convertedRows: 2, ignoredRows: 1, parseFailedRows: 0, blankRows: 1,
      ambiguousDuplicateSourceNameRows: 1, ignoredByReason: { zero_mass_equipment: 1 },
    },
    rowAudit: [
      { kind: 'Structure', name: 'A',  status: 'converted', mappingConfidence: 'sourceName', physicalLineNumber: 2 },
      { kind: 'Structure', name: 'A',  status: 'converted', mappingConfidence: 'ambiguousDuplicateSourceName', physicalLineNumber: 3 },
      { kind: 'Equipment', name: 'B',  status: 'ignored',  reasonCode: 'zero_mass_equipment',
        rawFields: { pos: 'X 1000mm Y -2000mm Z 3500mm' }, physicalLineNumber: 4 },
      { kind: 'Pipe',      name: null, status: 'blank',    physicalLineNumber: 5 },
    ],
  }

  it('exposes raw sections and indexes rowAudit by name', () => {
    const a = new InputAuditData(sample)
    expect(a.summary.totalDataRows).toBe(4)
    expect(a.inputFiles).toHaveLength(1)
    expect(a.rowAudit).toHaveLength(4)
    expect(a.rowsByName('A')).toHaveLength(2)
    expect(a.rowsByName('B')).toHaveLength(1)
    expect(a.rowsByName('missing')).toEqual([])
  })

  it('handles a fully empty/missing payload without throwing', () => {
    const a = new InputAuditData({})
    expect(a.rowAudit).toEqual([])
    expect(a.summary).toEqual({})
    expect(a.rowsByName('any')).toEqual([])
  })

  describe('parsePosition', () => {
    it('parses standard X/Y/Z mm strings', () => {
      expect(InputAuditData.parsePosition('X 1234mm Y 5678mm Z 9012mm')).toEqual({ x: 1234, y: 5678, z: 9012 })
    })
    it('handles negatives and decimals', () => {
      expect(InputAuditData.parsePosition('X -1.5mm Y 0mm Z 100.25mm')).toEqual({ x: -1.5, y: 0, z: 100.25 })
    })
    it('returns null on empty / non-string / malformed input', () => {
      expect(InputAuditData.parsePosition('')).toBeNull()
      expect(InputAuditData.parsePosition(null)).toBeNull()
      expect(InputAuditData.parsePosition(undefined)).toBeNull()
      expect(InputAuditData.parsePosition('foo bar')).toBeNull()
    })
  })

  describe('isInputAuditJson', () => {
    it('detects audit JSON via rowAudit + summary keys', () => {
      expect(isInputAuditJson(sample)).toBe(true)
    })
    it('rejects stage JSON shape', () => {
      expect(isInputAuditJson({ nodes: [], elements: [] })).toBe(false)
      expect(isInputAuditJson(null)).toBe(false)
      expect(isInputAuditJson({})).toBe(false)
    })
  })
})
