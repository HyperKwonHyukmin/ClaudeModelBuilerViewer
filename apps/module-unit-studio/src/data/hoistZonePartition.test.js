import { describe, it, expect } from 'vitest'
import { partitionZones, assignNodesToZones, anchoredBoundary } from './hoistZonePartition.js'
import { pipeNodeIds, dominantZLevel, polygonArea2D, selectWidestPoints } from './hoistZonePartition.js'
import { buildZoneLayout } from './hoistZonePartition.js'
import { reconcilePointsPerZone, zoneCountFor, buildZonePartitionView, countActiveZones } from './hoistZonePartition.js'
import { zoneShapeFor, reconcileShapePerZone, SHAPE_QUAD, SHAPE_LINE } from './hoistZonePartition.js'

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

describe('anchoredBoundary (무게중심 기준 분할)', () => {
  it('양 끝 경계(i=0,i=n)는 항상 lo/hi 로 정확', () => {
    expect(anchoredBoundary(0, 100, 30, 0, 3)).toBeCloseTo(0, 6)
    expect(anchoredBoundary(0, 100, 30, 3, 3)).toBeCloseTo(100, 6)
  })

  it('n=2(짝수) → 내부 경계가 정확히 앵커 위치', () => {
    expect(anchoredBoundary(0, 100, 30, 1, 2)).toBeCloseTo(30, 6)
    expect(anchoredBoundary(0, 100, 70, 1, 2)).toBeCloseTo(70, 6)
  })

  it('앵커=bbox 중앙이면 등분할과 동일(하위호환)', () => {
    // n=3, c=50 → 33.33.., 66.66..
    expect(anchoredBoundary(0, 100, 50, 1, 3)).toBeCloseTo(100 / 3, 6)
    expect(anchoredBoundary(0, 100, 50, 2, 3)).toBeCloseTo(200 / 3, 6)
  })

  it('앵커 비유한 → bbox 중앙 등분할로 폴백', () => {
    expect(anchoredBoundary(0, 100, undefined, 1, 2)).toBeCloseTo(50, 6)
    expect(anchoredBoundary(0, 100, NaN, 1, 2)).toBeCloseTo(50, 6)
  })

  it('n=3(홀수) → 앵커가 인덱스 중심(가운데 셀 내부)', () => {
    // c=30: i=1 → 0 + 30*(1/1.5)=20, i=2 → 30 + 70*(0.5/1.5)=53.33..
    expect(anchoredBoundary(0, 100, 30, 1, 3)).toBeCloseTo(20, 6)
    expect(anchoredBoundary(0, 100, 30, 2, 3)).toBeCloseTo(30 + 70 / 3, 6)
    // 가운데 셀 [20, 53.33] 안에 c=30 이 포함
    expect(30).toBeGreaterThan(anchoredBoundary(0, 100, 30, 1, 3))
    expect(30).toBeLessThan(anchoredBoundary(0, 100, 30, 2, 3))
  })
})

describe('partitionZones — COG 앵커', () => {
  it('2×2 anchor={x:30,y:70} → 분할선 교점이 COG', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2], anchor: { x: 30, y: 70 } })
    expect(z).toHaveLength(4)
    // Y 밴드 경계 = 70(=cogY), X 하위 경계 = 30(=cogX)
    const ys = new Set(z.flatMap(c => [c.yMin, c.yMax]))
    const xs = new Set(z.flatMap(c => [c.xMin, c.xMax]))
    expect([...ys]).toEqual(expect.arrayContaining([0, 70, 100]))
    expect([...xs]).toEqual(expect.arrayContaining([0, 30, 100]))
    // 좌하 셀 = [0..30]×[0..70]
    expect(z.find(c => c.xMin === 0 && c.yMin === 0)).toMatchObject({ xMax: 30, yMax: 70 })
  })

  it('anchor 없으면 등분할(기존 동작 불변)', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    expect(z.find(c => c.xMin === 0 && c.yMin === 0)).toMatchObject({ xMax: 50, yMax: 50 })
  })

  it('3×3 anchor → 격자 중심이 COG(가운데 셀이 COG 를 포함)', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [3, 3, 3], anchor: { x: 40, y: 60 } })
    expect(z).toHaveLength(9)
    const mid = z.find(c => c.bandIndex === 1 && c.subIndex === 1)
    expect(40).toBeGreaterThanOrEqual(mid.xMin)
    expect(40).toBeLessThanOrEqual(mid.xMax)
    expect(60).toBeGreaterThanOrEqual(mid.yMin)
    expect(60).toBeLessThanOrEqual(mid.yMax)
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

