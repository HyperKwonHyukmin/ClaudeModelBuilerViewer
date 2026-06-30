import { describe, it, expect } from 'vitest'
import { partitionZones, assignNodesToZones } from './hoistZonePartition.js'
import { pipeNodeIds, dominantZLevel, polygonArea2D, selectWidestPoints } from './hoistZonePartition.js'
import { buildZoneLayout } from './hoistZonePartition.js'
import { reconcilePointsPerZone, zoneCountFor } from './hoistZonePartition.js'

const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }

describe('partitionZones', () => {
  it('bandAxis=y, bands=[1,2] → 행1 전폭 + 행2 좌/우 = 3구역', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [1, 2] })
    expect(z).toHaveLength(3)
    expect(z[0]).toMatchObject({ xMin: 0, xMax: 100, yMin: 0, yMax: 50 })
    expect(z[1]).toMatchObject({ xMin: 0, xMax: 50, yMin: 50, yMax: 100 })
    expect(z[2]).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
  })

  it('bands=[2,2] → 2x2 = 4구역', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    expect(z).toHaveLength(4)
    const bottomLeft = z.find(c => c.xMin === 0 && c.xMax === 50 && c.yMin === 0 && c.yMax === 50)
    const topRight = z.find(c => c.xMin === 50 && c.xMax === 100 && c.yMin === 50 && c.yMax === 100)
    expect(bottomLeft).toMatchObject({ xMin: 0, xMax: 50, yMin: 0, yMax: 50 })
    expect(topRight).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
  })

  it('bandAxis=x, bands=[1,2] → 열 분할(대칭)', () => {
    const z = partitionZones(bbox, { bandAxis: 'x', bands: [1, 2] })
    expect(z).toHaveLength(3)
    expect(z[0]).toMatchObject({ xMin: 0, xMax: 50, yMin: 0, yMax: 100 })
    expect(z[1]).toMatchObject({ xMin: 50, xMax: 100, yMin: 0, yMax: 50 })
    expect(z[2]).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
  })
})

describe('assignNodesToZones', () => {
  it('노드를 XY 위치로 셀에 배정, 경계는 하한 셀', () => {
    const zones = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    const entries = [
      [1, { x: 10, y: 10, z: 0 }],
      [2, { x: 90, y: 90, z: 0 }],
      [3, { x: 50, y: 10, z: 0 }],
      [4, { x: 100, y: 100, z: 0 }],
    ]
    const map = assignNodesToZones(zones, entries)
    const total = [...map.values()].reduce((n, a) => n + a.length, 0)
    expect(total).toBe(4)
    const rightLowerCell = zones.find(z => z.xMin === 50 && z.yMax === 50)
    expect(map.get(rightLowerCell.id).some(nd => nd.id === 3)).toBe(false)
    // 경계 노드(id 3, x=50)는 좌하단 셀로 배정(하한 셀 우선)
    const leftLowerCell = zones.find(z => z.xMin === 0 && z.xMax === 50 && z.yMax === 50)
    expect(map.get(leftLowerCell.id).some(nd => nd.id === 3)).toBe(true)
    // 전역 최대 노드(id 4, 100,100)는 우상단 셀로 배정
    const topRightCell = zones.find(z => z.xMin === 50 && z.yMin === 50)
    expect(map.get(topRightCell.id).some(nd => nd.id === 4)).toBe(true)
  })

  it('non-finite x/y(NaN/null/Infinity) 노드는 배정에서 제외', () => {
    const zones = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    const entries = [
      [1, { x: 10, y: 10, z: 0 }],
      [2, { x: NaN, y: 20, z: 0 }],
      [3, null],
      [4, { x: 30, y: Infinity, z: 0 }],
    ]
    const map = assignNodesToZones(zones, entries)
    const total = [...map.values()].reduce((n, a) => n + a.length, 0)
    expect(total).toBe(1)
    const assigned = [...map.values()].flat()
    expect(assigned.map(nd => nd.id)).toEqual([1])
  })
})

