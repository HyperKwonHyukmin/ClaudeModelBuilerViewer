import { describe, it, expect } from 'vitest'
import { stageDiff } from './stageDiff.js'
import { StageData } from './StageData.js'

const makeJson = (nodeCount, elementCount, groupCount) => ({
  meta: { phase: 'C', stageName: 'Test', timestamp: '', unit: 'mm', schemaVersion: '1.1' },
  nodes: [], elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
  connectivity: { groupCount, largestGroupNodeCount: 0, isolatedNodeCount: 0, groups: [] },
  healthMetrics: {
    totals: { nodeCount, elementCount, rigidCount: 0, pointMassCount: 0, elementsByCategory: { Structure: 0, Pipe: 0 }, bbox: { minX:0,maxX:0,minY:0,maxY:0,minZ:0,maxZ:0 } },
    issues: { freeEndNodes: 0, orphanNodes: 0, shortElements: 0 }
  },
  diagnostics: [], trace: [],
})

describe('stageDiff', () => {
  it('returns correct delta for nodeCount', () => {
    const a = new StageData(makeJson(4093, 2297, 1034))
    const b = new StageData(makeJson(4927, 2990, 682))
    const rows = stageDiff(a, b)
    const nodeRow = rows.find(r => r.label === '노드 수')
    expect(nodeRow.a).toBe(4093)
    expect(nodeRow.b).toBe(4927)
    expect(nodeRow.delta).toBe(834)
  })

  it('returns negative delta when value decreases', () => {
    const a = new StageData(makeJson(100, 50, 200))
    const b = new StageData(makeJson(80, 40, 100))
    const rows = stageDiff(a, b)
    const groupRow = rows.find(r => r.label === '그룹 수')
    expect(groupRow.delta).toBe(-100)
    expect(groupRow.deltaPercent).toBeCloseTo(-50)
  })

  it('handles null/missing stages gracefully', () => {
    const a = new StageData(makeJson(100, 50, 10))
    expect(() => stageDiff(a, null)).not.toThrow()
    expect(() => stageDiff(null, a)).not.toThrow()
  })
})
