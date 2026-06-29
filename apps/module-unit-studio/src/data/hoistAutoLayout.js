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
