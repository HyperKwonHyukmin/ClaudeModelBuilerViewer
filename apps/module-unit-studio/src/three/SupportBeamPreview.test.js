import { describe, it, expect } from 'vitest'
import { StageData } from '../data/StageData.js'
import { buildSupportBeamPreview, buildSupportBeam3D } from './SupportBeamPreview.js'

const stage = () => new StageData({
  meta: {}, nodes: [
    { id: 1, x: 0, y: 0, z: 0 }, { id: 4, x: 3000, y: 0, z: 0 },
  ], elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
  connectivity: null, healthMetrics: null,
})

describe('buildSupportBeamPreview', () => {
  it('빈 목록 → null', () => {
    expect(buildSupportBeamPreview(stage(), [])).toBe(null)
  })
  it('가서포트 1개 → LineSegments(2점)', () => {
    const line = buildSupportBeamPreview(stage(), [{ startNode: 1, endNode: 4 }])
    expect(line).toBeTruthy()
    expect(line.geometry.getAttribute('position').count).toBe(2)
  })
})

describe('buildSupportBeam3D', () => {
  it('빈 목록 → null', () => {
    expect(buildSupportBeam3D(stage(), [])).toBe(null)
  })
  it('가서포트 1개 → InstancedMesh(count 1)', () => {
    const m = buildSupportBeam3D(stage(), [{ startNode: 1, endNode: 4, dims: [100, 100, 10, 10] }])
    expect(m).toBeTruthy()
    expect(m.isInstancedMesh).toBe(true)
    expect(m.count).toBe(1)
  })
})