describe('buildZoneLayout (per-zone counts)', () => {
  const lbbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }
  const entries = [
    [1, { x: 5, y: 5, z: 0 }], [2, { x: 5, y: 95, z: 0 }], [3, { x: 45, y: 50, z: 0 }],
    [4, { x: 55, y: 5, z: 0 }], [5, { x: 95, y: 95, z: 0 }], [6, { x: 95, y: 5, z: 0 }],
  ]
  it('각 구역에서 구역별 카운트로 그룹 생성', () => {
    const r = buildZoneLayout(
      { bbox: lbbox, nodeEntries: entries, pipeNodes: new Set(), tolMm: 1 },
      { bandAxis: 'x', bands: [1, 1], includePipe: true, pointsPerZone: [[3], [3]] },
    )
    expect(r.ok).toBe(true)
    expect(r.groups).toHaveLength(2)
    expect(r.groups[0]).toHaveLength(3)
  })
  it('구역마다 다른 카운트 적용 — 좌3점/우2점', () => {
    const r = buildZoneLayout(
      { bbox: lbbox, nodeEntries: entries, pipeNodes: new Set(), tolMm: 1 },
      { bandAxis: 'x', bands: [1, 1], includePipe: true, pointsPerZone: [[3], [2]] },
    )
    expect(r.ok).toBe(true)
    expect(r.groups).toHaveLength(2)
    expect(r.groups[0]).toHaveLength(3)
    expect(r.groups[1]).toHaveLength(2)
  })
  it('includePipe=false 면 배관 노드 제외 → 충분치 않으면 그 구역 빠짐', () => {
    const r = buildZoneLayout(
      { bbox: lbbox, nodeEntries: entries, pipeNodes: new Set([4, 5, 6]), tolMm: 1 },
      { bandAxis: 'x', bands: [1, 1], includePipe: false, pointsPerZone: [[3], [3]] },
    )
    expect(r.ok).toBe(true)
    expect(r.groups).toHaveLength(1)
  })
  it('모든 구역이 불가면 ok:false', () => {
    const r = buildZoneLayout(
      { bbox: lbbox, nodeEntries: entries, pipeNodes: new Set(), tolMm: 1 },
      { bandAxis: 'x', bands: [1, 1], includePipe: true, pointsPerZone: [[4], [4]] },
    )
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
  it('null(미설정)은 기본값 경로, 명시적 0 은 제외값(0) — Number(null)=0 오해 방지', () => {
    const cfg = { pointsPerZone: [[null, 0]] }
    expect(zoneCountFor(cfg, 0, 0, 2)).toBe(2)   // null → 기본값(미설정)
    expect(zoneCountFor(cfg, 0, 1, 2)).toBe(0)   // 명시적 0 → 0(제외)
  })
})

describe('buildZonePartitionView', () => {
  const vbbox = { minX: 0, maxX: 100, minY: 0, maxY: 50, minZ: 0, maxZ: 0 }
  it('셀 수 = Σbands, 라벨(행)·포인트수 반영', () => {
    const config = { bandAxis: 'y', bands: [1, 2], pointsPerZone: [[3], [2, 4]] }
    const view = buildZonePartitionView(vbbox, config, [], new Set())
    expect(view.cells).toHaveLength(3)
    expect(view.cells[0].label).toBe('1행·1')
    expect(view.cells[1].label).toBe('2행·1')
    expect(view.cells[1].points).toBe(2)
    expect(view.cells[2].points).toBe(4)
  })
  it('bandAxis=x 라벨은 열', () => {
    const view = buildZonePartitionView(vbbox, { bandAxis: 'x', bands: [1], pointsPerZone: [[3]] }, [], new Set())
    expect(view.cells[0].label).toBe('1열·1')
  })
  it('anchor 없으면 cog=null, 있으면 COG 화면좌표 반환', () => {
    const noAnchor = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [2] }, [], new Set())
    expect(noAnchor.cog).toBeNull()
    const withAnchor = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [2], anchor: { x: 50, y: 25 } }, [], new Set())
    expect(withAnchor.cog).toMatchObject({ x: 250, y: 500 })
  })
  it('viewBox 종횡비 = 평면도(가로=Y범위, 세로=X범위) → 500x1000', () => {
    const view = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [1] }, [], new Set())
    expect(view.viewBox.w).toBe(500)
    expect(view.viewBox.h).toBe(1000)
  })
  it('평면도 방향 — +X는 위(작은 svgY), +Y는 왼쪽(작은 svgX)', () => {
    const entries = [[1, { x: 100, y: 50, z: 0 }], [2, { x: 0, y: 0, z: 0 }]]
    const view = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [1] }, entries, new Set())
    expect(view.dots[0].x).toBeCloseTo(0)    // maxY → 왼쪽
    expect(view.dots[0].y).toBeCloseTo(0)    // maxX → 위
    expect(view.dots[1].x).toBeCloseTo(500)  // minY → 오른쪽
    expect(view.dots[1].y).toBeCloseTo(1000) // minX → 아래
  })
  it('thin: 노드수 < 포인트수면 true', () => {
    const entries = [[1, { x: 10, y: 10, z: 0 }], [2, { x: 20, y: 20, z: 0 }]]
    const view = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [1], pointsPerZone: [[4]] }, entries, new Set())
    expect(view.cells[0].nodeCount).toBe(2)
    expect(view.cells[0].thin).toBe(true)
  })
  it('배관 노드 표시(pipe 플래그)', () => {
    const entries = [[1, { x: 10, y: 10, z: 0 }], [2, { x: 20, y: 20, z: 0 }]]
    const view = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [1] }, entries, new Set([2]))
    expect(view.dots.find(d => d.pipe)).toBeTruthy()
    expect(view.dots.find(d => !d.pipe)).toBeTruthy()
  })
  it('degenerate bbox(폭 0)도 NaN 없이 동작', () => {
    const view = buildZonePartitionView({ minX: 10, maxX: 10, minY: 0, maxY: 100 }, { bandAxis: 'y', bands: [1] }, [[1, { x: 10, y: 50, z: 0 }]], new Set())
    expect(Number.isFinite(view.cells[0].x)).toBe(true)
    expect(Number.isFinite(view.cells[0].w)).toBe(true)
  })
  it('노드 과다 시 다운샘플(maxDots 상한)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => [i + 1, { x: (i % 100), y: Math.floor(i / 100), z: 0 }])
    const view = buildZonePartitionView({ minX: 0, maxX: 100, minY: 0, maxY: 50 }, { bandAxis: 'y', bands: [1] }, many, new Set(), { maxDots: 100 })
    expect(view.dots.length).toBe(100)
  })
  it('degenerate bbox(높이 0)도 NaN 없이 동작', () => {
    const view = buildZonePartitionView({ minX: 0, maxX: 100, minY: 50, maxY: 50 }, { bandAxis: 'y', bands: [1] }, [[1, { x: 50, y: 50, z: 0 }]], new Set())
    expect(Number.isFinite(view.cells[0].y)).toBe(true)
    expect(Number.isFinite(view.cells[0].h)).toBe(true)
  })
  it('극단 종횡비(X 1000:1)도 W ≥ 120 보장', () => {
    const view = buildZonePartitionView({ minX: 0, maxX: 1000, minY: 0, maxY: 1 }, { bandAxis: 'y', bands: [1] }, [], new Set())
    expect(view.viewBox.w).toBe(120)
    expect(view.viewBox.h).toBe(1000)
  })
  it('0점 셀은 excluded=true, points<=0', () => {
    const config = { bandAxis: 'y', bands: [1, 1], pointsPerZone: [[0], [3]] }
    const view = buildZonePartitionView(vbbox, config, [], new Set())
    expect(view.cells[0].excluded).toBe(true)
    expect(view.cells[0].points).toBe(0)
    expect(view.cells[1].excluded).toBe(false)
  })
  it('자동(-1) 셀은 활성(excluded=false), 노드 부족 판정은 최소 2점 기준 (2026-07-03)', () => {
    const config = { bandAxis: 'y', bands: [1, 1], pointsPerZone: [[-1], [-1]] }
    // 첫 구역(y<25)에만 노드 2개 — 자동 셀도 최소 2노드면 thin 아님, 0~1노드면 thin.
    const entries = [[1, { x: 10, y: 10, z: 0 }], [2, { x: 20, y: 20, z: 0 }]]
    const view = buildZonePartitionView(vbbox, config, entries, new Set())
    expect(view.cells[0].excluded).toBe(false)
    expect(view.cells[0].points).toBe(-1)
    expect(view.cells[0].thin).toBe(false)   // 노드 2 ≥ 최소 2
    expect(view.cells[1].thin).toBe(true)    // 노드 0 < 최소 2
  })
})

