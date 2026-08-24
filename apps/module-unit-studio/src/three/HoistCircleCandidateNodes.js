import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'
import { buildShellMarkers, buildCoreMarkers, makeCandidateLabel } from './HoistCandidateNodes.js'

// Circle Guide 후보 강조 — 활성 권상 그룹의 "첫 노드"로 가상 원을 만들고 그 원 근처 노드를 후보로 강조한다.
//
// ── 동작 ──
//   · 중심 = 무게중심(COG)의 수평(XY) 위치. 반지름 r = COG ↔ 첫 노드 수평(XY) 거리.
//   · 후보 = |수평거리(node, COG) − r| ≤ tol 이고, "첫 노드와 같은 Z 레벨"(|Δz| ≤ tol)인 노드.
//   · X·Y 평면 = 앱 평면도(A키) 뷰와 동일 → 같은 데크(높이)에서 무게중심 기준 등거리 지점을 고르도록 돕는다.
//   · tol 은 사용자 지정값(useEditStore.hoistCircleTolMm) 우선, 없으면 모델 수평 크기 기반 자동값.
//
// ── 스타일 ── 기존 HoistCandidateNodes 와 동일 민트 토큰/2겹 마커/라벨을 공유하고,
//              추가로 "가상 링"(첫 노드 Z 높이의 수평 원, 라인 루프)을 그려 원을 시각화한다.

const CAND_COLOR = COLORS.hoistCandidate

/**
 * Circle Guide 자동 Tolerance(mm). 사용자가 값을 비우면 이 값을 쓴다.
 * 모델 수평 대각선의 0.5%(최소 30mm) — 링 근처 노드를 적당히 잡을 밴드 폭.
 * @param {number} spanMm  모델 수평(XY) 대각 길이(mm)
 * @returns {number}
 */
export function autoHoistCircleTolMm(spanMm) {
  const s = Number.isFinite(spanMm) ? Math.max(0, spanMm) : 0
  return Math.max(30, s * 0.005)
}

/**
 * COG 수평 중심에서 반지름 r 인 링(±tol) 근처이면서 plateZ 와 같은 Z 레벨(±tol)인 노드 ID 를 고른다.
 * 수평거리 = hypot(x−cx, y−cy). plateZ 가 비유한(null 등)이면 Z 조건을 생략한다(수직 원통 폴백).
 *
 * @param {Iterable<[number, {x:number,y:number,z:number}]>} nodeEntries  nodeMap 처럼 [id, {x,y,z}] 순회 가능한 것
 * @param {{x:number,y:number}} centerXY  COG 수평 위치(mm)
 * @param {number} radius  반지름(mm, 양수)
 * @param {number} tolMm   허용오차(mm, 비음수) — 링 거리와 Z 레벨 모두에 적용
 * @param {number|null} plateZ  기준 Z 레벨(mm, 보통 첫 노드의 z). 비유한이면 Z 조건 생략
 * @param {Set<number>|number[]} [usedIds]  이미 그룹에 속해 제외할 노드 ID
 * @returns {number[]}
 */
export function selectHoistCircleCandidateNodes(nodeEntries, centerXY, radius, tolMm, plateZ, usedIds) {
  const out = []
  if (!nodeEntries || !centerXY) return out
  if (!Number.isFinite(centerXY.x) || !Number.isFinite(centerXY.y)) return out
  if (!Number.isFinite(radius) || radius <= 0) return out
  if (!Number.isFinite(tolMm) || tolMm < 0) return out
  const zGated = Number.isFinite(plateZ)   // plateZ 유한 → "같은 Z 레벨" 조건 추가
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds ?? [])
  for (const [id, n] of nodeEntries) {
    if (used.has(id)) continue
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
    if (zGated && !(Number.isFinite(n.z) && Math.abs(n.z - plateZ) <= tolMm)) continue
    const d = Math.hypot(n.x - centerXY.x, n.y - centerXY.y)
    if (Math.abs(d - radius) <= tolMm) out.push(id)
  }
  return out
}

/**
 * Circle Guide 후보 강조 오버레이(가상 링 + 후보 마커 + 라벨)를 만든다.
 *
 * @param {Record<number, number[]>} hoistGroups
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {number|null} activeGroupId  - 첫 노드가 반지름 기준이 되는 활성 그룹 ID
 * @param {{x:number,y:number,z:number}|null} cogMm  - 무게중심(mm)
 * @param {number|null} [toleranceMm]  - 사용자 지정 Tolerance(mm). null/0이하면 자동값
 * @returns {THREE.Group}
 */
export function buildHoistCircleCandidateNodes(hoistGroups, stageData, activeGroupId, cogMm, toleranceMm = null) {
  const root = new THREE.Group()
  root.name = 'HoistCircleCandidateNodes'
  if (!stageData || !hoistGroups || !stageData.nodeMap || !stageData.center) return root
  if (!Number.isInteger(activeGroupId)) return root
  if (!cogMm || !Number.isFinite(cogMm.x) || !Number.isFinite(cogMm.y)) return root

  const activeNodes = hoistGroups[activeGroupId] ?? []
  if (activeNodes.length === 0) return root

  const firstNode = stageData.nodeMap.get(activeNodes[0])
  if (!firstNode) return root

  // 반지름 = COG ↔ 첫 노드 수평(XY) 거리(mm)
  const radius = Math.hypot(firstNode.x - cogMm.x, firstNode.y - cogMm.y)
  if (!(radius > 0)) return root   // 첫 노드가 COG 축과 겹치면 원을 만들 수 없음

  const bbox = stageData.bbox
  const spanMm = bbox ? Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) : 0
  const tol = Number.isFinite(toleranceMm) && toleranceMm > 0
    ? toleranceMm
    : autoHoistCircleTolMm(spanMm)

  // 이미 어떤 권상 그룹에든 포함된 노드는 후보에서 제외(중복 강조 방지).
  const used = new Set()
  for (const gid of [1, 2, 3, 4]) for (const n of hoistGroups[gid] ?? []) used.add(n)

  // 첫 노드의 Z 를 기준 레벨로 넘겨 "링 근처 + 같은 Z 레벨" 노드만 후보로 고른다.
  const ids = selectHoistCircleCandidateNodes(stageData.nodeMap, cogMm, radius, tol, firstNode.z, used)

  // 가상 링 — 첫 노드 Z 높이의 수평면에, COG 중심 · 반지름 r (scene 좌표).
  const center = stageData.center
  const ringCenterScene = new THREE.Vector3(
    (cogMm.x - center.x) / 1000,
    (cogMm.y - center.y) / 1000,
    (firstNode.z - center.z) / 1000,
  )
  root.add(buildGuideRing(ringCenterScene, radius / 1000))

  const positions = ids.map(id => stageData.getNodePos(id)).filter(Boolean)
  if (positions.length > 0) {
    root.add(buildShellMarkers(positions))
    root.add(buildCoreMarkers(positions))
    root.add(makeCandidateLabel(`Circle Guide · ${ids.length}점 (R≈${Math.round(radius)} ±${Math.round(tol)}mm)`, positions))
  }
  return root
}

// 가상 링 — XY 평면 원(라인 루프). 노드를 가리지 않게 비가림(depthTest off).
function buildGuideRing(centerScene, radiusScene) {
  const seg = 128
  const pts = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pts.push(new THREE.Vector3(
      centerScene.x + Math.cos(a) * radiusScene,
      centerScene.y + Math.sin(a) * radiusScene,
      centerScene.z,
    ))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({
    color: CAND_COLOR,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  })
  const line = new THREE.Line(geo, mat)
  line.renderOrder = 43
  return line
}
