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
