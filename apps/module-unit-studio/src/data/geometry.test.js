import { describe, it, expect } from 'vitest'
import { rotatePointAboutAxis, rotateDirectionAboutAxis, isValidAxis, degToRad } from './geometry.js'
import { StageData } from './StageData.js'

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

describe('geometry — 축 회전', () => {
  it('Z축 90°: (1,0,0) → (0,1,0)', () => {
    const [x, y, z] = rotatePointAboutAxis(1, 0, 0, 'Z', 90)
    expect(near(x, 0)).toBe(true)
    expect(near(y, 1)).toBe(true)
    expect(near(z, 0)).toBe(true)
  })

  it('X축 90° 방향벡터: (0,0,1) → (0,-1,0)', () => {
    const [x, y, z] = rotateDirectionAboutAxis(0, 0, 1, 'X', 90)
    expect(near(x, 0)).toBe(true)
    expect(near(y, -1)).toBe(true)
    expect(near(z, 0)).toBe(true)
  })

  it('pivot 기준 Z축 90°: pivot(1,1,0), 점(2,1,0) → (1,2,0)', () => {
    const [x, y, z] = rotatePointAboutAxis(2, 1, 0, 'Z', 90, { x: 1, y: 1, z: 0 })
    expect(near(x, 1)).toBe(true)
    expect(near(y, 2)).toBe(true)
    expect(near(z, 0)).toBe(true)
  })

  it('360° 회전은 원점 복귀(부동소수 허용)', () => {
    const [x, y, z] = rotatePointAboutAxis(3, -4, 5, 'Y', 360)
    expect(near(x, 3, 1e-6)).toBe(true)
    expect(near(y, -4, 1e-6)).toBe(true)
    expect(near(z, 5, 1e-6)).toBe(true)
  })

  it('isValidAxis', () => {
    expect(isValidAxis('X')).toBe(true)
    expect(isValidAxis('W')).toBe(false)
  })

  it('알 수 없는 축은 throw', () => {
    expect(() => rotatePointAboutAxis(1, 0, 0, 'W', 90)).toThrow()
  })

  it('Y축 90°: (1,0,0) → (0,0,-1)', () => {
    const [x, y, z] = rotatePointAboutAxis(1, 0, 0, 'Y', 90)
    expect(near(x, 0)).toBe(true)
    expect(near(y, 0)).toBe(true)
    expect(near(z, -1)).toBe(true)
  })

  it('degToRad(180) ≈ π', () => {
    expect(near(degToRad(180), Math.PI)).toBe(true)
  })
})

describe('StageData.applyRotation', () => {
  const makeStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
    nodes: [
      { id: 1, x: 0, y: 0, z: 0, tags: [] },
      { id: 2, x: 100, y: 0, z: 0, tags: [] },
    ],
    elements: [
      { id: 1, type: 'CBEAM', startNode: 1, endNode: 2, propertyId: 10, orientation: [0, 0, 1] },
    ],
    rigids: [], properties: [{ id: 10, kind: 'TUBE', dims: [50, 40] }],
    materials: [], pointMasses: [],
  })

  it('Z축 90°: node2 (100,0,0) → (0,100,0)', () => {
    const s = makeStage()
    const count = s.applyRotation('Z', 90, { x: 0, y: 0, z: 0 })
    expect(count).toBe(2)
    const n2 = s.nodeMap.get(2)
    expect(near(n2.x, 0, 1e-6)).toBe(true)
    expect(near(n2.y, 100, 1e-6)).toBe(true)
    expect(near(n2.z, 0, 1e-6)).toBe(true)
  })

  it('X축 90°: orientation [0,0,1] → [0,-1,0]', () => {
    const s = makeStage()
    s.applyRotation('X', 90, { x: 0, y: 0, z: 0 })
    const o = s.elements[0].orientation
    expect(Math.abs(o[0] - 0) < 1e-6).toBe(true)
    expect(Math.abs(o[1] - (-1)) < 1e-6).toBe(true)
    expect(Math.abs(o[2] - 0) < 1e-6).toBe(true)
  })

  it('회전 후 bbox/center 재계산', () => {
    const s = makeStage()
    s.applyRotation('Z', 90, { x: 0, y: 0, z: 0 })
    // (0,0,0)~(0,100,0) → center y = 50
    expect(Math.abs(s.center.y - 50) < 1e-6).toBe(true)
    expect(Math.abs(s.center.x - 0) < 1e-6).toBe(true)
  })

  it('회전 후 healthMetrics.totals.bbox 도 갱신된다', () => {
    const s = makeStage()
    s.applyRotation('Z', 90, { x: 0, y: 0, z: 0 })
    // 회전 후 x 범위는 0~0, y 범위는 0~100
    expect(near(s.healthMetrics.totals.bbox.maxY, 100, 1e-6)).toBe(true)
    expect(near(s.healthMetrics.totals.bbox.maxX, 0, 1e-6)).toBe(true)
  })
})

describe('StageData.shallowClone', () => {
  const makeStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
    nodes: [
      { id: 1, x: 0, y: 0, z: 0, tags: [] },
      { id: 2, x: 100, y: 0, z: 0, tags: [] },
    ],
    elements: [
      { id: 1, type: 'CBEAM', startNode: 1, endNode: 2, propertyId: 10, orientation: [0, 0, 1] },
    ],
    rigids: [], properties: [{ id: 10, kind: 'TUBE', dims: [50, 40] }],
    materials: [], pointMasses: [],
  })

  it('새 인스턴스를 반환하되 데이터(nodeMap 등)는 공유한다', () => {
    const s = makeStage()
    const c = s.shallowClone()
    expect(c).not.toBe(s)            // 참조가 달라야 React stageData effect 가 재실행됨
    expect(c instanceof StageData).toBe(true)
    expect(c.nodeMap).toBe(s.nodeMap)   // 같은 (회전된) 데이터를 가리킴
    expect(c.elements).toBe(s.elements)
  })

  it('프로토타입 메서드가 정상 동작한다 (getNodePos)', () => {
    const s = makeStage()
    const c = s.shallowClone()
    const p = c.getNodePos(2)
    expect(p).toBeTruthy()
    expect(Number.isFinite(p.x)).toBe(true)
  })
})
