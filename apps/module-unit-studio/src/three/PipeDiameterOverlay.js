import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const COLOR_GE = 0x40FF8E   // 임계 외경 이상 — 권상 후보 (밝은 녹색)
const COLOR_LT = 0xFF4E55   // 임계 외경 미만 — 부적합 (선명한 적색)
const PIXEL_GE = 6           // 권상 후보는 굵게 — 화면 픽셀 기준 굵기
const PIXEL_LT = 4           // 미만도 또렷이 보이도록 충분히 굵게
const OPACITY_GE = 0.95
const OPACITY_LT = 0.92

/**
 * Pipe 카테고리 element 들을 임계 외경(threshold) 기준으로 두 그룹으로 색칠한
 * LineSegments2 overlay 를 만든다. threshold 가 null/0 이면 빈 Group 반환.
 *
 * 사용자가 권상 위치로 사용 가능한 배관(임계 이상)을 빠르게 식별하도록 돕는다.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {number|null} thresholdMm
 * @param {{width:number, height:number}} resolution  - LineMaterial 픽셀 굵기 환산용
 * @returns {THREE.Group}
 */
export function buildPipeDiameterOverlay(stageData, thresholdMm, resolution) {
  const root = new THREE.Group()
  root.name = 'PipeDiameterOverlay'
  if (!stageData || !thresholdMm || !(thresholdMm > 0)) return root

  const elements = stageData.elements ?? []
  const ge = []   // [x1,y1,z1, x2,y2,z2, ...]
  const lt = []
  for (const e of elements) {
    if (e.category !== 'Pipe') continue
    const prop = stageData.getProperty?.(e.propertyId)
    const od = getPipeOuterDiameter(prop)
    if (od == null) continue
    const a = stageData.getNodePos(e.startNode)
    const b = stageData.getNodePos(e.endNode)
    if (!a || !b) continue
    const target = od >= thresholdMm ? ge : lt
    target.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }

  const res = new THREE.Vector2(
    Math.max(resolution?.width ?? 1, 1),
    Math.max(resolution?.height ?? 1, 1),
  )

  if (ge.length > 0) root.add(makeSegments(ge, COLOR_GE, OPACITY_GE, PIXEL_GE, res))
  if (lt.length > 0) root.add(makeSegments(lt, COLOR_LT, OPACITY_LT, PIXEL_LT, res))

  return root
}

function makeSegments(coords, colorHex, opacity, linePx, resolution) {
  const geo = new LineSegmentsGeometry()
  geo.setPositions(coords)

  const mat = new LineMaterial({
    color: colorHex,
    linewidth: linePx,
    transparent: true,
    opacity,
    depthTest: false,
    dashed: false,
  })
  mat.resolution.copy(resolution)
  mat.worldUnits = false   // 픽셀 단위 굵기

  const seg = new LineSegments2(geo, mat)
  seg.computeLineDistances()
  seg.renderOrder = 45
  return seg
}

/**
 * 단면 정의에서 외경(mm) 을 추출한다. Rod/Tube 만 의미 있는 값이며
 * Bar/L/H 등 비-원형 단면은 null 반환 (이 overlay 의 비교 대상이 아님).
 */
export function getPipeOuterDiameter(prop) {
  if (!prop) return null
  const d = prop.dims ?? []
  switch (prop.kind) {
    case 'Rod':
    case 'Tube':
      return Number.isFinite(d[0]) ? d[0] : null
    default:
      return null
  }
}
