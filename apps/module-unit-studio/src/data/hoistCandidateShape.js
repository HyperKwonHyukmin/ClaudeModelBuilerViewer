/**
 * 권상 후보의 평면(XY) 형상 지표 — 엔진 HoistPositionOptimizer 의 정의와 일치하는 순수 함수.
 * (네트워크/스토어 의존 없음 → 단위테스트 용이. 썸네일·지표 배지·정렬에 사용.)
 *
 *  · 면적        : atan2 중심각 정렬 후 shoelace (mm²)
 *  · 정사각형도  : 면적 / 최장변²  ∈ [0,1]  (정사각형=1, 2:1직사각형=0.5, 60°마름모≈0.87, 일직선=0)
 *  · 축정렬편차  : 각 변이 X/Y 축에서 벗어난 최대 각도(도) ∈ [0,45]  (축평행=0)
 */

function toXY(nodes) {
  return (nodes ?? [])
    .map(n => ({ x: Number(n?.x), y: Number(n?.y) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
}

function orderByCentroidAngle(pts) {
  if (pts.length < 3) return pts.slice()
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
}

function polygonArea(ordered) {
  if (ordered.length < 3) return 0
  let a = 0
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i], q = ordered[(i + 1) % ordered.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a / 2)
}

/** 그룹 노드의 XY 를 중심각 순으로 정렬해 반환(폴리곤 그리기용). */
export function groupPointsXY(group) {
  return orderByCentroidAngle(toXY(group?.nodes))
}

export function groupAreaMm2(group) {
  return polygonArea(groupPointsXY(group))
}

export function groupSquareness(group) {
  const ord = groupPointsXY(group)
  if (ord.length < 3) return 0
  let maxSide = 0
  for (let i = 0; i < ord.length; i++) {
    const p = ord[i], q = ord[(i + 1) % ord.length]
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d > maxSide) maxSide = d
  }
  if (maxSide < 1e-6) return 0
  return Math.min(1, polygonArea(ord) / (maxSide * maxSide))
}

export function groupAxisDevDeg(group) {
  const ord = groupPointsXY(group)
  if (ord.length < 2) return 0
  let dev = 0
  for (let i = 0; i < ord.length; i++) {
    const p = ord[i], q = ord[(i + 1) % ord.length]
    const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y)
    if (Math.hypot(dx, dy) > 1e-9) {
      const a = Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180 / Math.PI
      if (a > dev) dev = a
    }
  }
  return dev
}

/** 2점(직선) 그룹의 길이(mm). 점이 2개가 아니면 0. */
export function groupLineLenMm(group) {
  const pts = toXY(group?.nodes)
  if (pts.length !== 2) return 0
  return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
}

/**
 * 4점 사각형의 대변(마주보는 두 변) 길이 동등성 ∈ [0,1] — 엔진 OppositeSideEquality 와 동일 정의.
 * 각 대변쌍 min/max 비율의 평균. 직사각형·평행사변형=1, 변 길이가 제각각일수록 낮다.
 * 4점이 아닌 그룹은 중립값 1(대변 개념 없음).
 */
export function groupOppositeSideEquality(group) {
  const ord = groupPointsXY(group)
  if (ord.length !== 4) return 1
  const sides = ord.map((p, i) => {
    const q = ord[(i + 1) % 4]
    return Math.hypot(q.x - p.x, q.y - p.y)
  })
  const ratio = (a, b) => {
    const hi = Math.max(a, b)
    return hi < 1e-9 ? 0 : Math.min(a, b) / hi
  }
  return (ratio(sides[0], sides[2]) + ratio(sides[1], sides[3])) / 2
}

