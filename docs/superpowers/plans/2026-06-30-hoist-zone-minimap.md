# 구역 미니맵 + 구역별 포인트 수 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구역 기반 권상 위치 선정에 (1) 모달 안 2D SVG 미니맵으로 구역 분할 시각화, (2) 구역별 포인트 수 개별 지정을 추가한다.

**Architecture:** 100% 프론트엔드. 기존 `partitionZones`가 산출하는 구역 사각형을 순수 함수 `buildZonePartitionView`로 SVG 뷰모델로 변환하고, `ZonePartitionMap` 컴포넌트가 그린다. 전역 `pointsPerGroup`(스칼라)을 `pointsPerZone`(ragged 배열, `bands`와 모양 일치)로 교체하고, 변형 스윕을 제거해 결정적 1회 검증으로 단순화한다. C# 엔진·3D 뷰포트 무변경.

**Tech Stack:** React 19, Zustand 5, Vite 8, Vitest 4, SVG. Repo: `C:/Coding/WorkBenchSubModule/ModuleUnitStudio`, 앱 디렉터리: `apps/module-unit-studio`.

**선행 스펙:** `docs/superpowers/specs/2026-06-30-hoist-zone-minimap-per-zone-points-design.md`

**공통 명령(앱 디렉터리에서 실행):**
- 작업 디렉터리: `C:/Coding/WorkBenchSubModule/ModuleUnitStudio/apps/module-unit-studio`
- 단일 파일 테스트: `npx vitest run <path>`
- 전체 테스트: `npm test`
- 린트: `npm run lint`
- 빌드: `npm run build`
- git 작업은 repo 루트(`C:/Coding/WorkBenchSubModule/ModuleUnitStudio`) 기준 경로로 add/commit. 현재 브랜치: `feat/hoist-zone-minimap`.

---

## File Structure

| 파일 | 책임 |
|------|------|
| `apps/module-unit-studio/src/data/hoistZonePartition.js` | 순수 기하/선택. `reconcilePointsPerZone`·`zoneCountFor`·`buildZonePartitionView` 추가, `buildZoneLayout` per-zone로 변경 |
| `apps/module-unit-studio/src/data/hoistZonePartition.test.js` | 위 함수들 단위테스트 |
| `apps/module-unit-studio/src/components/ZonePartitionMap.jsx` | 신규. SVG 미니맵(셀 클릭→포인트 수 순환), presentational |
| `apps/module-unit-studio/src/components/HoistZoneConfig.jsx` | "구역당 포인트" Row를 미니맵으로 대체, pointsPerZone 재조정 |
| `apps/module-unit-studio/src/store/useEditStore.js` | `buildHoistPartitionInput`·`getZonePartitionInput` 추가, `zoneSelectHoistPositions` 스윕 제거, `zoneVariantPointCounts` 제거 |
| `apps/module-unit-studio/src/store/useEditStore.test.js` | 단일 경로 테스트로 갱신, `zoneVariantPointCounts` 테스트 삭제 |
| `apps/module-unit-studio/src/components/HoistAutoResultModal.jsx` | `defaultZoneConfig` pointsPerZone, `partitionInput` 주입 |

---

## Task 1: 순수 헬퍼 `reconcilePointsPerZone` + `zoneCountFor`

**Files:**
- Modify: `apps/module-unit-studio/src/data/hoistZonePartition.js` (파일 끝에 함수 추가)
- Test: `apps/module-unit-studio/src/data/hoistZonePartition.test.js` (describe 블록 추가)

- [ ] **Step 1: 실패 테스트 작성**

`hoistZonePartition.test.js` 상단 import 줄(4번째 줄 근처)에 함수 import를 추가한다. 기존:
```js
import { buildZoneLayout } from './hoistZonePartition.js'
```
바로 아래에 추가:
```js
import { reconcilePointsPerZone, zoneCountFor } from './hoistZonePartition.js'
```

파일 끝에 다음 describe 블록을 추가:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: FAIL — `reconcilePointsPerZone is not a function`, `zoneCountFor is not a function`.

- [ ] **Step 3: 구현 추가**

