/**
 * 구역 기반 권상 위치 선정 — 순수 기하/선택 함수 모음.
 * three/스토어/네트워크 의존 없음(2D XY 수학) → 단위테스트 용이.
 */

/**
 * 축 범위 [lo,hi] 를 n 등분하되, 인덱스 중심 n/2 를 앵커 c(무게중심 좌표)에 고정한 경계값.
 * 저측 인덱스 [0..n/2] 는 lo→c, 고측 [n/2..n] 는 c→hi 로 선형 분배한다.
 *   - 짝수 n → c 가 내부 경계가 된다(2분할이면 정확히 c 에서 갈림 → 2×2 교점 = COG).
 *   - 홀수 n → c 가 인덱스 중심(가운데 셀 내부) → 격자 전체의 중심 = c.
 *   - c 가 bbox 중앙이면 등분할과 수식적으로 동일하다(앵커 미지정 시 하위호환).
 * c 가 비유한이면 bbox 중앙((lo+hi)/2)을 사용해 등분할로 폴백. c 는 퇴화 셀 방지를 위해
 * [lo, hi] 안쪽으로 살짝 clamp 한다.
 * @returns {number} i 번째 경계 위치(i=0 → lo, i=n → hi, 둘 다 정확)
 */
export function anchoredBoundary(lo, hi, c, i, n) {
  if (!(n > 0)) return lo
  const mid = n / 2
  const span = hi - lo
  let cc = Number.isFinite(c) ? c : (lo + hi) / 2
  if (span > 0) {
    const m = span * 1e-3
    cc = Math.min(Math.max(cc, lo + m), hi - m)
  } else {
    cc = lo
  }
  return i <= mid
    ? lo + (cc - lo) * (i / mid)
    : cc + (hi - cc) * ((i - mid) / mid)
}

/**
 * XY 풋프린트를 "행별 가변 분할"로 나눈다.
 * bandAxis 로 풋프린트를 bands.length 개 밴드로 자르고, 각 밴드를 직교축으로
 * 그 밴드의 하위구역 수만큼 나눈다. 각 셀 = 한 권상 그룹 후보.
 * config.anchor({x,y}) 가 주어지면 무게중심(COG) 기준으로 분할한다(위 anchoredBoundary 참조).
 * 없으면 bbox 기하 중심 기준 등분할(기존 동작과 동일).
 *
 * @param {{minX,maxX,minY,maxY}} bbox  모델 XY bbox(mm)
 * @param {{bandAxis:'x'|'y', bands:number[], anchor?:{x:number,y:number}}} config
 * @returns {Array<{id,bandIndex,subIndex,xMin,xMax,yMin,yMax}>}
 */
