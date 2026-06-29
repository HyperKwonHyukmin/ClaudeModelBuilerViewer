import { describe, it, expect } from 'vitest'
import {
  projectNodesXY, clampDivider, computeInitialDividers, splitRegions,
  assignNodesToRegions, fitTransform,
} from './hoistAutoLayout.js'

const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }
const fakeStage = { nodeMap: new Map([
  [1, { x: 10, y: 10, z: 5 }],
  [2, { x: 90, y: 10, z: 5 }],
  [3, { x: 10, y: 90, z: 5 }],
  [4, { x: 90, y: 90, z: 5 }],
]) }

describe('projectNodesXY', () => {
  it('z 무시하고 id/x/y 보존', () => {
    const p = projectNodesXY(fakeStage)
    expect(p).toHaveLength(4)
    expect(p.find(n => n.id === 1)).toEqual({ id: 1, x: 10, y: 10 })
  })
  it('nodeMap 없으면 빈 배열', () => {
    expect(projectNodesXY(null)).toEqual([])
  })
})

describe('computeInitialDividers', () => {
  it('분할선 1개면 무게중심에 배치 (divX=2,divY=2)', () => {
    const { dividersX, dividersY } = computeInitialDividers(bbox, { x: 40, y: 60 }, 2, 2)
    expect(dividersX).toEqual([40]); expect(dividersY).toEqual([60])
  })
  it('칸 1개면 분할선 없음 (divX=1)', () => {
    const { dividersX, dividersY } = computeInitialDividers(bbox, { x: 40, y: 60 }, 1, 2)
    expect(dividersX).toEqual([]); expect(dividersY).toEqual([60])
  })
  it('분할선 2개 이상이면 균등 분할 (divX=3)', () => {
    const { dividersX } = computeInitialDividers(bbox, { x: 40, y: 60 }, 3, 1)
    expect(dividersX[0]).toBeCloseTo(100 / 3); expect(dividersX[1]).toBeCloseTo(200 / 3)
  })
  it('무게중심이 범위 밖이면 중앙 폴백', () => {
    const { dividersX } = computeInitialDividers(bbox, { x: 999, y: 0 }, 2, 1)
    expect(dividersX).toEqual([50])
  })
})

describe('splitRegions', () => {
  it('구역 개수 = divX*divY, 경계 정확', () => {
    const regions = splitRegions(bbox, [50], [50])
    expect(regions).toHaveLength(4)
    expect(regions.find(r => r.id === 'c0_r0')).toMatchObject({ minX: 0, maxX: 50, minY: 0, maxY: 50 })
    expect(regions.find(r => r.id === 'c1_r1')).toMatchObject({ minX: 50, maxX: 100, minY: 50, maxY: 100 })
  })
})

describe('assignNodesToRegions', () => {
  it('각 노드가 올바른 구역에', () => {
    const regions = splitRegions(bbox, [50], [50])
    const a = assignNodesToRegions(projectNodesXY(fakeStage), regions, [50], [50])
    expect(a['c0_r0']).toEqual([1])  // (10,10)
    expect(a['c1_r1']).toEqual([4])  // (90,90)
  })
  it('경계선 위 노드는 낮은 인덱스 구역', () => {
    const stage = { nodeMap: new Map([[1, { x: 50, y: 10, z: 0 }]]) }
    const regions = splitRegions(bbox, [50], [])
    const a = assignNodesToRegions(projectNodesXY(stage), regions, [50], [])
    expect(a['c0_r0']).toEqual([1])  // x=50 → 낮은 col 0
  })
})

describe('clampDivider', () => {
  it('범위로 클램프', () => {
    expect(clampDivider(5, 10, 20)).toBe(10)
    expect(clampDivider(25, 10, 20)).toBe(20)
    expect(clampDivider(15, 10, 20)).toBe(15)
  })
})

describe('fitTransform', () => {
  it('toScreen/toModel 라운드트립', () => {
    const t = fitTransform(bbox, 200, 200, 0)
    const s = t.toScreen(0, 0)
    const m = t.toModel(s.sx, s.sy)
    expect(m.x).toBeCloseTo(0); expect(m.y).toBeCloseTo(0)
  })
  it('y 반전 — 모델 maxY 가 화면 위쪽(작은 sy)', () => {
    const t = fitTransform(bbox, 200, 200, 0)
    expect(t.toScreen(0, 100).sy).toBeLessThan(t.toScreen(0, 0).sy)
  })
})