describe('countActiveZones', () => {
  it('기본(2점 초기값 흐름) [1,1] → 2 그룹', () => {
    expect(countActiveZones([1, 1], [[2], [2]])).toBe(2)
  })
  it('3×3 중 0점(제외) 셀 제외 — 3개만 활성', () => {
    // 9구역 중 3개만 포인트>0, 나머지 0(제외)
    const ppz = [[3, 0, 0], [0, 4, 0], [0, 0, 2]]
    expect(countActiveZones([3, 3, 3], ppz)).toBe(3)
  })
  it('값 미설정(undefined) 셀은 활성으로 카운트(기본 2점)', () => {
    // ppz 가 bands 보다 부족 — 미설정 셀은 명시적 0 이 아니므로 활성
    expect(countActiveZones([1, 1, 1], [[3]])).toBe(3)
  })
  it('모두 0이면 0 그룹', () => {
    expect(countActiveZones([1, 1], [[0], [0]])).toBe(0)
  })
  it('자동(-1) 셀은 활성으로 카운트 (2026-07-03)', () => {
    expect(countActiveZones([1, 1], [[-1], [0]])).toBe(1)
    expect(countActiveZones([1, 1], [[-1], [4]])).toBe(2)
  })
  it('null(미설정) 셀은 활성, 명시적 0 만 제외 (Number(null)=0 오해 방지)', () => {
    // 왼쪽 셀 null → 활성, 오른쪽 셀 0 → 제외 → 활성 1개
    expect(countActiveZones([1, 1], [[null], [0]])).toBe(1)
    // null 과 undefined(누락) 모두 활성
    expect(countActiveZones([1, 1], [[null], [4]])).toBe(2)
  })
})

