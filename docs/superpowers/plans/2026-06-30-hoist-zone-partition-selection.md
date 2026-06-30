# 구역 기반 권상 위치 선정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** XY 풋프린트를 행별 가변 분할한 각 구역에서 Z 우세 레벨·면적 최대화로 권상점을 결정적으로 선정하고, C# 자세안정성 파이프라인으로 검증·랭킹하는 2번째 방식을 추가한다.

**Architecture:** 순수 JS 모듈(`hoistZonePartition`, `hoistStabilityAdapter`)이 분할·선택·리포트 변환을 담당하고, 스토어 액션 `zoneSelectHoistPositions`가 포인트수 변형을 스윕하며 기존 `host.runStabilityAnalysis`로 검증한다. UI는 기존 `HoistAutoResultModal`을 탭 2개("구역 기반"/"옵티마이저")로 재구성해 결과 리스트/미리보기/적용을 공유한다. **C# 엔진 무변경.**

**Tech Stack:** React 19, Zustand 5, Vitest 4. 기존 `hoistCandidateRank.js`(랭킹), `applyAutoHoistGroups`(커밋), `buildPostureStabilityPayload`(페이로드) 재사용.

**참고 문서:** 설계 `docs/superpowers/specs/2026-06-30-hoist-zone-partition-selection-design.md`

---

## 파일 구조

| 파일 | 유형 | 책임 |
|---|---|---|
| `apps/module-unit-studio/src/data/hoistZonePartition.js` | 신규(순수) | 분할/노드배정/배관필터/Z우세레벨/면적선택/레이아웃 빌드 |
| `apps/module-unit-studio/src/data/hoistZonePartition.test.js` | 신규 | 위 단위테스트 |
| `apps/module-unit-studio/src/data/hoistStabilityAdapter.js` | 신규(순수) | 단일 레이아웃 report → 후보 형태 변환 |
| `apps/module-unit-studio/src/data/hoistStabilityAdapter.test.js` | 신규 | 어댑터 단위테스트 |
| `apps/module-unit-studio/src/store/useEditStore.js` | 수정 | `zoneSelectHoistPositions` 액션 + `zoneVariantPointCounts` 헬퍼 |
| `apps/module-unit-studio/src/store/useEditStore.test.js` | 수정 | zone 액션 통합테스트(mock host) |
| `apps/module-unit-studio/src/components/HoistZoneConfig.jsx` | 신규 | 구역 설정 폼(controlled) |
| `apps/module-unit-studio/src/components/HoistAutoResultModal.jsx` | 수정 | 탭 2개 재구성, 결과/미리보기/적용 공유 |

**작업 디렉터리:** 모든 명령은 `cd /c/Coding/WorkBenchSubModule/ModuleUnitStudio/apps/module-unit-studio` 기준. 테스트는 `npx vitest run <파일>`.

---

## Task 1: hoistZonePartition — 분할 + 노드 배정

**Files:**
- Create: `apps/module-unit-studio/src/data/hoistZonePartition.js`
- Test: `apps/module-unit-studio/src/data/hoistZonePartition.test.js`

- [ ] **Step 1: Write the failing test**

`hoistZonePartition.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { partitionZones, assignNodesToZones } from './hoistZonePartition.js'

const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }

describe('partitionZones', () => {
  it('bandAxis=y, bands=[1,2] → 행1 전폭 + 행2 좌/우 = 3구역', () => {
    const z = partitionZones(bbox, { bandAxis: 'y', bands: [1, 2] })
    expect(z).toHaveLength(3)
    // 행1(아래) 전폭
    expect(z[0]).toMatchObject({ xMin: 0, xMax: 100, yMin: 0, yMax: 50 })
    // 행2(위) 좌/우
    expect(z[1]).toMatchObject({ xMin: 0, xMax: 50, yMin: 50, yMax: 100 })
    expect(z[2]).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })
  })

  it('bands=[2,2] → 2x2 = 4구역', () => {
    expect(partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })).toHaveLength(4)
  })

  it('bandAxis=x, bands=[1,2] → 열 분할(대칭)', () => {
    const z = partitionZones(bbox, { bandAxis: 'x', bands: [1, 2] })
    expect(z).toHaveLength(3)
    expect(z[0]).toMatchObject({ xMin: 0, xMax: 50, yMin: 0, yMax: 100 })   // 열1 전높이
    expect(z[1]).toMatchObject({ xMin: 50, xMax: 100, yMin: 0, yMax: 50 })  // 열2 하
    expect(z[2]).toMatchObject({ xMin: 50, xMax: 100, yMin: 50, yMax: 100 })// 열2 상
  })
})

describe('assignNodesToZones', () => {
  it('노드를 XY 위치로 셀에 배정, 경계는 하한 셀', () => {
    const zones = partitionZones(bbox, { bandAxis: 'y', bands: [2, 2] })
    const entries = [
      [1, { x: 10, y: 10, z: 0 }],   // 좌하
      [2, { x: 90, y: 90, z: 0 }],   // 우상
      [3, { x: 50, y: 10, z: 0 }],   // 내부 경계 x=50 → 좌측 셀
      [4, { x: 100, y: 100, z: 0 }], // 전역 최대 → 우상 셀(상한 포함)
    ]
    const map = assignNodesToZones(zones, entries)
    const total = [...map.values()].reduce((n, a) => n + a.length, 0)
    expect(total).toBe(4)
    // 노드3(x=50 경계) 은 좌측 셀에 배정 → 어떤 셀이든 우측 셀엔 없음
    const rightLowerCell = zones.find(z => z.xMin === 50 && z.yMax === 50)
    expect(map.get(rightLowerCell.id).some(nd => nd.id === 3)).toBe(false)
    // 노드4(전역 최대) 는 정확히 1개 셀에 배정됨(상한 포함)
    expect(entries.length).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: FAIL — `partitionZones is not a function` (모듈 없음).

- [ ] **Step 3: Write minimal implementation**

`hoistZonePartition.js` (이 Task 범위 함수만):
```js
/**
 * 구역 기반 권상 위치 선정 — 순수 기하/선택 함수 모음.
 * three/스토어/네트워크 의존 없음(2D XY 수학) → 단위테스트 용이.
 */

/**
 * XY 풋프린트를 "행별 가변 분할"로 나눈다.
 * bandAxis 로 풋프린트를 bands.length 개 등간격 밴드로 자르고, 각 밴드를 직교축으로
 * 그 밴드의 하위구역 수만큼 등분한다. 각 셀 = 한 권상 그룹 후보.
 *
 * @param {{minX,maxX,minY,maxY}} bbox  모델 XY bbox(mm)
 * @param {{bandAxis:'x'|'y', bands:number[]}} config
 * @returns {Array<{id,bandIndex,subIndex,xMin,xMax,yMin,yMax}>}
 */
