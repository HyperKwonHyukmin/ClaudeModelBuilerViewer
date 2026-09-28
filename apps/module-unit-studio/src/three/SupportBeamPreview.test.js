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
  it('가서포트 1개 → InstancedMesh(count 1) 1개를 담은 Group', () => {
    const g = buildSupportBeam3D(stage(), [{ startNode: 1, endNode: 4, dims: [100, 100, 10, 10] }])
    expect(g).toBeTruthy()
    const meshes = g.children.filter(c => c.isInstancedMesh)
    expect(meshes).toHaveLength(1)
    expect(meshes[0].count).toBe(1)
  })

  // 단면이 섞이면 InstancedMesh 를 나눠야 굵기가 규격대로 보인다(하나로 묶으면 첫 dims 로 통일됨).
  it('단면 2종이 섞이면 치수별 InstancedMesh 로 분리된다', () => {
    const g = buildSupportBeam3D(stage(), [
      { startNode: 1, endNode: 4, dims: [100, 100, 10, 10] },
      { startNode: 4, endNode: 1, dims: [130, 130, 12, 12] },
    ])
    const meshes = g.children.filter(c => c.isInstancedMesh)
    expect(meshes).toHaveLength(2)
    expect(meshes.map(m => m.count)).toEqual([1, 1])
  })

  // 솔리드만 있으면 100mm 앵글이 주위 부재에 가려져 "3D 단면으로 바꾸면 사라진다" 가 된다.
  it('가려짐 방지용 중심선(항상 위)이 함께 들어간다', () => {
    const g = buildSupportBeam3D(stage(), [{ startNode: 1, endNode: 4, dims: [100, 100, 10, 10] }])
    const line = g.children.find(c => c.isLineSegments)
    expect(line).toBeTruthy()
    expect(line.material.depthTest).toBe(false)
    expect(line.renderOrder).toBe(999)
  })
})
