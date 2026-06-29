// 권상 위치 자동 선정 — 순수 기하/최적화 함수 모음.
// store/three 의존 없음 → Node 환경 vitest 로 단위 테스트한다. 좌표 단위 mm. 탑다운 = (x,y).

/** 모델 노드를 XY 평면으로 투영(z 무시). @param {{nodeMap:Map}} stage @returns {{id:number,x:number,y:number}[]} */
export function projectNodesXY(stage) {
  const out = []
  const nm = stage?.nodeMap
  if (!nm || typeof nm.forEach !== 'function') return out
  nm.forEach((n, id) => out.push({ id, x: n.x, y: n.y }))
  return out
}

/** [lo,hi] 로 클램프 (hi<=lo 면 lo). */
export function clampDivider(v, lo, hi) {
  if (!(hi > lo)) return lo
  return Math.min(hi, Math.max(lo, v))
}

// 한 축의 분할선 위치: 분할선 1개 → 무게중심(범위 밖이면 중앙), 2개 이상 → 균등 분할.
function axisDividers(lo, hi, cogVal, count) {
  const nLines = Math.max(0, Math.round(count) - 1)
  if (nLines === 0) return []
  if (nLines === 1) {
    const c = Number.isFinite(cogVal) && cogVal > lo && cogVal < hi ? cogVal : (lo + hi) / 2
    return [c]
  }
  const lines = []
  for (let i = 1; i <= nLines; i++) lines.push(lo + ((hi - lo) * i) / (nLines + 1))
  return lines
}

/**
 * 초기 분할선 위치.
 * @param {{minX,maxX,minY,maxY}} bbox @param {{x,y}} cog @param {number} divX @param {number} divY
 * @returns {{dividersX:number[], dividersY:number[]}}
 */
export function computeInitialDividers(bbox, cog, divX, divY) {
  return {
    dividersX: axisDividers(bbox.minX, bbox.maxX, cog?.x, divX),
    dividersY: axisDividers(bbox.minY, bbox.maxY, cog?.y, divY),
  }
}

/**
 * 분할선으로 구역 사각형 목록 생성. col=X 왼→오, row=Y 아래→위.
 * @returns {{id:string,col:number,row:number,minX,maxX,minY,maxY}[]}
 */
export function splitRegions(bbox, dividersX, dividersY) {
  const xs = [bbox.minX, ...[...dividersX].sort((a, b) => a - b), bbox.maxX]
  const ys = [bbox.minY, ...[...dividersY].sort((a, b) => a - b), bbox.maxY]
  const regions = []
  for (let col = 0; col < xs.length - 1; col++) {
    for (let row = 0; row < ys.length - 1; row++) {
      regions.push({
        id: `c${col}_r${row}`, col, row,
        minX: xs[col], maxX: xs[col + 1], minY: ys[row], maxY: ys[row + 1],
      })
    }
  }
  return regions
}

// value 보다 작은(strict) 분할선 개수 = 버킷 인덱스. 경계선 위 값은 낮은 인덱스로 귀속.
function bucketIndex(v, dividers) {
  let i = 0
  while (i < dividers.length && dividers[i] < v) i++
  return i
}

/**
 * 노드를 구역별로 배정(각 노드 정확히 1구역). 경계선 위 노드는 낮은 인덱스 구역.
 * @returns {{ [regionId:string]: number[] }}
 */
export function assignNodesToRegions(projectedNodes, regions, dividersX, dividersY) {
  const xs = [...dividersX].sort((a, b) => a - b)
  const ys = [...dividersY].sort((a, b) => a - b)
  const out = {}
  for (const r of regions) out[r.id] = []
  for (const p of projectedNodes) {
    const id = `c${bucketIndex(p.x, xs)}_r${bucketIndex(p.y, ys)}`
    if (out[id]) out[id].push(p.id)
  }
  return out
}

/**
 * 모델 XY(mm) ↔ 화면(px) 변환. y 반전(모델 y up → 화면 y down). bbox 를 여백 pad 안에 맞춤.
 * @returns {{scale:number, toScreen:(x,y)=>{sx,sy}, toModel:(sx,sy)=>{x,y}}}
 */