export function partitionZones(bbox, config) {
  const bandAxis = config?.bandAxis === 'x' ? 'x' : 'y'
  const bands = Array.isArray(config?.bands) && config.bands.length > 0 ? config.bands : [1]
  const anchor = (config?.anchor && Number.isFinite(config.anchor.x) && Number.isFinite(config.anchor.y))
    ? config.anchor : null
  const xMin = bbox.minX, xMax = bbox.maxX, yMin = bbox.minY, yMax = bbox.maxY
  const bandCount = bands.length
  const zones = []
  let id = 0
  for (let bi = 0; bi < bandCount; bi++) {
    const subCount = Math.max(1, Math.floor(bands[bi]) || 1)
    let bxMin = xMin, bxMax = xMax, byMin = yMin, byMax = yMax
    if (bandAxis === 'y') {
      byMin = anchoredBoundary(yMin, yMax, anchor?.y, bi, bandCount)
      byMax = anchoredBoundary(yMin, yMax, anchor?.y, bi + 1, bandCount)
    } else {
      bxMin = anchoredBoundary(xMin, xMax, anchor?.x, bi, bandCount)
      bxMax = anchoredBoundary(xMin, xMax, anchor?.x, bi + 1, bandCount)
    }
    for (let si = 0; si < subCount; si++) {
      let zxMin = bxMin, zxMax = bxMax, zyMin = byMin, zyMax = byMax
      if (bandAxis === 'y') {
        // 하위구역은 직교축(X) 전 범위를 앵커 X 기준으로 나눈다 → 모든 밴드에서 X 경계 정렬(깨끗한 격자).
        zxMin = anchoredBoundary(bxMin, bxMax, anchor?.x, si, subCount)
        zxMax = anchoredBoundary(bxMin, bxMax, anchor?.x, si + 1, subCount)
      } else {
        zyMin = anchoredBoundary(byMin, byMax, anchor?.y, si, subCount)
        zyMax = anchoredBoundary(byMin, byMax, anchor?.y, si + 1, subCount)
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
    const count = zoneCountFor(config, z.bandIndex, z.subIndex, 2)
    if (count <= 0) continue   // 0점 구역 = 제외(권상 포인트 없음)
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

/**
 * pointsPerZone 를 bands 모양에 맞춰 재조정한다(순수).
 * 기존 값은 위치별로 보존, 부족분은 defaultPoints, 모든 값은 validPoints 로 클램프.
 * @param {number[]} bands  밴드별 하위구역 수
 * @param {number[][]|null} prev  기존 pointsPerZone
 * @param {number[]} validPoints  허용 포인트 값(예: [2,3,4] 또는 [3,4])
 * @param {number} defaultPoints  새 셀 기본값 (validPoints에 없으면 validPoints[0] 사용)
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
 * 포인트 수의 '자동' 센티널 — 엔진(RequestedPointAuto=-1)이 방식이 허용하는 2~4점을
 * 모두 탐색해 랭킹으로 제안한다(사용자 규칙 2026-07-03: 구역은 사용자가, 점 수는 엔진이).
 */
export const POINTS_AUTO = -1

/**
 * 구역(bandIndex, subIndex)의 포인트 수. 누락 시 defaultPoints. 0 = 제외 구역, -1 = 자동.
 * @param {{pointsPerZone?:number[][]}} config
 * @returns {number}
 */
export function zoneCountFor(config, bandIndex, subIndex, defaultPoints = 2) {
  const v = config?.pointsPerZone?.[bandIndex]?.[subIndex]
  // 미설정(null/undefined)은 기본값 경로. Number(null)===0 이라 가드 없이 그냥 Number 하면
  // '미설정'(null)이 '명시적 제외'(0)로 오해된다 → early 가드로 구분.
  if (v == null) return defaultPoints
  const n = Number(v)
  return Number.isFinite(n) ? n : defaultPoints
}

/** 4점 구역 형상 상수 — 'quad'(사각형) | 'line'(일직선). (사용자 규칙 2026-07-03: 구역별 지정) */
export const SHAPE_QUAD = 'quad'
export const SHAPE_LINE = 'line'

/**
 * 구역(bandIndex, subIndex)의 4점 형상 선호('quad'|'line'). 미설정/비정상이면 def.
 * 포인트 수가 4가 아닌 구역에서는 의미 없다(엔진이 4점 그룹에만 적용).
 * @param {{shapePerZone?:string[][]}} config
 * @returns {'quad'|'line'}
 */
export function zoneShapeFor(config, bandIndex, subIndex, def = SHAPE_QUAD) {
  const v = config?.shapePerZone?.[bandIndex]?.[subIndex]
  return (v === SHAPE_QUAD || v === SHAPE_LINE) ? v : def
}

/**
 * shapePerZone 를 bands 모양에 맞춰 재조정한다(순수). 기존 값은 위치별로 보존, 부족분/비정상은 def.
 * pointsPerZone 와 형상은 항상 같은 [행][열] 격자를 공유한다.
 * @param {number[]} bands
 * @param {string[][]|null} prev
 * @param {'quad'|'line'} def  새 셀 기본 형상(기본 'quad')
 * @returns {string[][]}
 */
export function reconcileShapePerZone(bands, prev, def = SHAPE_QUAD) {
  const src = Array.isArray(prev) ? prev : []
  const list = Array.isArray(bands) && bands.length > 0 ? bands : [1]
  const norm = (v) => (v === SHAPE_QUAD || v === SHAPE_LINE) ? v : def
  return list.map((b, i) => {
    const sub = Math.max(1, Math.floor(b) || 1)
    const prevRow = Array.isArray(src[i]) ? src[i] : []
    const row = []
    for (let j = 0; j < sub; j++) row.push(j < prevRow.length ? norm(prevRow[j]) : def)
    return row
  })
}

/**
 * 실제 권상 그룹이 되는 구역 수 = 포인트 수가 0(제외)이 아닌 셀의 개수.
 * 명시적으로 0 인 셀만 제외하고, 값이 없는(미설정) 셀은 기본값(활성)으로 센다.
 * @param {number[]} bands
 * @param {number[][]|null|undefined} pointsPerZone
 * @returns {number}
 */
export function countActiveZones(bands, pointsPerZone) {
  const list = Array.isArray(bands) && bands.length > 0 ? bands : [1]
  let n = 0
  for (let i = 0; i < list.length; i++) {
    const sub = Math.max(1, Math.floor(list[i]) || 1)
    const row = Array.isArray(pointsPerZone?.[i]) ? pointsPerZone[i] : []
    for (let j = 0; j < sub; j++) {
      const v = row[j]
      // 명시적 0 만 제외. null/undefined(미설정)은 Number(null)===0 이라도 활성으로 센다
      // (미설정 셀이 '제외'로 오해되지 않도록 v == null 을 먼저 걸러낸다).
      if (v != null && Number(v) === 0) continue
      n++
    }
  }
  return n
}

/**
 * 구역 미니맵용 SVG 뷰모델(순수). 모델 XY(mm)를 viewBox 좌표로 매핑한다.
 * 방향(사용자 요청, 0.0.156): 모델 +X → 화면 오른쪽(가로=X), +Y → 화면 위(세로=Y).
 *   → 가로(W)는 X 범위, 세로(H)는 Y 범위에 비례한다. (SVG 는 y 가 아래로 증가)
 *   ⚠ 3D 평면도('A' 뷰, ↑X·←Y)와는 90° 돌아가 있다 — 구역 지도만 바꿨다. 썸네일은 그대로.
 * nodeEntries 는 배열([id,{x,y,z}])이어야 한다(두 번 순회).
 * @param {{minX,maxX,minY,maxY}} bbox
 * @param {{bandAxis:'x'|'y', bands:number[], pointsPerZone?:number[][]}} config
 * @param {Array<[number,{x,y}]>} nodeEntries
 * @param {Set<number>|null} pipeNodes
 * @param {{maxDim?:number, maxDots?:number}} [opts]
 * @returns {{viewBox:{x,y,w,h}, cells:Array, dots:Array}}
 */
export function buildZonePartitionView(bbox, config, nodeEntries, pipeNodes, opts = {}) {
  const maxDim = opts.maxDim ?? 1000
  const maxDots = opts.maxDots ?? 2000
  const b = bbox ?? { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  const spanX = (b.maxX - b.minX) || 1
  const spanY = (b.maxY - b.minY) || 1
  // 가로(W)=X범위, 세로(H)=Y범위 (→X · ↑Y).
  const aspectWH = spanX / spanY
  let W, H
  if (aspectWH >= 1) { W = maxDim; H = Math.max(120, Math.round(maxDim / aspectWH)) }
  else { H = maxDim; W = Math.max(120, Math.round(maxDim * aspectWH)) }
  const sh = (mx) => ((mx - b.minX) / spanX) * W // 가로: 모델 +X → 화면 오른쪽
  const sv = (my) => ((b.maxY - my) / spanY) * H // 세로: 모델 +Y → 화면 위 (svg y-down)

  const axis = config?.bandAxis === 'x' ? 'x' : 'y'
  const zones = partitionZones(b, config)
  const byZone = assignNodesToZones(zones, nodeEntries)
  const cells = zones.map(z => {
    const xa = sh(z.xMin), xb = sh(z.xMax)
    const ya = sv(z.yMax), yb = sv(z.yMin)
    const points = zoneCountFor(config, z.bandIndex, z.subIndex, 2)
    const shape = zoneShapeFor(config, z.bandIndex, z.subIndex)   // 4점 구역 형상('quad'|'line')
    const nodeCount = (byZone.get(z.id) ?? []).length
    const label = axis === 'y' ? `${z.bandIndex + 1}행·${z.subIndex + 1}` : `${z.bandIndex + 1}열·${z.subIndex + 1}`
    // 명시적 0 만 제외. -1(자동)은 활성 구역 — 노드 부족 판정은 최소 점 수(2) 기준.
    const excluded = points === 0
    const minNeeded = points === POINTS_AUTO ? 2 : points
    return {
      bandIndex: z.bandIndex, subIndex: z.subIndex,
      x: Math.min(xa, xb), y: Math.min(ya, yb),
      w: Math.abs(xb - xa), h: Math.abs(yb - ya),
      label, points, shape, nodeCount, excluded, thin: !excluded && nodeCount < minNeeded,
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
    dots.push({ x: sh(n.x), y: sv(n.y), pipe: pipeNodes ? pipeNodes.has(id) : false })
  }

  // COG 마커 — anchor(무게중심) 가 있으면 화면좌표로 변환해 미니맵에 십자 표시.
  const anchor = (config?.anchor && Number.isFinite(config.anchor.x) && Number.isFinite(config.anchor.y))
    ? config.anchor : null
  const cog = anchor ? { x: sh(anchor.x), y: sv(anchor.y) } : null

  return { viewBox: { x: 0, y: 0, w: W, h: H }, cells, dots, cog }
}