/**
 * 후보 전체 형상 요약.
 *  areaMm2/areaM2 : 그룹 면적 합
 *  minSquareness  : 그룹 중 가장 나쁜 정사각형도(면적>0 그룹 기준)
 *  maxAxisDevDeg  : 그룹 중 가장 나쁜 축편차 — 2점 직선 그룹도 포함(대각 직선 감지, 2026-07-03)
 *  maxLineLenMm   : 2점(직선) 그룹 중 가장 긴 길이(mm). 직선 그룹이 없으면 0.
 *  minSideEquality: 4점 그룹 중 가장 나쁜 대변 동등성 ∈ [0,1]. 4점 그룹이 없으면 null.
 *  groups         : [{ ptsXY, areaMm2, squareness, axisDevDeg, lineLenMm, sideEquality }]
 */
export function candidateFootprint(candidate) {
  const groups = (candidate?.groups ?? []).map(g => {
    const ptsXY = groupPointsXY(g)
    return {
      ptsXY,
      areaMm2: polygonArea(ptsXY),
      squareness: groupSquareness(g),
      axisDevDeg: groupAxisDevDeg(g),
      lineLenMm: groupLineLenMm(g),
      sideEquality: groupOppositeSideEquality(g),
    }
  })
  const withArea = groups.filter(g => g.areaMm2 > 0)
  // 축편차는 변이 존재하는 모든 그룹(2점 직선 포함) 기준 — 짧은/대각 직선도 지표에 잡힌다.
  const withEdges = groups.filter(g => g.ptsXY.length >= 2)
  const quads = groups.filter(g => g.ptsXY.length === 4)
  const areaMm2 = groups.reduce((s, g) => s + g.areaMm2, 0)
  const lines = groups.filter(g => g.lineLenMm > 0)
  return {
    areaMm2,
    areaM2: areaMm2 / 1e6,
    minSquareness: withArea.length ? Math.min(...withArea.map(g => g.squareness)) : 0,
    maxAxisDevDeg: withEdges.length ? Math.max(...withEdges.map(g => g.axisDevDeg)) : 0,
    maxLineLenMm: lines.length ? Math.max(...lines.map(g => g.lineLenMm)) : 0,
    minSideEquality: quads.length ? Math.min(...quads.map(g => g.sideEquality)) : null,
    groups,
  }
}

/**
 * 평면도(앱 3D 'A' 뷰) 투영기 — 모델 XY(mm)를 SVG 화면좌표로 매핑한다.
 * 앱의 X/Y 평면 뷰는 +Z 에서 내려다보며 camera.up=+X 이므로 화면에서:
 *   · 모델 +X(종방향) → 화면 위쪽
 *   · 모델 +Y(횡방향) → 화면 왼쪽
 * (SVG 는 y 가 아래로 증가) → 3D 뷰어의 평면도와 정확히 동일한 방향으로 보이게 한다.
 *
 * @param {{minX,maxX,minY,maxY}} frame 모델 XY bbox(mm)
 * @param {{width:number,height:number,pad?:number}} box 캔버스 크기(px)
 * @returns {{ project:(p:{x,y})=>{x:number,y:number}, scale:number, rect:{x,y,w,h} }}
 */
export function planViewProjector(frame, { width, height, pad = 6 } = {}) {
  const rangeX = Math.max(1e-6, frame.maxX - frame.minX) // 종방향 → 세로
  const rangeY = Math.max(1e-6, frame.maxY - frame.minY) // 횡방향 → 가로
  const usableW = Math.max(1, width - 2 * pad)
  const usableH = Math.max(1, height - 2 * pad)
  const scale = Math.min(usableW / rangeY, usableH / rangeX)
  const contentW = rangeY * scale
  const contentH = rangeX * scale
  const offX = pad + (usableW - contentW) / 2
  const offY = pad + (usableH - contentH) / 2
  const project = (p) => ({
    x: offX + (frame.maxY - p.y) * scale, // +Y → 왼쪽
    y: offY + (frame.maxX - p.x) * scale, // +X → 위 (svg y-down)
  })
  return { project, scale, rect: { x: offX, y: offY, w: contentW, h: contentH } }
}

/** 후보의 모든 그룹 점을 감싸는 XY bbox (썸네일 프레임 폴백용). 점 없으면 null. */
export function candidateBBoxXY(candidate) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const g of candidate?.groups ?? []) {
    for (const p of groupPointsXY(g)) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}