`hoistZonePartition.js` 파일 맨 끝에 추가:
```js
/**
 * pointsPerZone 를 bands 모양에 맞춰 재조정한다(순수).
 * 기존 값은 위치별로 보존, 부족분은 defaultPoints, 모든 값은 validPoints 로 클램프.
 * @param {number[]} bands  밴드별 하위구역 수
 * @param {number[][]|null} prev  기존 pointsPerZone
 * @param {number[]} validPoints  허용 포인트 값(예: [2,3,4] 또는 [3,4])
 * @param {number} defaultPoints  새 셀 기본값
 * @returns {number[][]}
 */
export function reconcilePointsPerZone(bands, prev, validPoints, defaultPoints) {
  const valid = Array.isArray(validPoints) && validPoints.length > 0 ? validPoints : [2, 3, 4]
  const def = valid.includes(defaultPoints) ? defaultPoints : valid[0]
  const clamp = (v) => {
    const n = Number(v)
    if (valid.includes(n)) return n
    if (!Number.isFinite(n)) return def
    let best = valid[0], bestD = Infinity
    for (const c of valid) { const d = Math.abs(c - n); if (d < bestD) { bestD = d; best = c } }
    return best
  }
  const src = Array.isArray(prev) ? prev : []
  const list = Array.isArray(bands) && bands.length > 0 ? bands : [1]
  return list.map((b, i) => {
    const sub = Math.max(1, Math.floor(b) || 1)
    const prevRow = Array.isArray(src[i]) ? src[i] : []
    const row = []
    for (let j = 0; j < sub; j++) row.push(j < prevRow.length ? clamp(prevRow[j]) : def)
    return row
  })
}

/**
 * 구역(bandIndex, subIndex)의 포인트 수. 누락 시 defaultPoints.
 * @param {{pointsPerZone?:number[][]}} config
 * @returns {number}
 */
export function zoneCountFor(config, bandIndex, subIndex, defaultPoints = 3) {
  const v = config?.pointsPerZone?.[bandIndex]?.[subIndex]
  const n = Number(v)
  return Number.isFinite(n) ? n : defaultPoints
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: PASS (기존 + 신규 모두).

- [ ] **Step 5: 커밋**

```bash
git add apps/module-unit-studio/src/data/hoistZonePartition.js apps/module-unit-studio/src/data/hoistZonePartition.test.js
git commit -m "✨ feat: reconcilePointsPerZone / zoneCountFor 순수 헬퍼 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 미니맵 뷰모델 `buildZonePartitionView`

**Files:**
- Modify: `apps/module-unit-studio/src/data/hoistZonePartition.js` (파일 끝에 함수 추가)
- Test: `apps/module-unit-studio/src/data/hoistZonePartition.test.js` (describe 추가)

- [ ] **Step 1: 실패 테스트 작성**

`hoistZonePartition.test.js`의 import에 `buildZonePartitionView`를 추가한다. Task 1에서 추가한 import 줄을 다음으로 교체:
```js
import { reconcilePointsPerZone, zoneCountFor, buildZonePartitionView } from './hoistZonePartition.js'
```

파일 끝에 추가:
```js
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
  it('viewBox 종횡비 = bbox 종횡비(가로 2배 → 1000x500)', () => {
    const view = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [1] }, [], new Set())
    expect(view.viewBox.w).toBe(1000)
    expect(view.viewBox.h).toBe(500)
  })
  it('Y축 뒤집기 — maxY 노드는 위(작은 svgY), minY 노드는 아래(큰 svgY)', () => {
    const entries = [[1, { x: 0, y: 50, z: 0 }], [2, { x: 0, y: 0, z: 0 }]]
    const view = buildZonePartitionView(vbbox, { bandAxis: 'y', bands: [1] }, entries, new Set())
    expect(view.dots[0].y).toBeCloseTo(0)
    expect(view.dots[1].y).toBeCloseTo(500)
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
  })
  it('degenerate bbox(폭 0)도 NaN 없이 동작', () => {
    const view = buildZonePartitionView({ minX: 10, maxX: 10, minY: 0, maxY: 100 }, { bandAxis: 'y', bands: [1] }, [[1, { x: 10, y: 50, z: 0 }]], new Set())
    expect(Number.isFinite(view.cells[0].x)).toBe(true)
    expect(Number.isFinite(view.cells[0].w)).toBe(true)
  })
  it('노드 과다 시 다운샘플(maxDots 상한)', () => {
    const many = Array.from({ length: 5000 }, (_, i) => [i + 1, { x: (i % 100), y: Math.floor(i / 100), z: 0 }])
    const view = buildZonePartitionView({ minX: 0, maxX: 100, minY: 0, maxY: 50 }, { bandAxis: 'y', bands: [1] }, many, new Set(), { maxDots: 100 })
    expect(view.dots.length).toBeLessThanOrEqual(100)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: FAIL — `buildZonePartitionView is not a function`.

- [ ] **Step 3: 구현 추가**

`hoistZonePartition.js` 파일 맨 끝에 추가:
```js
/**
 * 구역 미니맵용 SVG 뷰모델(순수). 모델 XY(mm)를 viewBox 좌표로 매핑한다.
 * viewBox 는 bbox 종횡비를 따르고 긴 변이 maxDim(기본 1000). SVG 는 Y가 아래로 증가하므로 Y를 뒤집는다.
 * nodeEntries 는 배열([id,{x,y,z}])이어야 한다(두 번 순회).
 * @param {{minX,maxX,minY,maxY}} bbox
 * @param {{bandAxis:'x'|'y', bands:number[], pointsPerZone?:number[][]}} config
 * @param {Array<[number,{x,y}]>} nodeEntries
 * @param {Set<number>} pipeNodes
 * @param {{maxDim?:number, maxDots?:number}} [opts]
 * @returns {{viewBox:{x,y,w,h}, cells:Array, dots:Array}}
 */
