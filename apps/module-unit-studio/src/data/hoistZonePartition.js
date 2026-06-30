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