export function partitionZones(bbox, config) {
  const bandAxis = config?.bandAxis === 'x' ? 'x' : 'y'
  const bands = Array.isArray(config?.bands) && config.bands.length > 0 ? config.bands : [1]
  const xMin = bbox.minX, xMax = bbox.maxX, yMin = bbox.minY, yMax = bbox.maxY
  const bandCount = bands.length
  const zones = []
  let id = 0
  for (let bi = 0; bi < bandCount; bi++) {
    const subCount = Math.max(1, Math.floor(bands[bi]) || 1)
    let bxMin = xMin, bxMax = xMax, byMin = yMin, byMax = yMax
    if (bandAxis === 'y') {
      const step = (yMax - yMin) / bandCount
      byMin = yMin + bi * step
      byMax = bi === bandCount - 1 ? yMax : yMin + (bi + 1) * step
    } else {
      const step = (xMax - xMin) / bandCount
      bxMin = xMin + bi * step
      bxMax = bi === bandCount - 1 ? xMax : xMin + (bi + 1) * step
    }
    for (let si = 0; si < subCount; si++) {
      let zxMin = bxMin, zxMax = bxMax, zyMin = byMin, zyMax = byMax
      if (bandAxis === 'y') {
        const s = (bxMax - bxMin) / subCount
        zxMin = bxMin + si * s
        zxMax = si === subCount - 1 ? bxMax : bxMin + (si + 1) * s
      } else {
        const s = (byMax - byMin) / subCount
        zyMin = byMin + si * s
        zyMax = si === subCount - 1 ? byMax : byMin + (si + 1) * s
      }
      zones.push({ id: id++, bandIndex: bi, subIndex: si, xMin: zxMin, xMax: zxMax, yMin: zyMin, yMax: zyMax })
    }
  }
  return zones
}

/** 점이 속하는 첫 셀(순회 순서상 하한 셀 우선). 없으면 null. */
function zoneOf(zones, x, y) {
  for (const z of zones) {
    if (x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax) return z
  }
  return null
}

/**
 * 노드들을 XY 위치로 셀에 배정한다. 셀 경계 위 점은 순회 순서상 하한(먼저 나온) 셀로 들어가고,
 * 전역 최대 점은 마지막 셀의 상한 포함으로 정확히 1개 셀에 들어간다.
 *
 * @param {Array} zones  partitionZones 결과
 * @param {Iterable<[number,{x,y,z}]>} nodeEntries  [id,{x,y,z}] 순회 가능(예: [...nodeMap])
 * @returns {Map<number, Array<{id,x,y,z}>>}  zoneId → 노드 배열
 */