export function fitTransform(bbox, width, height, pad = 24) {
  const w = (bbox.maxX - bbox.minX) || 1
  const h = (bbox.maxY - bbox.minY) || 1
  const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h)
  const offX = pad + ((width - 2 * pad) - w * scale) / 2
  const offY = pad + ((height - 2 * pad) - h * scale) / 2
  return {
    scale,
    toScreen: (x, y) => ({ sx: offX + (x - bbox.minX) * scale, sy: height - (offY + (y - bbox.minY) * scale) }),
    toModel: (sx, sy) => ({ x: bbox.minX + (sx - offX) / scale, y: bbox.minY + ((height - sy) - offY) / scale }),
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

/**
 * 구역 중심. massByNode(nodeId→t) 가 있으면 질량가중, 없으면 기하평균.
 * @param {{id,x,y}[]} regionNodes @param {Map<number,number>} [massByNode] @returns {{x,y}|null}
 */
export function regionCenter(regionNodes, massByNode = null) {
  if (!regionNodes || regionNodes.length === 0) return null
  let tw = 0, cx = 0, cy = 0
  for (const p of regionNodes) {
    const w = massByNode?.get?.(p.id)
    if (Number.isFinite(w) && w > 0) { tw += w; cx += w * p.x; cy += w * p.y }
  }
  if (tw > 0) return { x: cx / tw, y: cy / tw }
  let gx = 0, gy = 0
  for (const p of regionNodes) { gx += p.x; gy += p.y }
  return { x: gx / regionNodes.length, y: gy / regionNodes.length }
}

/**
 * 구역 중심 C 주위로 n개 이상 배치. 반경 = 0.4 × min(반폭,반높이).
 * n=2: 장축 ±, n=4: 45° 오프셋 사각, 그 외 n≥3: 등각 링.
 * @returns {{x,y}[]}
 */
export function idealTargets(center, n, region) {
  const halfW = (region.maxX - region.minX) / 2
  const halfH = (region.maxY - region.minY) / 2
  const base = Math.min(halfW || halfH, halfH || halfW)
  const R = (base > 0 ? base : Math.max(halfW, halfH, 1)) * 0.4
  const cx = center.x, cy = center.y
  if (n <= 1) return [{ x: cx, y: cy }]
  if (n === 2) {
    return halfW >= halfH
      ? [{ x: cx - R, y: cy }, { x: cx + R, y: cy }]
      : [{ x: cx, y: cy - R }, { x: cx, y: cy + R }]
  }
  const offset = n === 4 ? Math.PI / 4 : -Math.PI / 2
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = offset + (2 * Math.PI * i) / n
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) })
  }
  return pts
}

/** 볼록껍질 면적(mm²). 점 2개 이하/공선이면 0. (monotonic chain) */
export function convexHullArea(points) {
  const pts = (points ?? []).filter(Boolean)
  if (pts.length < 3) return 0
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
  if (hull.length < 3) return 0
  let area = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

/**
 * 권상 배치 점수(↑ = 좋음). 균형 0.6 + 분산 0.4 − 군집벌점 0.3.
 * @param {{x,y}[]} points @param {{x,y}} center @param {{minX,maxX,minY,maxY}} region
 */
export function scoreLayout(points, center, region) {
  const pts = (points ?? []).filter(Boolean)
  if (pts.length === 0) return -Infinity
  const D = Math.hypot(region.maxX - region.minX, region.maxY - region.minY) || 1
  const A = ((region.maxX - region.minX) * (region.maxY - region.minY)) || (D * D)
  let mx = 0, my = 0
  for (const p of pts) { mx += p.x; my += p.y }
  mx /= pts.length; my /= pts.length
  const eb = clamp01(Math.hypot(mx - center.x, my - center.y) / D)
  let spread
  if (pts.length <= 2) {
    spread = pts.length === 2 ? clamp01(Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / D) : 0
  } else {
    spread = clamp01(convexHullArea(pts) / A)
  }
  let minPair = Infinity
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      minPair = Math.min(minPair, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y))
  const cp = pts.length >= 2 ? clamp01(1 - minPair / (0.25 * D)) : 0
  return 0.6 * (1 - eb) + 0.4 * spread - 0.3 * cp
}