describe('buildZoneLayout — 0점 구역 제외', () => {
  it('0점 구역은 그룹으로 만들지 않는다', () => {
    // 두 구역 각각 노드 충분. 왼쪽(x<50) 0점(제외), 오른쪽(x>=50) 2점.
    const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }
    const nodeEntries = [
      [1, { x: 10, y: 10, z: 0 }], [2, { x: 20, y: 20, z: 0 }],  // 왼쪽 구역
      [3, { x: 70, y: 10, z: 0 }], [4, { x: 80, y: 20, z: 0 }],  // 오른쪽 구역
    ]
    const config = { bandAxis: 'x', bands: [1, 1], includePipe: true, pointsPerZone: [[0], [2]] }
    const res = buildZoneLayout({ bbox, nodeEntries, pipeNodes: new Set(), tolMm: 10 }, config)
    expect(res.ok).toBe(true)
    expect(res.groups).toHaveLength(1)  // 오른쪽만
  })
})

describe('구역별 4점 형상(shapePerZone) — 사용자 규칙 2026-07-03', () => {
  it('zoneShapeFor — 설정값 반환, 미설정/비정상은 기본 quad', () => {
    const config = { shapePerZone: [['line', 'quad'], [undefined, 'weird']] }
    expect(zoneShapeFor(config, 0, 0)).toBe('line')
    expect(zoneShapeFor(config, 0, 1)).toBe('quad')
    expect(zoneShapeFor(config, 1, 0)).toBe('quad')   // 미설정 → 기본
    expect(zoneShapeFor(config, 1, 1)).toBe('quad')   // 비정상 → 기본
    expect(zoneShapeFor(null, 0, 0)).toBe('quad')     // config 없음 → 기본
    expect(zoneShapeFor({}, 5, 5, 'line')).toBe('line') // 명시 기본값 존중
  })

  it('reconcileShapePerZone — bands 모양에 맞춰 보존/확장, 부족분은 quad', () => {
    const prev = [['line']]
    const next = reconcileShapePerZone([2, 1], prev)
    expect(next).toEqual([['line', 'quad'], ['quad']])
    expect(SHAPE_QUAD).toBe('quad')
    expect(SHAPE_LINE).toBe('line')
  })

  it('buildZonePartitionView — 셀에 shape 필드가 실린다', () => {
    const bb = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }
    const cfg = { bandAxis: 'y', bands: [1, 1], pointsPerZone: [[4], [4]], shapePerZone: [['quad'], ['line']] }
    const view = buildZonePartitionView(bb, cfg, [], null)
    const c0 = view.cells.find(c => c.bandIndex === 0 && c.subIndex === 0)
    const c1 = view.cells.find(c => c.bandIndex === 1 && c.subIndex === 0)
    expect(c0.shape).toBe('quad')
    expect(c1.shape).toBe('line')
  })
})
