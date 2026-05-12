import { describe, it, expect } from 'vitest'
import { buildPipeDiameterOverlay, getPipeOuterDiameter } from './PipeDiameterOverlay.js'
import { StageData } from '../data/StageData.js'

const baseJson = {
  meta: { phase: 'C', stageName: 'C_Final', timestamp: '2026-04-29', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: [] },
    { id: 3, x: 0,    y: 1000, z: 0, tags: [] },
    { id: 4, x: 1000, y: 1000, z: 0, tags: [] },
  ],
  // 큰 외경(Tube 100mm) 1개, 작은 외경(Rod 50mm) 1개, 비-원형(Bar) 1개
  properties: [
    { id: 1, kind: 'Tube', dims: [100, 90] },
    { id: 2, kind: 'Rod',  dims: [50] },
    { id: 3, kind: 'Bar',  dims: [80, 40] },
  ],
  elements: [
    { id: 10, type: 'BEAM', startNode: 1, endNode: 2, category: 'Pipe',      propertyId: 1 },
    { id: 11, type: 'BEAM', startNode: 3, endNode: 4, category: 'Pipe',      propertyId: 2 },
    { id: 12, type: 'BEAM', startNode: 1, endNode: 3, category: 'Pipe',      propertyId: 3 },  // Bar — overlay 대상 아님
    { id: 13, type: 'BEAM', startNode: 2, endNode: 4, category: 'Structure', propertyId: 1 },  // 비-Pipe — overlay 대상 아님
  ],
  rigids: [], materials: [], pointMasses: [],
  connectivity: null, healthMetrics: null,
}

describe('getPipeOuterDiameter', () => {
  it('Rod 와 Tube 의 외경(dims[0]) 만 반환', () => {
    expect(getPipeOuterDiameter({ kind: 'Tube', dims: [100, 90] })).toBe(100)
    expect(getPipeOuterDiameter({ kind: 'Rod',  dims: [50] })).toBe(50)
    expect(getPipeOuterDiameter({ kind: 'Bar',  dims: [80, 40] })).toBeNull()
    expect(getPipeOuterDiameter({ kind: 'L',    dims: [50, 50, 5] })).toBeNull()
    expect(getPipeOuterDiameter(null)).toBeNull()
    expect(getPipeOuterDiameter({ kind: 'Tube', dims: [] })).toBeNull()
  })
})

describe('buildPipeDiameterOverlay', () => {
  const RES = { width: 800, height: 600 }

  it('threshold 가 null/0 이면 빈 그룹 반환', () => {
    const stage = new StageData(baseJson)
    expect(buildPipeDiameterOverlay(stage, null, RES).children).toHaveLength(0)
    expect(buildPipeDiameterOverlay(stage, 0, RES).children).toHaveLength(0)
  })

  it('threshold 80 일 때 Tube100 (>=) 와 Rod50 (<) 둘 다 LineSegments2 로 분리', () => {
    const stage = new StageData(baseJson)
    const overlay = buildPipeDiameterOverlay(stage, 80, RES)
    expect(overlay.children).toHaveLength(2)
    // LineSegmentsGeometry 는 instance 당 6 floats(start/end 각 3) — 1 segment 면 1 instance
    for (const child of overlay.children) {
      expect(child.geometry.attributes.instanceStart.count).toBe(1)
    }
  })

  it('threshold 200 일 때는 모두 미만이라 ge segments 는 없음', () => {
    const stage = new StageData(baseJson)
    const overlay = buildPipeDiameterOverlay(stage, 200, RES)
    expect(overlay.children).toHaveLength(1)
    // Tube100 + Rod50 둘 다 < 200 → 2 instance
    expect(overlay.children[0].geometry.attributes.instanceStart.count).toBe(2)
  })

  it('Bar 단면 Pipe element 와 Structure element 는 무시', () => {
    const stage = new StageData(baseJson)
    const overlay = buildPipeDiameterOverlay(stage, 1, RES)
    // 모든 Rod/Tube Pipe — Tube100, Rod50. Bar 와 Structure 는 제외 → 2 instance 합계
    let total = 0
    for (const child of overlay.children) total += child.geometry.attributes.instanceStart.count
    expect(total).toBe(2)
  })
})