describe('pipeNodeIds', () => {
  it("category==='Pipe' 요소의 양 끝 노드만 수집, Structure 제외", () => {
    const elements = [
      { type: 'BEAM', category: 'Pipe', startNode: 1, endNode: 2 },
      { type: 'BEAM', category: 'Structure', startNode: 2, endNode: 3 },
      { type: 'BEAM', category: 'Pipe', startNode: 3, endNode: 4 },
    ]
    const s = pipeNodeIds(elements)
    expect([...s].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })
  it('빈/누락 입력은 빈 Set', () => {
    expect(pipeNodeIds([]).size).toBe(0)
    expect(pipeNodeIds(null).size).toBe(0)
  })
})

describe('dominantZLevel', () => {
  const nd = (id, x, y, z) => ({ id, x, y, z })
  it('허용오차 내 노드가 가장 많은 레벨을 고른다', () => {
    const nodes = [
      nd(1, 0, 0, 0), nd(2, 10, 0, 1), nd(3, 0, 10, 2),
      nd(4, 0, 0, 100), nd(5, 10, 0, 101),
    ]
    const lvl = dominantZLevel(nodes, 5, 2)
    expect(lvl.members.map(m => m.id).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })
  it('어떤 레벨도 minCount 미만이면 null', () => {
    const nodes = [nd(1, 0, 0, 0), nd(2, 0, 0, 100)]
    expect(dominantZLevel(nodes, 5, 2)).toBeNull()
  })
  it('동률이면 XY 스팬 넓은 레벨', () => {
    const nodes = [
      nd(1, 0, 0, 0), nd(2, 5, 0, 0),
      nd(3, 0, 0, 100), nd(4, 100, 100, 100),
    ]
    const lvl = dominantZLevel(nodes, 5, 2)
    expect(lvl.members.map(m => m.id).sort((a, b) => a - b)).toEqual([3, 4])
  })
})

describe('polygonArea2D / selectWidestPoints', () => {
  const nd = (id, x, y) => ({ id, x, y, z: 0 })
  it('polygonArea2D: 단위사각형 면적 = 1', () => {
    expect(polygonArea2D([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeCloseTo(1)
  })
  it('n=2: 최원 쌍', () => {
    const ids = selectWidestPoints([nd(1, 0, 0), nd(2, 1, 0), nd(3, 100, 0)], 2)
    expect(ids.sort((a, b) => a - b)).toEqual([1, 3])
  })
  it('n=3: 면적 최대 삼각형(가운데 점 제외)', () => {
    const ids = selectWidestPoints([nd(1, 0, 0), nd(2, 50, 1), nd(3, 100, 0), nd(4, 50, 100)], 3)
    expect(ids).toContain(1); expect(ids).toContain(3); expect(ids).toContain(4)
    expect(ids).not.toContain(2)
  })
  it('후보 < n 이면 가능한 만큼만', () => {
    expect(selectWidestPoints([nd(1, 0, 0), nd(2, 1, 1)], 4).sort((a, b) => a - b)).toEqual([1, 2])
  })
})

describe('buildZoneLayout', () => {
  const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }
  const entries = [
    [1, { x: 5, y: 5, z: 0 }], [2, { x: 5, y: 95, z: 0 }], [3, { x: 45, y: 50, z: 0 }],
    [4, { x: 55, y: 5, z: 0 }], [5, { x: 95, y: 95, z: 0 }], [6, { x: 95, y: 5, z: 0 }],
  ]

  it('각 구역에서 n점 그룹 생성', () => {
    const r = buildZoneLayout({ bbox, nodeEntries: entries, pipeNodes: new Set(), tolMm: 1 }, { bandAxis: 'x', bands: [1, 1], includePipe: true }, 3)
    expect(r.ok).toBe(true)
    expect(r.groups).toHaveLength(2)
    expect(r.groups[0]).toHaveLength(3)
  })

  it('includePipe=false 면 배관 노드 제외 → 충분치 않으면 그 구역 빠짐', () => {
    const r = buildZoneLayout(
      { bbox, nodeEntries: entries, pipeNodes: new Set([4, 5, 6]), tolMm: 1 },
      { bandAxis: 'x', bands: [1, 1], includePipe: false }, 3,
    )
    expect(r.ok).toBe(true)
    expect(r.groups).toHaveLength(1)
  })

  it('모든 구역이 불가면 ok:false', () => {
    const r = buildZoneLayout({ bbox, nodeEntries: entries, pipeNodes: new Set(), tolMm: 1 }, { bandAxis: 'x', bands: [1, 1], includePipe: true }, 4)
    expect(r.ok).toBe(false)
    expect(r.reason).toBeTruthy()
  })
})

describe('reconcilePointsPerZone', () => {
  it('bands 모양과 길이가 일치한다', () => {
    const r = reconcilePointsPerZone([1, 2], null, [2, 3, 4], 3)
    expect(r.map(row => row.length)).toEqual([1, 2])
  })
  it('기존 값을 위치별로 보존한다', () => {
    const r = reconcilePointsPerZone([1, 2], [[4], [2, 3]], [2, 3, 4], 3)
    expect(r).toEqual([[4], [2, 3]])
  })
  it('새 셀은 기본값으로 채운다', () => {
    const r = reconcilePointsPerZone([1, 2], [[4]], [2, 3, 4], 3)
    expect(r).toEqual([[4], [3, 3]])
  })
  it('하위구역 축소 시 앞에서부터 자른다', () => {
    const r = reconcilePointsPerZone([2], [[2, 3, 4]], [2, 3, 4], 3)
    expect(r).toEqual([[2, 3]])
  })
  it('유효 범위 밖 값은 가장 가까운 유효값으로 클램프(ceiling 2→3)', () => {
    const r = reconcilePointsPerZone([1], [[2]], [3, 4], 3)
    expect(r).toEqual([[3]])
  })
  it('유효 범위 밖 값은 가장 가까운 유효값으로 클램프(above-range 5→4)', () => {
    const r = reconcilePointsPerZone([1], [[5]], [2, 3, 4], 3)
    expect(r).toEqual([[4]])
  })
  it('bands가 null이면 [1] 폴백', () => {
    const r = reconcilePointsPerZone(null, null, [2, 3, 4], 3)
    expect(r).toEqual([[3]])
  })
  it('validPoints가 빈 배열이면 [2,3,4] 폴백', () => {
    const r = reconcilePointsPerZone([1], null, [], 3)
    expect(r).toEqual([[3]])
  })
})

describe('zoneCountFor', () => {
  const config = { pointsPerZone: [[3], [2, 4]] }
  it('지정된 셀 값을 반환', () => {
    expect(zoneCountFor(config, 1, 1, 3)).toBe(4)
  })
  it('누락 셀은 기본값', () => {
    expect(zoneCountFor(config, 5, 5, 3)).toBe(3)
    expect(zoneCountFor({}, 0, 0, 2)).toBe(2)
  })
})