export function buildZonePartitionView(bbox, config, nodeEntries, pipeNodes, opts = {}) {
  const maxDim = opts.maxDim ?? 1000
  const maxDots = opts.maxDots ?? 2000
  const b = bbox ?? { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  const spanX = (b.maxX - b.minX) || 1
  const spanY = (b.maxY - b.minY) || 1
  const aspect = spanX / spanY
  let W, H
  if (aspect >= 1) { W = maxDim; H = Math.max(120, Math.round(maxDim / aspect)) }
  else { H = maxDim; W = Math.max(120, Math.round(maxDim * aspect)) }
  const sx = (mx) => ((mx - b.minX) / spanX) * W
  const sy = (my) => ((b.maxY - my) / spanY) * H

  const axis = config?.bandAxis === 'x' ? 'x' : 'y'
  const zones = partitionZones(b, config)
  const byZone = assignNodesToZones(zones, nodeEntries)
  const cells = zones.map(z => {
    const x0 = sx(z.xMin), x1 = sx(z.xMax)
    const yTop = sy(z.yMax), yBot = sy(z.yMin)
    const points = zoneCountFor(config, z.bandIndex, z.subIndex, 3)
    const nodeCount = (byZone.get(z.id) ?? []).length
    const label = axis === 'y' ? `${z.bandIndex + 1}행·${z.subIndex + 1}` : `${z.bandIndex + 1}열·${z.subIndex + 1}`
    return {
      bandIndex: z.bandIndex, subIndex: z.subIndex,
      x: Math.min(x0, x1), y: Math.min(yTop, yBot),
      w: Math.abs(x1 - x0), h: Math.abs(yBot - yTop),
      label, points, nodeCount, thin: nodeCount < points,
    }
  })

  const entries = Array.isArray(nodeEntries) ? nodeEntries : []
  const stride = entries.length > maxDots ? Math.ceil(entries.length / maxDots) : 1
  const dots = []
  let i = 0
  for (const [id, n] of entries) {
    const take = (i++ % stride) === 0
    if (!take) continue
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
    dots.push({ x: sx(n.x), y: sy(n.y), pipe: pipeNodes ? pipeNodes.has(id) : false })
  }

  return { viewBox: { x: 0, y: 0, w: W, h: H }, cells, dots }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/module-unit-studio/src/data/hoistZonePartition.js apps/module-unit-studio/src/data/hoistZonePartition.test.js
git commit -m "✨ feat: buildZonePartitionView — 구역 미니맵 SVG 뷰모델

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: per-zone 마이그레이션 (buildZoneLayout + 스토어 + 테스트)

> 이 Task 는 한 커밋으로 끝내야 테스트가 green 으로 유지된다(`buildZoneLayout` 시그니처 변경이 스토어·스토어 테스트와 맞물림).

**Files:**
- Modify: `apps/module-unit-studio/src/data/hoistZonePartition.js` (`buildZoneLayout`)
- Modify: `apps/module-unit-studio/src/data/hoistZonePartition.test.js` (`buildZoneLayout` describe 교체)
- Modify: `apps/module-unit-studio/src/store/useEditStore.js`
- Modify: `apps/module-unit-studio/src/store/useEditStore.test.js`

- [ ] **Step 1: `buildZoneLayout` 테스트 교체(실패 유도)**

`hoistZonePartition.test.js`에서 기존 `describe('buildZoneLayout', ...)` 블록(파일의 `describe('buildZoneLayout'`부터 그 닫는 `})`까지) 전체를 다음으로 교체:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: FAIL — 새 테스트가 3번째 인자 없이 호출하므로 모든 구역이 기본 동작이 아닌 옛 `pointsPerGroup=undefined` 경로로 깨지거나 `좌3점/우2점` 불일치.

- [ ] **Step 3: `buildZoneLayout` per-zone 구현**

`hoistZonePartition.js`의 기존 `buildZoneLayout` 함수(시그니처 `export function buildZoneLayout(input, config, pointsPerGroup) {` 부터 닫는 `}`까지)를 다음으로 교체. JSDoc도 교체:
```js
/**
 * 구역 분할 → 구역별 (배관필터 → Z우세레벨 → 면적최대 n점) → 그룹 배열.
 * 각 구역의 포인트 수는 config.pointsPerZone[bandIndex][subIndex](없으면 3).
 * 어떤 구역이 n점 불가면 그 구역은 빠지고 남은 구역으로 빌드한다(부분 실패 허용).
 *
 * @param {{bbox, nodeEntries:Iterable<[number,{x,y,z}]>, pipeNodes:Set<number>, tolMm:number}} input
 * @param {{bandAxis:'x'|'y', bands:number[], includePipe:boolean, pointsPerZone?:number[][]}} config
 * @returns {{ok:true, groups:number[][]} | {ok:false, reason:string}}
 */
export function buildZoneLayout(input, config) {
  const { bbox, nodeEntries, pipeNodes, tolMm } = input
  const zones = partitionZones(bbox, config)
  const byZone = assignNodesToZones(zones, nodeEntries)
  const groups = []
  for (const z of zones) {
    const count = zoneCountFor(config, z.bandIndex, z.subIndex, 3)
    let cand = byZone.get(z.id) ?? []
    if (!config.includePipe && pipeNodes && pipeNodes.size > 0) {
      cand = cand.filter(nd => !pipeNodes.has(nd.id))
    }
    const level = dominantZLevel(cand, tolMm, count)
    if (!level) continue
    const ids = selectWidestPoints(level.members, count)
    if (ids.length >= 2) groups.push(ids)
  }
  if (groups.length === 0) {
    return { ok: false, reason: '구역에서 동일 Z레벨 권상점을 충분히 찾지 못했습니다.' }
  }
  return { ok: true, groups }
}
```

- [ ] **Step 4: hoistZonePartition 테스트 통과 확인**

Run: `npx vitest run src/data/hoistZonePartition.test.js`
Expected: PASS.

- [ ] **Step 5: 스토어 — `zoneVariantPointCounts` 제거 & 입력 헬퍼 추가**

`useEditStore.js`에서 `export function zoneVariantPointCounts(mode, preferred) { ... }` 함수 전체(JSDoc 포함)를 삭제한다.

같은 파일에서 `currentStage()` 함수 정의 바로 아래에 다음을 추가:
```js
/**
 * 구역 미니맵·구역 기반 평가의 공통 입력(순수). nodeEntries 는 배열(재순회 가능).
 * @param {import('../data/StageData.js').StageData} stage
 * @param {number|null} hoistToleranceMm
 * @returns {{bbox, nodeEntries:Array, pipeNodes:Set<number>, tolMm:number}|null}
 */
export function buildHoistPartitionInput(stage, hoistToleranceMm) {
  if (!stage || !stage.nodeMap) return null
  const heightMm = stage.bbox ? Math.max(0, stage.bbox.maxZ - stage.bbox.minZ) : 0
  const tolMm = (Number.isFinite(hoistToleranceMm) && hoistToleranceMm > 0)
    ? hoistToleranceMm
    : Math.max(2, heightMm * 0.004)
  return {
    bbox: stage.bbox,
    nodeEntries: [...stage.nodeMap],
    pipeNodes: pipeNodeIds(stage.elements ?? []),
    tolMm,
  }
}
```

- [ ] **Step 6: 스토어 — `getZonePartitionInput` 액션 추가 & `zoneSelectHoistPositions` 단순화**

`useEditStore.js`에서 기존 `zoneSelectHoistPositions: async (config, opts = {}) => { ... },` 액션 전체(JSDoc 포함)를 다음으로 교체:
```js
  /**
   * 구역 미니맵용 입력(bbox/nodeEntries/pipeNodes/tolMm)을 반환. 모델 없으면 null.
   * @returns {{bbox, nodeEntries:Array, pipeNodes:Set<number>, tolMm:number}|null}
   */
  getZonePartitionInput: () => {
    const stage = currentStage()
    if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) return null
    return buildHoistPartitionInput(stage, get().hoistToleranceMm)
  },

  /**
   * 구역 기반 권상 위치 선정. config(밴드축·밴드별 하위구역·구역별 포인트수·배관토글)로 XY 풋프린트를
   * 나눠 각 구역에서 Z 우세 레벨·면적 최대로 권상점을 고른 뒤, 고정 레이아웃을
   * host.runStabilityAnalysis 로 1회 검증한다. 검증된 후보(1개)를 반환(적용은 호출 측).
   *
   * @param {{bandAxis:'x'|'y', bands:number[], pointsPerZone:number[][], includePipe:boolean}} config
   * @param {{ onProgress?: (p:{done:number,total:number})=>void }} [opts]
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

    opts.onProgress?.({ done: 0, total: 1 })

    const input = buildHoistPartitionInput(stage, state.hoistToleranceMm)
    const layout = buildZoneLayout(input, { ...config, bands })
    if (!layout.ok) {
      opts.onProgress?.({ done: 1, total: 1 })
      return { ok: false, error: layout.reason }
    }

    const hoisting = {
      ...base,
      groupCount: layout.groups.length,
      groups: layout.groups.map((ids, i) => ({ id: i + 1, nodeIds: ids })),
    }
    const payload = buildPostureStabilityPayload(state, hoisting, stage, editedFileName)
    const postureFileName = buildPosturePayloadFileName(stage)
    const sr = await saveJsonArtifact(postureFileName, JSON.stringify(payload, null, 2))
    if (!sr.ok) { opts.onProgress?.({ done: 1, total: 1 }); return { ok: false, error: sr.error ?? '입력 저장 실패' } }

    let posturePath = null
    if (sr.location === 'backend' && sr.remotePath) posturePath = sr.remotePath
    else if (sr.location === 'folder') {
      const folderRef = useStageStore.getState().sourceFolderRef
      if (typeof folderRef === 'string' && folderRef.length > 0) posturePath = joinPath(folderRef, postureFileName)
    }
    if (!posturePath) { opts.onProgress?.({ done: 1, total: 1 }); return { ok: false, error: '_posture.json 절대경로를 확인할 수 없습니다.' } }

    const rr = await host.runStabilityAnalysis(posturePath)
    opts.onProgress?.({ done: 1, total: 1 })
    if (!rr.ok || !rr.report) {
      return { ok: false, error: rr.error ?? '자세안정성 해석 실패' }
    }

    const totalPoints = layout.groups.reduce((n, g) => n + g.length, 0)
    const label = `구역 ${layout.groups.length}그룹 · ${totalPoints}점`
    const cand = adaptStabilityReportToCandidate(rr.report, { groups: layout.groups, label })
    const candidates = rankHoistCandidates([{ candidates: [cand] }])
    if (candidates.length === 0) {
      return { ok: false, error: '평가 가능한 권상 후보를 찾지 못했습니다.' }
    }
    return { ok: true, candidates, hasPass: candidates.some(c => c.overallStatus === 'pass') }
  },
```

> 주의: `buildPosturePayloadFileName`, `joinPath`, `getHoistExport`, `saveJsonArtifact`, `buildEditedStageJson`, `buildEditedStageFileName`, `formatTimestamp`, `adaptStabilityReportToCandidate`, `rankHoistCandidates` 는 기존 import 그대로 사용한다(추가 import 불필요). `buildZoneLayout`·`pipeNodeIds` 는 이미 import 되어 있다.

- [ ] **Step 7: 스토어 테스트 갱신**

`useEditStore.test.js`:

(a) 2번째 줄 import 에서 `zoneVariantPointCounts` 제거, `buildHoistPartitionInput` 추가. 즉:
```js
import { useEditStore, getHoistMaxGroups, getHoistDefaultWireLengthM, buildPostureStabilityPayload, zoneVariantPointCounts } from './useEditStore.js'
```
를 다음으로 교체:
```js
import { useEditStore, getHoistMaxGroups, getHoistDefaultWireLengthM, buildPostureStabilityPayload, buildHoistPartitionInput } from './useEditStore.js'
```

(b) `describe('zoneVariantPointCounts', () => { ... })` 블록 전체를 삭제.

(c) `describe('zoneSelectHoistPositions', ...)` 안에서:
- `config` 상수를 다음으로 교체:
```js
  const config = { bandAxis: 'x', bands: [1, 1], pointsPerZone: [[3], [3]], includePipe: true }
```
- `it('hydro: 변형 스윕 후 PASS 후보 반환, runStabilityAnalysis 다회 호출', ...)` 테스트를 다음으로 교체:
```js
  it('단일 평가로 PASS 후보 반환, runStabilityAnalysis 1회 호출', async () => {
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(r.hasPass).toBe(true)
    expect(host.runStabilityAnalysis).toHaveBeenCalledTimes(1)
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].overallStatus).toBe('pass')
  })
```
- 같은 describe 의 닫는 `})` 직전에 다음 테스트들을 추가:
```js
  it('getZonePartitionInput: bbox/nodeEntries/pipeNodes/tolMm 반환', () => {
    const inp = useEditStore.getState().getZonePartitionInput()
    expect(inp).toBeTruthy()
    expect(inp.bbox).toMatchObject({ minX: 0, maxX: 500 })
    expect(Array.isArray(inp.nodeEntries)).toBe(true)
    expect(inp.nodeEntries.length).toBe(12)
    expect(inp.pipeNodes instanceof Set).toBe(true)
    expect(inp.tolMm).toBeGreaterThan(0)
  })

  it('buildHoistPartitionInput: 모델 없으면 null', () => {
    expect(buildHoistPartitionInput(null, null)).toBeNull()
  })
```

- [ ] **Step 8: 전체 테스트 통과 확인**

Run: `npm test`
Expected: PASS (회귀 없음). 특히 `zoneSelectHoistPositions`, `buildZoneLayout`, Task 1·2 신규 모두 통과.

- [ ] **Step 9: 커밋**

```bash
git add apps/module-unit-studio/src/data/hoistZonePartition.js apps/module-unit-studio/src/data/hoistZonePartition.test.js apps/module-unit-studio/src/store/useEditStore.js apps/module-unit-studio/src/store/useEditStore.test.js
git commit -m "✨ feat: 구역별 포인트 수 per-zone 마이그레이션(스윕 제거)

- buildZoneLayout: pointsPerZone 으로 구역마다 카운트 적용(3번째 인자 제거)
- zoneSelectHoistPositions: 변형 스윕 제거 → 결정적 1회 검증(후보 1개)
- buildHoistPartitionInput / getZonePartitionInput 추가
- zoneVariantPointCounts 제거

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 미니맵 컴포넌트 `ZonePartitionMap.jsx`

> presentational. 단위테스트 없음(로직은 Task 2의 `buildZonePartitionView`에서 검증). 빌드/린트로 검증.

**Files:**
- Create: `apps/module-unit-studio/src/components/ZonePartitionMap.jsx`

- [ ] **Step 1: 컴포넌트 작성**

`apps/module-unit-studio/src/components/ZonePartitionMap.jsx` 생성:
```jsx
/**
 * 구역 분할 미니맵(SVG, presentational). buildZonePartitionView 결과만 그린다.
 * 셀 클릭 → onCycle(bandIndex, subIndex)로 포인트 수 순환. store/three 비의존.
 * @param {{ view:object, onCycle:(bi:number,si:number)=>void, includePipe:boolean }} props
 */
export default function ZonePartitionMap({ view, onCycle, includePipe }) {
  if (!view) return null
  const { viewBox, cells, dots } = view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <svg
        viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', maxHeight: 240, aspectRatio: `${viewBox.w} / ${viewBox.h}`, background: '#0a0a18', borderRadius: 6, border: '1px solid #25254a' }}
      >
        <rect x={0} y={0} width={viewBox.w} height={viewBox.h} fill="none" stroke="#2a2a4a" strokeWidth={2} />
        {dots.map((d, i) => (
          <circle
            key={`d${i}`}
            cx={d.x} cy={d.y} r={4}
            fill={d.pipe ? (includePipe ? '#6aa0ff' : '#33405a') : '#8aa0b8'}
            opacity={d.pipe && !includePipe ? 0.35 : 0.7}
          />
        ))}
        {cells.map((c, i) => (
          <g key={`c${i}`} style={{ cursor: onCycle ? 'pointer' : 'default' }} onClick={() => onCycle?.(c.bandIndex, c.subIndex)}>
            <rect
              x={c.x} y={c.y} width={c.w} height={c.h}
              fill={c.thin ? 'rgba(255,196,71,0.10)' : 'rgba(0,209,255,0.06)'}
              stroke={c.thin ? '#FFC447' : '#00D1FF'} strokeWidth={2}
            />
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 - 10} textAnchor="middle" fontSize={30} fontWeight="800" fill="#cfe6ff">{c.label}</text>
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 24} textAnchor="middle" fontSize={36} fontWeight="900" fill={c.thin ? '#FFC447' : '#37E08A'}>{c.points}점</text>
            <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 52} textAnchor="middle" fontSize={20} fill="#6a7a92">노드 {c.nodeCount}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#6a7a92' }}>
        <span>↑ Y · → X (평면도)</span>
        <span>셀 클릭 = 포인트 수 변경 · 주황 = 노드 부족</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 린트 통과 확인**

Run: `npm run lint`
Expected: 에러 없음(0 problems). 새 파일에 미사용 import/변수 없음.

- [ ] **Step 3: 커밋**

```bash
git add apps/module-unit-studio/src/components/ZonePartitionMap.jsx
git commit -m "✨ feat: ZonePartitionMap — 구역 분할 미니맵(SVG)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `HoistZoneConfig.jsx` — 미니맵 통합 + 구역별 포인트 편집

> presentational. 단위테스트 없음. 빌드/린트로 검증. `value.pointsPerZone` 가 누락/형상 불일치여도 `reconcilePointsPerZone` 로 방어한다(Task 6 전에도 동작).

**Files:**
- Modify: `apps/module-unit-studio/src/components/HoistZoneConfig.jsx`

- [ ] **Step 1: 컴포넌트 재작성**

`HoistZoneConfig.jsx` 전체를 다음으로 교체:
```jsx
import { Layers, Minus, Plus } from 'lucide-react'
import { buildZonePartitionView, reconcilePointsPerZone } from '../data/hoistZonePartition.js'
import ZonePartitionMap from './ZonePartitionMap.jsx'

/**
 * 구역 기반 권상 선정 설정 폼 (controlled).
 * @param {{ value:{bandAxis,bands,pointsPerZone,includePipe}, onChange:Function, mode:string, maxGroups:number, partitionInput:object|null }} props
 */
export default function HoistZoneConfig({ value, onChange, mode, maxGroups, partitionInput }) {
  const ceiling = mode === 'ceiling'
  const validPoints = ceiling ? [3, 4] : [2, 3, 4]
  const bands = value.bands
  const groupCount = bands.reduce((n, b) => n + Math.max(1, b), 0)
  const over = groupCount > maxGroups

  // bands 모양에 맞춰 정규화한 pointsPerZone 로 작업(누락/형상 불일치 방어)
  const ppz = reconcilePointsPerZone(bands, value.pointsPerZone, validPoints, 3)

  const patch = (p) => onChange({ ...value, ...p })
  const commitBands = (nextBands) => onChange({
    ...value,
    bands: nextBands,
    pointsPerZone: reconcilePointsPerZone(nextBands, ppz, validPoints, 3),
  })
  const setBand = (i, v) => {
    const next = [...bands]
    next[i] = Math.max(1, Math.min(maxGroups, v))
    commitBands(next)
  }
  const addBand = () => { if (!ceiling && bands.length < maxGroups) commitBands([...bands, 1]) }
  const removeBand = (i) => { if (!ceiling && bands.length > 1) commitBands(bands.filter((_, j) => j !== i)) }
  const cycleCell = (bi, si) => {
    const cur = ppz[bi]?.[si] ?? validPoints[0]
    const next = validPoints[(validPoints.indexOf(cur) + 1) % validPoints.length]
    const nextPpz = ppz.map(row => [...row])
    if (!nextPpz[bi]) nextPpz[bi] = []
    nextPpz[bi][si] = next
    patch({ pointsPerZone: nextPpz })
  }

  const view = partitionInput
    ? buildZonePartitionView(partitionInput.bbox, { ...value, bands, pointsPerZone: ppz }, partitionInput.nodeEntries, partitionInput.pipeNodes)
    : null

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

      {/* 미니맵(구역 도식 + 구역별 포인트 편집) */}
      {view
        ? <ZonePartitionMap view={view} onCycle={cycleCell} includePipe={value.includePipe} />
        : <div style={{ fontSize: 11, color: '#6a7a92', padding: '8px 2px' }}>모델이 로드되면 구역 도식이 표시됩니다.</div>}

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

- [ ] **Step 2: 린트 통과 확인**

Run: `npm run lint`
Expected: 에러 없음. (`POINT_OPTS` 상수 제거됨, 미사용 없음.)

- [ ] **Step 3: 커밋**

```bash
git add apps/module-unit-studio/src/components/HoistZoneConfig.jsx
git commit -m "✨ feat: HoistZoneConfig — 미니맵 통합 + 구역별 포인트 편집

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `HoistAutoResultModal.jsx` — 기본 config + partitionInput 주입

**Files:**
- Modify: `apps/module-unit-studio/src/components/HoistAutoResultModal.jsx`

- [ ] **Step 1: import 에 `useMemo` 추가**

1번째 줄:
```js
import { useEffect, useRef, useState } from 'react'
```
를 다음으로 교체:
```js
import { useEffect, useRef, useState, useMemo } from 'react'
```

- [ ] **Step 2: `defaultZoneConfig` 를 pointsPerZone 으로 변경**

기존:
```js
const defaultZoneConfig = (mode) => mode === 'ceiling'
  ? { bandAxis: 'y', bands: [1], pointsPerGroup: 3, includePipe: false }
  : { bandAxis: 'y', bands: [1, 1], pointsPerGroup: 3, includePipe: false }
```
를 다음으로 교체:
```js
const defaultZoneConfig = (mode) => mode === 'ceiling'
  ? { bandAxis: 'y', bands: [1], pointsPerZone: [[3]], includePipe: false }
  : { bandAxis: 'y', bands: [1, 1], pointsPerZone: [[3], [3]], includePipe: false }
```

- [ ] **Step 3: `getZonePartitionInput` 구독 + partitionInput 계산**

`const maxGroups = getHoistMaxGroups(mode)` 줄 바로 아래에 추가:
```js
  const getPartitionInput = useEditStore(s => s.getZonePartitionInput)
  const partitionInput = useMemo(() => getPartitionInput(), [getPartitionInput])
```

- [ ] **Step 4: `HoistZoneConfig` 에 partitionInput 전달**

기존:
```js
              <HoistZoneConfig value={zoneConfig} onChange={setZoneConfig} mode={mode} maxGroups={maxGroups} />
```
를 다음으로 교체:
```js
              <HoistZoneConfig value={zoneConfig} onChange={setZoneConfig} mode={mode} maxGroups={maxGroups} partitionInput={partitionInput} />
```

- [ ] **Step 5: 빌드 + 전체 테스트 + 린트**

Run: `npm run lint && npm test && npm run build`
Expected: 린트 0 problems, 전체 테스트 PASS, 빌드 exit 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/module-unit-studio/src/components/HoistAutoResultModal.jsx
git commit -m "✨ feat: HoistAutoResultModal — 기본 config pointsPerZone + 미니맵 입력 주입

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 완료 후(마무리 — 별도 진행)

모든 Task 완료 후 `superpowers:finishing-a-development-branch` 로:
1. 전체 테스트 green / 린트 clean / 빌드 exit 0 재확인.
2. master 병합.
3. 버전 범프 `package.json` `0.0.78 → 0.0.79`.
4. `npm run package` → `release/module-unit-studio-0.0.79.zip`(+`.sha256`).
5. StudioProgram 2곳 복사: 백엔드-로컬 `C:\Coding\WorkBench\HiTessWorkBenchBackEnd\StudioProgram\`(1순위 스캔), UNC 아카이브(`-LiteralPath` 사용). sha256 검증.
6. 팀 서버(145) 반영은 zip 수동 복사만(프론트엔드 전용 — git pull·C# 재시작 불필요). 사용자 확인 후 수동.

---

## Self-Review (작성자 점검)

**1. Spec coverage**
- §3 데이터 모델(pointsPerZone, 재조정) → Task 1(reconcile/zoneCountFor), Task 5(편집 시 재조정), Task 6(기본값). ✅
- §4.1 buildZoneLayout per-zone → Task 3. ✅
- §4.1 buildZonePartitionView → Task 2. ✅
- §4.2 ZonePartitionMap → Task 4. ✅
- §4.3 HoistZoneConfig 미니맵 통합 → Task 5. ✅
- §4.4 buildHoistPartitionInput/getZonePartitionInput/zoneSelect 단순화/zoneVariantPointCounts 제거 → Task 3. ✅
- §4.5 모달 → Task 6. ✅
- §7 테스트 전략 → Task 1·2·3 테스트. ✅

**2. Placeholder scan** — 모든 코드 단계에 완전한 코드 포함, TBD/“적절히 처리” 없음. ✅

**3. Type consistency**
- `pointsPerZone: number[][]` 일관(Task 1·3·5·6). ✅
- `buildZoneLayout(input, config)` 2-인자 — Task 3 정의·호출 일치, 테스트도 2-인자. ✅
- `buildZonePartitionView(bbox, config, nodeEntries, pipeNodes, opts)` — Task 2 정의, Task 5 호출 시그니처 일치. ✅
- `getZonePartitionInput()` 반환 `{bbox,nodeEntries,pipeNodes,tolMm}` — 모달은 `bbox/nodeEntries/pipeNodes`만 사용. ✅
- `zoneSelectHoistPositions` 후보 1개 — 모달은 후보 배열을 그대로 렌더(개수 무관). ✅
- `adaptStabilityReportToCandidate(report, {groups, label})` — 어댑터는 `ctx.label` 우선 사용(무변경). ✅