export function assignNodesToZones(zones, nodeEntries) {
  const map = new Map(zones.map(z => [z.id, []]))
  for (const [id, n] of nodeEntries ?? []) {
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
    const z = zoneOf(zones, n.x, n.y)
    if (z) map.get(z.id).push({ id, x: n.x, y: n.y, z: n.z })
  }
  return map
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: PASS (6 assertions across 4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/module-unit-studio/src/data/hoistZonePartition.js apps/module-unit-studio/src/data/hoistZonePartition.test.js
git commit -m "✨ feat: 구역 분할/노드 배정 (hoistZonePartition Task1)"
```

---

## Task 2: hoistZonePartition — 배관필터 · Z우세레벨 · 면적선택

**Files:**
- Modify: `apps/module-unit-studio/src/data/hoistZonePartition.js` (함수 추가)
- Test: `apps/module-unit-studio/src/data/hoistZonePartition.test.js` (describe 추가)

- [ ] **Step 1: Write the failing test** (기존 테스트 파일 하단에 append)

```js
import { pipeNodeIds, dominantZLevel, polygonArea2D, selectWidestPoints } from './hoistZonePartition.js'

describe('pipeNodeIds', () => {
  it("category==='Pipe' 요소의 양 끝 노드만 수집, Structure 제외", () => {
    const elements = [
      { type: 'BEAM', category: 'Pipe', startNode: 1, endNode: 2 },
      { type: 'BEAM', category: 'Structure', startNode: 2, endNode: 3 },
      { type: 'BEAM', category: 'Pipe', startNode: 3, endNode: 4 },
    ]
    const s = pipeNodeIds(elements)
    expect([...s].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    // 노드3 은 Pipe 요소에도 속하므로 포함, Structure-only 노드는 없음
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
      nd(1, 0, 0, 0), nd(2, 10, 0, 1), nd(3, 0, 10, 2),  // 레벨 z≈0 (3개, tol=5)
      nd(4, 0, 0, 100), nd(5, 10, 0, 101),               // 레벨 z≈100 (2개)
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
      nd(1, 0, 0, 0), nd(2, 5, 0, 0),       // z=0: 스팬 작음
      nd(3, 0, 0, 100), nd(4, 100, 100, 100), // z=100: 스팬 큼
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: FAIL — `pipeNodeIds is not a function`.

- [ ] **Step 3: Write minimal implementation** (`hoistZonePartition.js` 에 함수 추가)

```js
/**
 * Pipe 카테고리 요소의 양 끝 노드 ID 집합. includePipe=false 일 때 후보에서 제외하는 데 쓴다.
 * (외경 임계는 선택에 사용하지 않는다 — 단순 포함/제외 토글.)
 * @param {Array<{category,startNode,endNode}>} elements
 * @returns {Set<number>}
 */
export function pipeNodeIds(elements) {
  const s = new Set()
  for (const e of elements ?? []) {
    if (e?.category !== 'Pipe') continue
    if (e.startNode != null) s.add(e.startNode)
    if (e.endNode != null) s.add(e.endNode)
  }
  return s
}

/** XY 점 배열의 bbox 대각 길이(스팬). */
function xySpan(members) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const m of members) {
    if (m.x < minX) minX = m.x; if (m.x > maxX) maxX = m.x
    if (m.y < minY) minY = m.y; if (m.y > maxY) maxY = m.y
  }
  const dx = maxX - minX, dy = maxY - minY
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Z 우세 레벨 선택. 노드를 Z 오름차순으로 1D 클러스터링(레벨 대표 Z=첫 멤버 ±tol)한 뒤,
 * minCount 이상 레벨 중 멤버 최다(동률 시 XY 스팬 큰 쪽, 그래도 동률이면 Z 작은 쪽) 레벨을 돌려준다.
 * @returns {{refZ:number, members:Array<{id,x,y,z}>} | null}
 */
export function dominantZLevel(nodes, tolMm, minCount) {
  if (!nodes || nodes.length === 0) return null
  const tol = Number.isFinite(tolMm) && tolMm > 0 ? tolMm : 0
  const sorted = [...nodes].sort((a, b) => a.z - b.z)
  const levels = []
  let cur = null
  for (const n of sorted) {
    if (cur && Math.abs(n.z - cur.refZ) <= tol) cur.members.push(n)
    else { cur = { refZ: n.z, members: [n] }; levels.push(cur) }
  }
  const eligible = levels.filter(l => l.members.length >= minCount)
  if (eligible.length === 0) return null
  eligible.sort((a, b) => {
    if (b.members.length !== a.members.length) return b.members.length - a.members.length
    const sb = xySpan(b.members), sa = xySpan(a.members)
    if (sb !== sa) return sb - sa
    return a.refZ - b.refZ
  })
  return eligible[0]
}

/** 점들을 무게중심 기준 반시계 각도로 정렬(2D 볼록 순서) → 보타이 방지. */
function convexOrder(points) {
  if (points.length < 3) return [...points]
  let cx = 0, cy = 0
  for (const p of points) { cx += p.x; cy += p.y }
  cx /= points.length; cy /= points.length
  return [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
}

/** 정렬된(볼록) 점 배열의 면적(shoelace, 절댓값). */
export function polygonArea2D(pts) {
  const p = convexOrder(pts)
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length
    a += p[i].x * p[j].y - p[j].x * p[i].y
  }
  return Math.abs(a) / 2
}

function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy }

/**
 * XY 면적이 최대가 되도록 n 점을 그리디로 고른다.
 *  - 최원 쌍에서 시작 → 폴리곤 면적 최대화 점을 하나씩 추가.
 *  - 최종 순서는 볼록 정렬(보타이 방지)된 노드 ID.
 * @param {Array<{id,x,y}>} nodes
 * @param {number} n  2~4
 * @returns {number[]}  선택 노드 ID(볼록 순서), 길이 ≤ min(n, nodes.length)
 */
export function selectWidestPoints(nodes, n) {
  const k = Math.min(n, nodes.length)
  if (k <= 0) return []
  if (k === 1) return [nodes[0].id]
  if (nodes.length <= k) return convexOrder(nodes).map(p => p.id)
  // 최원 쌍
  let pair = [0, 1], bestD = -1
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const d = dist2(nodes[i], nodes[j])
      if (d > bestD) { bestD = d; pair = [i, j] }
    }
  const chosen = [nodes[pair[0]], nodes[pair[1]]]
  const used = new Set(pair)
  while (chosen.length < k) {
    let pick = -1, pickArea = -1
    for (let i = 0; i < nodes.length; i++) {
      if (used.has(i)) continue
      const area = polygonArea2D([...chosen, nodes[i]])
      if (area > pickArea) { pickArea = area; pick = i }
    }
    if (pick < 0) break
    chosen.push(nodes[pick]); used.add(pick)
  }
  return convexOrder(chosen).map(p => p.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: PASS (Task1 + Task2 모든 테스트).

- [ ] **Step 5: Commit**

```bash
git add apps/module-unit-studio/src/data/hoistZonePartition.js apps/module-unit-studio/src/data/hoistZonePartition.test.js
git commit -m "✨ feat: 배관필터·Z우세레벨·면적최대선택 (hoistZonePartition Task2)"
```

---

## Task 3: hoistZonePartition — buildZoneLayout 합성

**Files:**
- Modify: `apps/module-unit-studio/src/data/hoistZonePartition.js`
- Test: `apps/module-unit-studio/src/data/hoistZonePartition.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
import { buildZoneLayout } from './hoistZonePartition.js'

describe('buildZoneLayout', () => {
  const bbox = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 }
  // 좌/우 두 구역(bandAxis=x, bands=[1,1]) 각각 같은 z 레벨에 노드 3개씩
  const entries = [
    [1, { x: 5, y: 5, z: 0 }], [2, { x: 5, y: 95, z: 0 }], [3, { x: 45, y: 50, z: 0 }],   // 좌 구역
    [4, { x: 55, y: 5, z: 0 }], [5, { x: 95, y: 95, z: 0 }], [6, { x: 95, y: 5, z: 0 }],  // 우 구역
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
    // 우 구역(4,5,6)은 전부 배관 → 3점 불가 → 좌 구역만 남음
    expect(r.ok).toBe(true)
    expect(r.groups).toHaveLength(1)
  })

  it('모든 구역이 불가면 ok:false', () => {
    const r = buildZoneLayout({ bbox, nodeEntries: entries, pipeNodes: new Set(), tolMm: 1 }, { bandAxis: 'x', bands: [1, 1], includePipe: true }, 4)
    // 구역당 3노드뿐 → 4점 불가
    expect(r.ok).toBe(false)
    expect(r.reason).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: FAIL — `buildZoneLayout is not a function`.

- [ ] **Step 3: Write minimal implementation** (append)

```js
/**
 * 구역 분할 → 구역별 (배관필터 → Z우세레벨 → 면적최대 n점) → 그룹 배열.
 * 어떤 구역이 n점 불가면 그 구역은 빠지고 남은 구역으로 빌드한다(부분 실패 허용).
 *
 * @param {{bbox, nodeEntries:Iterable<[number,{x,y,z}]>, pipeNodes:Set<number>, tolMm:number}} input
 * @param {{bandAxis:'x'|'y', bands:number[], includePipe:boolean}} config
 * @param {number} pointsPerGroup  2~4
 * @returns {{ok:true, groups:number[][]} | {ok:false, reason:string}}
 */
export function buildZoneLayout(input, config, pointsPerGroup) {
  const { bbox, nodeEntries, pipeNodes, tolMm } = input
  const zones = partitionZones(bbox, config)
  const byZone = assignNodesToZones(zones, nodeEntries)
  const groups = []
  for (const z of zones) {
    let cand = byZone.get(z.id) ?? []
    if (!config.includePipe && pipeNodes && pipeNodes.size > 0) {
      cand = cand.filter(nd => !pipeNodes.has(nd.id))
    }
    const level = dominantZLevel(cand, tolMm, pointsPerGroup)
    if (!level) continue
    const ids = selectWidestPoints(level.members, pointsPerGroup)
    if (ids.length >= 2) groups.push(ids)
  }
  if (groups.length === 0) {
    return { ok: false, reason: '구역에서 동일 Z레벨 권상점을 충분히 찾지 못했습니다.' }
  }
  return { ok: true, groups }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: PASS (전체).

- [ ] **Step 5: Commit**

```bash
git add apps/module-unit-studio/src/data/hoistZonePartition.js apps/module-unit-studio/src/data/hoistZonePartition.test.js
git commit -m "✨ feat: buildZoneLayout 구역→그룹 합성 (hoistZonePartition Task3)"
```

---

## Task 4: hoistStabilityAdapter — 단일 레이아웃 report → 후보 변환

**Files:**
- Create: `apps/module-unit-studio/src/data/hoistStabilityAdapter.js`
- Test: `apps/module-unit-studio/src/data/hoistStabilityAdapter.test.js`

**배경:** `runStabilityAnalysis`의 단일 레이아웃 리포트는 `report.stages[]`(각 `{id,status,summary}`) + `report.overall?.status` 형태다. 이를 `hoistCandidateRank`가 소비하는 후보 형태(`{label,score,overallStatus,groupCount,groups,metrics}`)로 바꾼다. camelCase/PascalCase 모두 대응.

- [ ] **Step 1: Write the failing test**

`hoistStabilityAdapter.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { adaptStabilityReportToCandidate } from './hoistStabilityAdapter.js'

const report = {
  overall: { status: 'pass' },
  stages: [
    { id: 4, status: 'pass', summary: { minAngleDeg: 68 } },
    { id: 5, status: 'pass', summary: { conflictCount: 0, minClearanceMm: 120 } },
    { id: 6, status: 'pass', summary: { isStable: true, deviationMm: 30, thresholdMm: 100, marginMm: 70, evaluationMode: 'ConvexPolygon' } },
  ],
}

describe('adaptStabilityReportToCandidate', () => {
  it('stages.summary 를 후보 metrics 로 매핑', () => {
    const c = adaptStabilityReportToCandidate(report, { groups: [[1, 2, 3], [4, 5, 6]], pointsPerGroup: 3 })
    expect(c.overallStatus).toBe('pass')
    expect(c.groupCount).toBe(2)
    expect(c.groups).toEqual([{ nodeIds: [1, 2, 3] }, { nodeIds: [4, 5, 6] }])
    expect(c.metrics.stage6MarginMm).toBe(70)
    expect(c.metrics.stage6DeviationMm).toBe(30)
    expect(c.metrics.minSlingAngleDeg).toBe(68)
    expect(c.metrics.wireConflictCount).toBe(0)
    expect(c.metrics.evaluationMode).toBe('ConvexPolygon')
  })

  it('PascalCase 리포트도 동일 결과', () => {
    const pascal = {
      Overall: { Status: 'pass' },
      Stages: [
        { Id: 4, Status: 'pass', Summary: { MinAngleDeg: 68 } },
        { Id: 6, Status: 'pass', Summary: { MarginMm: 70, DeviationMm: 30 } },
      ],
    }
    const c = adaptStabilityReportToCandidate(pascal, { groups: [[1, 2]], pointsPerGroup: 2 })
    expect(c.metrics.stage6MarginMm).toBe(70)
    expect(c.metrics.minSlingAngleDeg).toBe(68)
    expect(c.overallStatus).toBe('pass')
  })

  it('overall 없으면 stages 최악으로 산출, 누락 stage 는 안전 기본값', () => {
    const r = { stages: [{ id: 6, status: 'fail', summary: { marginMm: -10 } }] }
    const c = adaptStabilityReportToCandidate(r, { groups: [[1, 2, 3]], pointsPerGroup: 3 })
    expect(c.overallStatus).toBe('fail')
    expect(c.metrics.minSlingAngleDeg).toBeNull()
    expect(c.metrics.wireConflictCount).toBe(0)
    expect(c.metrics.failedStages).toContain(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/hoistStabilityAdapter.test.js`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

`hoistStabilityAdapter.js`:
```js
/**
 * 단일 레이아웃 자세안정성 리포트(runStabilityAnalysis)를 hoistCandidateRank 가 소비하는
 * 후보 형태로 변환한다. 옵티마이저(--optimize) 리포트와 키 형태가 달라(스테이지별 summary vs
 * 집계 metrics) 별도 어댑터가 필요하다. camelCase/PascalCase 모두 대응.
 */

function pick(obj, ...keys) {
  if (!obj) return undefined
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k]
    const cap = k.charAt(0).toUpperCase() + k.slice(1)
    if (obj[cap] !== undefined) return obj[cap]
  }
  return undefined
}

function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null }
function statusRank(s) { return s === 'fail' ? 2 : s === 'warn' ? 1 : 0 }

/**
 * @param {object} report  runStabilityAnalysis 결과 객체
 * @param {{groups:number[][], pointsPerGroup:number, label?:string, score?:number}} ctx
 * @returns {object}  normalizeCandidate 호환 후보
 */
export function adaptStabilityReportToCandidate(report, ctx) {
  const stages = pick(report, 'stages') ?? []
  const byId = new Map()
  for (const st of stages) byId.set(Number(pick(st, 'id')), st)
  const s4 = byId.get(4), s5 = byId.get(5), s6 = byId.get(6)
  const sum = (st) => pick(st, 'summary') ?? {}

  // overall: report.overall.status 우선, 없으면 stages 최악
  let overall = pick(pick(report, 'overall') ?? {}, 'status')
  if (!overall) {
    let worst = 'pass'
    for (const st of stages) {
      const s = pick(st, 'status')
      if (s && statusRank(s) > statusRank(worst)) worst = s
    }
    overall = stages.length > 0 ? worst : 'unknown'
  }

  const failedStages = []
  for (const st of stages) {
    if (pick(st, 'status') === 'fail') failedStages.push(Number(pick(st, 'id')))
  }

  return {
    label: ctx?.label ?? `구역 ${ctx?.groups?.length ?? 0}그룹 · ${ctx?.pointsPerGroup ?? '?'}점`,
    score: Number.isFinite(Number(ctx?.score)) ? Number(ctx.score) : 0,
    overallStatus: overall,
    groupCount: ctx?.groups?.length ?? 0,
    groups: (ctx?.groups ?? []).map(ids => ({ nodeIds: [...ids] })),
    metrics: {
      stage6Status: pick(s6, 'status') ?? null,
      evaluationMode: pick(sum(s6), 'evaluationMode') ?? null,
      stage6MarginMm: numOrNull(pick(sum(s6), 'marginMm')),
      stage6DeviationMm: numOrNull(pick(sum(s6), 'deviationMm')),
      minSlingAngleDeg: numOrNull(pick(sum(s4), 'minAngleDeg')),
      wireConflictCount: Number.isFinite(Number(pick(sum(s5), 'conflictCount'))) ? Number(pick(sum(s5), 'conflictCount')) : 0,
      failedStages,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/hoistStabilityAdapter.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/module-unit-studio/src/data/hoistStabilityAdapter.js apps/module-unit-studio/src/data/hoistStabilityAdapter.test.js
git commit -m "✨ feat: 단일 레이아웃 리포트→후보 어댑터 (hoistStabilityAdapter)"
```

---

## Task 5: useEditStore — zoneSelectHoistPositions 액션

**Files:**
- Modify: `apps/module-unit-studio/src/store/useEditStore.js`
  - import 추가, `zoneVariantPointCounts` export 헬퍼, `zoneSelectHoistPositions` 액션
- Test: `apps/module-unit-studio/src/store/useEditStore.test.js` (describe 추가)

**참조 패턴:** `autoSelectHoistPositions`(`useEditStore.js:746-819`)와 `exportPostureStabilityToFile`(`:665-736`). posturePath 해석·편집모델 저장·진행률 콜백을 그대로 모방하되, `--optimize` 대신 고정 레이아웃을 `runStabilityAnalysis`로 검증한다.

- [ ] **Step 1: Write the failing test** (`useEditStore.test.js` 맨 아래 append)

```js
import { zoneVariantPointCounts } from './useEditStore.js'
import * as ZP from '../data/hoistZonePartition.js'

describe('zoneVariantPointCounts', () => {
  it('hydro/goliat 은 [pref,...나머지] 로 2·3·4', () => {
    expect(zoneVariantPointCounts('hydro', 3)).toEqual([3, 2, 4])
    expect(zoneVariantPointCounts('goliat', 2)).toEqual([2, 3, 4])
  })
  it('ceiling 은 3·4 만', () => {
    expect(zoneVariantPointCounts('ceiling', 4)).toEqual([4, 3])
    expect(zoneVariantPointCounts('ceiling', 2)).toEqual([3, 4]) // 2 는 무효 → 기본 순서
  })
})

describe('zoneSelectHoistPositions', () => {
  const richStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C_Final', unit: 'mm', schemaVersion: '1.1' },
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, x: (i % 6) * 100, y: i < 6 ? 0 : 100, z: 1000, tags: [] })),
    elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
    connectivity: { groupCount: 1, largestGroupNodeCount: 12, isolatedNodeCount: 0, groups: [{ id: 0, nodeIds: Array.from({ length: 12 }, (_, i) => i + 1), elementIds: [] }] },
    healthMetrics: { totals: { nodeCount: 12, elementCount: 0, rigidCount: 0, pointMassCount: 0, bbox: { minX: 0, maxX: 500, minY: 0, maxY: 100, minZ: 1000, maxZ: 1000 } }, issues: {} },
  })

  const passReport = {
    overall: { status: 'pass' },
    stages: [
      { id: 4, status: 'pass', summary: { minAngleDeg: 70 } },
      { id: 5, status: 'pass', summary: { conflictCount: 0 } },
      { id: 6, status: 'pass', summary: { marginMm: 200, deviationMm: 50, evaluationMode: 'Line' } },
    ],
  }
  const makeHost = (report = passReport) => ({
    name: 'electron',
    uploadEvaluationArtifact: vi.fn(async (name) => ({ ok: true, remotePath: `C:/srv/${name}` })),
    runStabilityAnalysis: vi.fn(async () => ({ ok: true, report })),
  })

  beforeEach(() => {
    useStageStore.setState({ stages: [richStage()], stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 250, y: 50, z: 1000 } } } })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
  })
  afterEach(() => setHost(null))

  const config = { bandAxis: 'x', bands: [1, 1], pointsPerGroup: 3, includePipe: true }

  it('방식 미선택이면 실패', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode(null)
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/권상 방식/)
  })

  it('runStabilityAnalysis 채널 없으면 실패', async () => {
    setHost({ name: 'web', uploadEvaluationArtifact: vi.fn(async () => ({ ok: true, remotePath: 'C:/x' })) })
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/자세안정성/)
  })

  it('groupCount(=Σbands) 가 maxGroups 초과면 실패', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode('goliat') // max 3
    const r = await useEditStore.getState().zoneSelectHoistPositions({ ...config, bands: [2, 2] }) // 4 > 3
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/그룹 수/)
  })

  it('hydro: 변형 스윕 후 PASS 후보 반환, runStabilityAnalysis 다회 호출', async () => {
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(r.hasPass).toBe(true)
    expect(host.runStabilityAnalysis.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(r.candidates[0].overallStatus).toBe('pass')
  })

  it('레이아웃 빌드 전부 불가면 ok:false (host 호출 없음)', async () => {
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    // buildZoneLayout 가 항상 불가하도록 모킹
    const spy = vi.spyOn(ZP, 'buildZoneLayout').mockReturnValue({ ok: false, reason: 'x' })
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(false)
    expect(host.runStabilityAnalysis).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('반환 후보를 applyAutoHoistGroups 로 커밋', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    const { toNodeGroups } = await import('../data/hoistCandidateRank.js')
    const applied = useEditStore.getState().applyAutoHoistGroups(toNodeGroups(r.candidates[0]))
    expect(applied.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/useEditStore.test.js`
Expected: FAIL — `zoneVariantPointCounts`/`zoneSelectHoistPositions` 없음.

- [ ] **Step 3a: import 추가** (`useEditStore.js` 상단, 기존 `hoistCandidateRank` import 옆)

기존:
```js
import { rankHoistCandidates } from '../data/hoistCandidateRank.js'
```
변경 후(아래 2줄 추가):
```js
import { rankHoistCandidates } from '../data/hoistCandidateRank.js'
import * as ZonePartition from '../data/hoistZonePartition.js'
import { adaptStabilityReportToCandidate } from '../data/hoistStabilityAdapter.js'
```
> `buildZoneLayout` 를 `ZonePartition.buildZoneLayout` 로 호출해야 테스트의 `vi.spyOn(ZP,'buildZoneLayout')` 모킹이 적용된다(직접 named import 는 모킹 안 됨).

- [ ] **Step 3b: 액션 추가** (`autoSelectHoistPositions` 액션 바로 다음, `exportEditedBdf` 앞에 삽입)

```js
  /**
   * 구역 기반 권상 위치 선정. config(밴드축·밴드별 하위구역·포인트수·배관토글)로 XY 풋프린트를
   * 나눠 각 구역에서 Z 우세 레벨·면적 최대로 권상점을 고른 뒤, 포인트수 변형을 스윕하며
   * 고정 레이아웃을 host.runStabilityAnalysis 로 검증·랭킹한다. 검증된 후보만 반환(적용은 호출 측).
   *
   * @param {{bandAxis:'x'|'y', bands:number[], pointsPerGroup:number, includePipe:boolean}} config
   * @param {{ onProgress?: (p:{done:number,total:number,pointsPerGroup:number})=>void }} [opts]
   * @returns {Promise<{ok:boolean, candidates?:Array, hasPass?:boolean, error?:string}>}
   */
  zoneSelectHoistPositions: async (config, opts = {}) => {
    const state = get()
    const mode = state.hoistMode
    if (!mode) return { ok: false, error: '권상 방식(STEP 1)을 먼저 선택해 주세요.' }

    const host = getHost()
    if (typeof host.runStabilityAnalysis !== 'function') {
      return { ok: false, error: 'WorkBench 앱이 자세안정성 해석 채널을 지원하지 않습니다. WorkBench를 최신 버전으로 실행해 주세요.' }
    }

    const stage = currentStage()
    if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) {
      return { ok: false, error: '모델이 로드되지 않았습니다.' }
    }

    const bands = Array.isArray(config?.bands) && config.bands.length > 0 ? config.bands : [1]
    const groupCount = bands.reduce((n, b) => n + Math.max(1, Math.floor(b) || 1), 0)
    const maxGroups = getHoistMaxGroups(mode)
    if (groupCount > maxGroups) {
      return { ok: false, error: `현재 권상 방식의 최대 그룹 수(${maxGroups})를 초과합니다 — 구역 합계 ${groupCount}.` }
    }

    // 편집 intents 가 있으면 편집 모델 _edited.json 저장(평가 경로와 동일).
    const intents = state.intents ?? []
    let editedFileName = null
    if (intents.length > 0) {
      const editedJson = buildEditedStageJson(stage, intents)
      editedFileName = buildEditedStageFileName(stage, formatTimestamp)
      const er = await saveJsonArtifact(editedFileName, JSON.stringify(editedJson, null, 2))
      if (!er.ok) return { ok: false, error: `편집 모델 저장 실패: ${er.error ?? '알 수 없는 오류'}` }
    }

    const base = getHoistExport(state)
    if (!base) return { ok: false, error: '권상 방식을 먼저 선택해 주세요.' }

    const heightMm = stage.bbox ? Math.max(0, stage.bbox.maxZ - stage.bbox.minZ) : 0
    const tolMm = state.hoistToleranceMm ?? autoHoistToleranceMm(heightMm)
    const pipeNodes = ZonePartition.pipeNodeIds(stage.elements ?? [])
    const nodeEntries = [...stage.nodeMap]
    const layoutInput = { bbox: stage.bbox, nodeEntries, pipeNodes, tolMm }

    const variants = zoneVariantPointCounts(mode, config?.pointsPerGroup)
    const postureFileName = buildPosturePayloadFileName(stage)

    const reports = []
    let lastError = null
    let done = 0
    for (const n of variants) {
      opts.onProgress?.({ done, total: variants.length, pointsPerGroup: n })
      const layout = ZonePartition.buildZoneLayout(layoutInput, { ...config, bands }, n)
      if (!layout.ok) { lastError = layout.reason; done += 1; opts.onProgress?.({ done, total: variants.length, pointsPerGroup: n }); continue }

      const hoisting = {
        ...base,
        groupCount: layout.groups.length,
        groups: layout.groups.map((ids, i) => ({ id: i + 1, nodeIds: ids })),
      }
      const payload = buildPostureStabilityPayload(state, hoisting, stage, editedFileName)
      const sr = await saveJsonArtifact(postureFileName, JSON.stringify(payload, null, 2))
      if (!sr.ok) { lastError = sr.error ?? '입력 저장 실패'; done += 1; continue }

      let posturePath = null
      if (sr.location === 'backend' && sr.remotePath) posturePath = sr.remotePath
      else if (sr.location === 'folder') {
        const folderRef = useStageStore.getState().sourceFolderRef
        if (typeof folderRef === 'string' && folderRef.length > 0) posturePath = joinPath(folderRef, postureFileName)
      }
      if (!posturePath) { lastError = '_posture.json 절대경로를 확인할 수 없습니다.'; done += 1; continue }

      const rr = await host.runStabilityAnalysis(posturePath)
      if (rr.ok && rr.report) {
        const cand = adaptStabilityReportToCandidate(rr.report, { groups: layout.groups, pointsPerGroup: n })
        reports.push({ candidates: [cand] })
      } else {
        lastError = rr.error ?? '자세안정성 해석 실패'
      }
      done += 1
      opts.onProgress?.({ done, total: variants.length, pointsPerGroup: n })
    }

    const candidates = rankHoistCandidates(reports)
    if (candidates.length === 0) {
      return { ok: false, error: lastError ?? '평가 가능한 권상 후보를 찾지 못했습니다.' }
    }
    return { ok: true, candidates, hasPass: candidates.some(c => c.overallStatus === 'pass') }
  },
```

- [ ] **Step 3c: 헬퍼 추가** (`hoistSweepGroupCounts` export 함수 바로 다음, 파일 하단 내부 유틸 영역)

```js
/**
 * 구역 기반 변형 스윕용 포인트수 목록. 사용자 선호값(preferred)을 맨 앞에 두고 나머지 유효값을 잇는다.
 * ceiling 은 3·4 만(직선 2점 불가), 그 외는 2·3·4.
 * @param {string} mode
 * @param {number} preferred
 * @returns {number[]}
 */
export function zoneVariantPointCounts(mode, preferred) {
  const valid = mode === 'ceiling' ? [3, 4] : [2, 3, 4]
  const p = Number(preferred)
  if (valid.includes(p)) return [p, ...valid.filter(v => v !== p)]
  return valid
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/useEditStore.test.js`
Expected: PASS (기존 + zone 신규 테스트). `vi.spyOn(ZP,'buildZoneLayout')` 모킹이 적용되려면 액션이 `ZonePartition.buildZoneLayout` 로 호출해야 함(Step 3b 준수).

- [ ] **Step 5: Commit**

```bash
git add apps/module-unit-studio/src/store/useEditStore.js apps/module-unit-studio/src/store/useEditStore.test.js
git commit -m "✨ feat: zoneSelectHoistPositions 구역 기반 검증·랭킹 액션"
```

---

## Task 6: HoistZoneConfig — 구역 설정 폼

**Files:**
- Create: `apps/module-unit-studio/src/components/HoistZoneConfig.jsx`

**역할:** controlled 폼. `value`(config) + `onChange(nextConfig)` + `mode` + `maxGroups`. 밴드축 토글, 밴드 수 stepper, 밴드별 하위구역 입력, 포인트수 라디오(모드 유효값만), 배관 토글, 실시간 groupCount + 초과 경고. 순수 표현 컴포넌트(스토어 직접 접근 없음) → 모달이 상태 보유.

> 이 컴포넌트는 시각/렌더 위주라 단위테스트 대신 **빌드+수동 확인**으로 검증한다(기존 패널 컴포넌트들과 동일 관행).

- [ ] **Step 1: Implement component**

`HoistZoneConfig.jsx`:
```jsx
import { Layers, Minus, Plus, GitBranch } from 'lucide-react'

const POINT_OPTS = [2, 3, 4]

/**
 * 구역 기반 권상 선정 설정 폼 (controlled).
 * @param {{ value:{bandAxis,bands,pointsPerGroup,includePipe}, onChange:Function, mode:string, maxGroups:number }} props
 */
export default function HoistZoneConfig({ value, onChange, mode, maxGroups }) {
  const ceiling = mode === 'ceiling'
  const validPoints = ceiling ? [3, 4] : POINT_OPTS
  const bands = value.bands
  const groupCount = bands.reduce((n, b) => n + Math.max(1, b), 0)
  const over = groupCount > maxGroups

  const patch = (p) => onChange({ ...value, ...p })
  const setBand = (i, v) => {
    const next = [...bands]
    next[i] = Math.max(1, Math.min(maxGroups, v))
    patch({ bands: next })
  }
  const addBand = () => { if (!ceiling && bands.length < maxGroups) patch({ bands: [...bands, 1] }) }
  const removeBand = (i) => { if (!ceiling && bands.length > 1) patch({ bands: bands.filter((_, j) => j !== i) }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: '#0f0f22', border: '1px solid #25254a', borderRadius: 8 }}>
      {/* 밴드축 */}
      <Row label="분할 축">
        <Seg active={value.bandAxis === 'y'} onClick={() => patch({ bandAxis: 'y' })} disabled={ceiling}>Y (행)</Seg>
        <Seg active={value.bandAxis === 'x'} onClick={() => patch({ bandAxis: 'x' })} disabled={ceiling}>X (열)</Seg>
      </Row>

      {/* 밴드별 하위구역 */}
      <Row label="밴드별 구역 수">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%' }}>
          {bands.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, color: '#8aa0b8', width: 44 }}>{value.bandAxis === 'y' ? `${i + 1}행` : `${i + 1}열`}</span>
              <Stepper value={b} min={1} max={maxGroups} onChange={(v) => setBand(i, v)} disabled={ceiling} />
              {!ceiling && bands.length > 1 && (
                <button onClick={() => removeBand(i)} title="이 밴드 삭제" style={iconBtn}><Minus size={13} /></button>
              )}
            </div>
          ))}
          {!ceiling && bands.length < maxGroups && (
            <button onClick={addBand} style={{ ...dashBtn }}><Plus size={12} /> 밴드 추가</button>
          )}
        </div>
      </Row>

      {/* 포인트수 */}
      <Row label="구역당 포인트">
        {POINT_OPTS.map(p => (
          <Seg key={p} active={value.pointsPerGroup === p} disabled={!validPoints.includes(p)} onClick={() => patch({ pointsPerGroup: p })}>{p}점</Seg>
        ))}
      </Row>

      {/* 배관 토글 */}
      <Row label="배관 포함">
        <Seg active={!value.includePipe} onClick={() => patch({ includePipe: false })}>제외</Seg>
        <Seg active={value.includePipe} onClick={() => patch({ includePipe: true })}>포함</Seg>
      </Row>

      {/* groupCount 표시 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: over ? '#FF99A6' : '#9fe6c2' }}>
        <Layers size={13} />
        총 권상 그룹 {groupCount}개 / 최대 {maxGroups}개
        {over && <span style={{ fontWeight: 800 }}> · 초과! 구역 수를 줄이세요</span>}
      </div>
    </div>
  )
}

const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'rgba(224,112,112,0.12)', border: '1px solid #c14a4a55', borderRadius: 5, color: '#E07070', cursor: 'pointer', padding: 0 }
const dashBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 8px', background: '#101024', color: '#90E8FF', border: '1px dashed #00D1FF66', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 700 }

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#90E8FF', width: 78, flexShrink: 0, paddingTop: 4 }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>{children}</div>
    </div>
  )
}

function Seg({ active, disabled, onClick, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: active ? 'rgba(0,209,255,0.20)' : '#101024',
      color: disabled ? '#3a3a52' : active ? '#E8FBFF' : '#8aa0b8',
      border: `1px solid ${active ? '#00D1FF' : '#2a2a4a'}`,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{children}</button>
  )
}

function Stepper({ value, min, max, onChange, disabled }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button disabled={disabled || value <= min} onClick={() => onChange(value - 1)} style={stepBtn(disabled || value <= min)}><Minus size={12} /></button>
      <span style={{ minWidth: 18, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#e8f4ff' }}>{value}</span>
      <button disabled={disabled || value >= max} onClick={() => onChange(value + 1)} style={stepBtn(disabled || value >= max)}><Plus size={12} /></button>
    </div>
  )
}
const stepBtn = (dis) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: dis ? '#0a0a18' : '#101024', border: '1px solid #2a2a4a', borderRadius: 5, color: dis ? '#3a3a52' : '#90E8FF', cursor: dis ? 'not-allowed' : 'pointer', padding: 0 })
```
> `GitBranch` import 는 사용하지 않으면 lint 경고. 위 코드에서 미사용이므로 import 에서 `GitBranch` 제거하고 `Layers, Minus, Plus` 만 남길 것.

- [ ] **Step 2: Verify build**

Run: `npx vite build`
Expected: exit 0 (컴파일 통과). lint: `npx eslint src/components/HoistZoneConfig.jsx` → 미사용 import 없음.

- [ ] **Step 3: Commit**

```bash
git add apps/module-unit-studio/src/components/HoistZoneConfig.jsx
git commit -m "✨ feat: 구역 설정 폼 HoistZoneConfig"
```

---

## Task 7: HoistAutoResultModal — 탭 2개 재구성

**Files:**
- Modify: `apps/module-unit-studio/src/components/HoistAutoResultModal.jsx` (전체 재작성)

**설계:** 탭 `[구역 기반][옵티마이저 자동]`. 기본=구역 기반(설정 폼 + "평가 실행" 버튼 → `zoneSelectHoistPositions`). 옵티마이저 탭은 최초 활성 시 1회 `autoSelectHoistPositions` 실행(기존 동작 보존). 결과 리스트·미리보기·적용은 공유. ceiling 이면 구역 폼은 bands=[1] 고정.

- [ ] **Step 1: Rewrite component**

`HoistAutoResultModal.jsx` (전체 교체):
```jsx
import { useEffect, useRef, useState } from 'react'
import { Loader2, X, CheckCircle2, AlertTriangle, XCircle, Play } from 'lucide-react'
import { useEditStore, getHoistMaxGroups } from '../store/useEditStore.js'
import { toNodeGroups } from '../data/hoistCandidateRank.js'
import HoistZoneConfig from './HoistZoneConfig.jsx'

const STATUS_STYLE = {
  pass: { color: '#37E08A', bg: 'rgba(55,224,138,0.12)', border: 'rgba(55,224,138,0.5)', Icon: CheckCircle2, label: 'PASS' },
  warn: { color: '#FFC447', bg: 'rgba(255,196,71,0.12)', border: 'rgba(255,196,71,0.5)', Icon: AlertTriangle, label: 'WARN' },
  fail: { color: '#FF6677', bg: 'rgba(255,102,119,0.12)', border: 'rgba(255,102,119,0.5)', Icon: XCircle, label: 'FAIL' },
}
const styleFor = (s) => STATUS_STYLE[s] ?? STATUS_STYLE.fail
const fmt = (v, unit = '') => (v == null ? '–' : `${Math.round(v)}${unit}`)

const defaultZoneConfig = (mode) => mode === 'ceiling'
  ? { bandAxis: 'y', bands: [1], pointsPerGroup: 3, includePipe: false }
  : { bandAxis: 'y', bands: [1, 1], pointsPerGroup: 3, includePipe: false }

export default function HoistAutoResultModal({ onClose }) {
  const mode = useEditStore(s => s.hoistMode)
  const zoneSelect = useEditStore(s => s.zoneSelectHoistPositions)
  const autoSelect = useEditStore(s => s.autoSelectHoistPositions)
  const applyGroups = useEditStore(s => s.applyAutoHoistGroups)
  const maxGroups = getHoistMaxGroups(mode)

  const [tab, setTab] = useState('zone')              // 'zone' | 'optimizer'
  const [zoneConfig, setZoneConfig] = useState(() => defaultZoneConfig(mode))
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 1 })
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [committed, setCommitted] = useState(false)
  const optimizerRan = useRef(false)

  // 진입 스냅샷 — 미리보기는 실제 hoistGroups 를 바꾸므로 취소 시 복원.
  const snapshotRef = useRef(null)
  useEffect(() => {
    const s = useEditStore.getState()
    snapshotRef.current = { hoistMode: s.hoistMode, hoistGroupCount: s.hoistGroupCount, hoistGroups: s.hoistGroups, activeHoistGroupId: s.activeHoistGroupId }
  }, [])

  const restore = () => { if (snapshotRef.current) useEditStore.setState(snapshotRef.current) }
  const handleCancel = () => { if (!committed) restore(); onClose() }

  const ingest = (r) => {
    setRunning(false)
    if (!r.ok) { setError(r.error); setCandidates([]); return }
    setError(null)
    setCandidates(r.candidates)
    const first = r.candidates[0]
    if (first) { setSelectedId(first.id); applyGroups(toNodeGroups(first)) }
    else setSelectedId(null)
  }

  const runZone = async () => {
    setError(null); setCandidates([]); setSelectedId(null); restore()
    setRunning(true); setProgress({ done: 0, total: 1 })
    const r = await zoneSelect(zoneConfig, { onProgress: setProgress })
    ingest(r)
  }

  const runOptimizer = async () => {
    setError(null); setCandidates([]); setSelectedId(null); restore()
    setRunning(true); setProgress({ done: 0, total: 1 })
    const r = await autoSelect({ onProgress: (p) => setProgress({ done: p.done, total: p.total }) })
    ingest(r)
  }

  // 옵티마이저 탭 최초 활성 시 1회 실행.
  useEffect(() => {
    if (tab === 'optimizer' && !optimizerRan.current) { optimizerRan.current = true; runOptimizer() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handlePreview = (c) => { setSelectedId(c.id); applyGroups(toNodeGroups(c)) }
  const handleApply = () => {
    const c = candidates.find(x => x.id === selectedId)
    if (!c) return
    const r = applyGroups(toNodeGroups(c))
    if (!r?.ok) { setError(r?.error ?? '권상 위치 적용에 실패했습니다.'); return }
    setCommitted(true); onClose()
  }

  const hasPass = candidates.some(c => c.overallStatus === 'pass')
  const selected = candidates.find(c => c.id === selectedId) ?? null
  const groupCount = zoneConfig.bands.reduce((n, b) => n + Math.max(1, b), 0)
  const zoneRunnable = !running && groupCount <= maxGroups

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(4,4,16,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(740px, 95vw)', maxHeight: '90vh', background: '#0b0b1e', border: '1px solid #25254a', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e1e38' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#90E8FF' }}>권상 위치 자동 선정</span>
          <button onClick={handleCancel} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#8aa0b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
          <Tab active={tab === 'zone'} onClick={() => setTab('zone')}>구역 기반</Tab>
          <Tab active={tab === 'optimizer'} onClick={() => setTab('optimizer')}>옵티마이저 자동</Tab>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {/* 구역 기반 탭 컨트롤 */}
          {tab === 'zone' && (
            <div style={{ marginBottom: 14 }}>
              <HoistZoneConfig value={zoneConfig} onChange={setZoneConfig} mode={mode} maxGroups={maxGroups} />
              <button onClick={runZone} disabled={!zoneRunnable} style={{
                marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
                padding: '9px 10px', borderRadius: 7,
                background: zoneRunnable ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18',
                border: `1px solid ${zoneRunnable ? '#2BD380' : '#2a2a4a'}`, color: zoneRunnable ? '#F0FFF4' : '#3a3a52',
                fontSize: 12, fontWeight: 800, cursor: zoneRunnable ? 'pointer' : 'not-allowed',
              }}>
                {running ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} /> : <Play size={14} fill={zoneRunnable ? '#F0FFF4' : 'none'} strokeWidth={2.5} />}
                {running ? '평가 중…' : '구역 기반 평가 실행'}
              </button>
            </div>
          )}

          {/* 진행 / 에러 / PASS 없음 배너 */}
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cad8e8', fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
              자세안정성 평가 중… ({progress.done}/{progress.total})
            </div>
          )}
          {!running && error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,102,119,0.10)', border: '1px solid rgba(255,102,119,0.5)', color: '#FF99A6', fontSize: 12.5, lineHeight: 1.5 }}>{error}</div>
          )}
          {!running && !error && !hasPass && candidates.length > 0 && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(255,196,71,0.10)', border: '1px solid rgba(255,196,71,0.5)', color: '#FFC447', fontSize: 12, lineHeight: 1.5 }}>
              자세안정성 PASS 후보를 찾지 못했습니다. 아래는 차선 후보입니다 — {tab === 'zone' ? '분할 축·밴드·포인트 수' : '권상 방식·그룹 수'} 조정을 권장합니다.
            </div>
          )}

          {/* 결과 리스트(공유) */}
          {!running && !error && candidates.map((c, i) => {
            const st = styleFor(c.overallStatus)
            const active = c.id === selectedId
            return (
              <button key={c.id} onClick={() => handlePreview(c)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: active ? st.bg : '#0f0f22', border: `1px solid ${active ? st.border : '#2a2a4a'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <st.Icon size={15} color={st.color} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: st.color }}>#{i + 1} · {st.label}</span>
                  <span style={{ fontSize: 11, color: '#8aa0b8' }}>{c.groupCount}그룹 · 포인트 {c.groups.reduce((n, g) => n + g.nodeIds.length, 0)}개</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: '#9fb4cc' }}>
                  <span>Stage6 여유 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.stage6MarginMm, 'mm')}</b></span>
                  <span>최소 슬링각 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.minSlingAngleDeg, '°')}</b></span>
                  <span>간섭 <b style={{ color: '#cfe6ff' }}>{c.metrics.wireConflictCount}</b></span>
                  <span>score <b style={{ color: '#cfe6ff' }}>{fmt(c.score)}</b></span>
                </div>
              </button>
            )
          })}
        </div>

        {/* 푸터 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid #1e1e38' }}>
          <button onClick={handleCancel} style={{ padding: '8px 14px', borderRadius: 7, background: '#101024', border: '1px solid #2a2a4a', color: '#cad8e8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
          <button onClick={handleApply} disabled={!selected} style={{ padding: '8px 16px', borderRadius: 7, background: selected ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18', border: `1px solid ${selected ? '#2BD380' : '#2a2a4a'}`, color: selected ? '#F0FFF4' : '#3a3a52', fontSize: 12, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed' }}>이 안 적용</button>
        </div>
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: '7px 7px 0 0', fontSize: 12, fontWeight: 800,
      background: active ? '#0f0f22' : 'transparent',
      color: active ? '#90E8FF' : '#6a7a92',
      border: `1px solid ${active ? '#25254a' : 'transparent'}`, borderBottom: 'none', cursor: 'pointer',
    }}>{children}</button>
  )
}
```

- [ ] **Step 2: Verify build + full test suite**

Run: `npx vite build` → exit 0.
Run: `npx vitest run` → 전체 그린(기존 + 신규).

- [ ] **Step 3: Commit**

```bash
git add apps/module-unit-studio/src/components/HoistAutoResultModal.jsx
git commit -m "✨ feat: 권상 자동선정 모달 탭 재구성(구역 기반/옵티마이저)"
```

---

## 완료 후

전체 작업 완료 시 `superpowers:finishing-a-development-branch` 로 마무리:
1. `npx vitest run` 전체 그린 확인.
2. master 병합(로컬).
3. `package.json` version bump → `npm run package` → `release/*.zip`+`.sha256`.
4. 배포: ① 백엔드-로컬 `HiTessWorkBenchBackEnd/StudioProgram/` ② UNC `…/권혁민 책임연구원/HiTessWorkBench/StudioProgram` (sha256 검증).
5. 보고: 팀 서버(145)는 `StudioProgram/`에 zip 수동 복사 필요(viewers.py 로컬 우선). C# 무변경 → git pull/재시작 불필요.

## 자가 검토(작성자 체크)

- **스펙 커버리지**: X/Y 분할(Task1) · 행별 가변(Task1 partitionZones bands[]) · 포인트 2~4(Task2 selectWidestPoints, Task5 variants) · 배관 토글(Task2 pipeNodeIds, Task3 includePipe) · 넓은 면적(Task2 selectWidestPoints) · Z 우세 레벨(Task2 dominantZLevel) · 검증/랭킹(Task4 어댑터+Task5 액션) · 병행 탭(Task7) — 전부 매핑됨.
- **타입 일관성**: config `{bandAxis,bands,pointsPerGroup,includePipe}` 전 Task 동일. `buildZoneLayout(input,config,n)` 시그니처 Task3 정의=Task5 호출 일치. `adaptStabilityReportToCandidate(report,ctx)` Task4=Task5 일치. 후보는 `rankHoistCandidates([{candidates:[cand]}])` 로 정규화 → `toNodeGroups`/`applyAutoHoistGroups` 소비(기존).
- **플레이스홀더 없음**: 모든 코드 블록 실코드.
- **모킹 주의**: Task5 액션은 `ZonePartition.buildZoneLayout`(namespace) 로 호출해야 `vi.spyOn` 적용(Step 3a/3b 명시).
