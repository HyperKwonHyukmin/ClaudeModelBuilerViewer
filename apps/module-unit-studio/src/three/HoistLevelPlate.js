import * as THREE from 'three'

const GROUP_COLORS = {
  1: 0x00D1FF,  // cyan
  2: 0xB57CFF,  // 보라
  3: 0x6AE07A,  // 녹색
  4: 0xFF66AA,  // 핫핑크
}

const PLATE_OPACITY = 0.22         // 평판 면 채움 — 같은 level 노드 식별이 가능할 정도로 또렷하게
const EDGE_OPACITY  = 0.85         // 평판 가장자리 — 레벨이 한눈에 들어오게
const MARGIN_FACTOR = 0.06         // 모델 bbox 너머 약간의 여유 (5~7%)
const Z_OFFSET_M    = 0.001        // Z-fighting 회피용 미세 오프셋 (씬 단위 = m)

/**
 * 활성 권상 그룹의 첫 번째 노드의 Z 레벨에 모델 XY 전범위를 덮는 반투명 평판을 그린다.
 * 사용자가 "비슷한 level 의 노드"를 직관적으로 고를 수 있도록 도와준다.
 *
 * 평판은 활성 그룹에만 표시되며 다른 그룹으로 전환하면 자동으로 그 그룹의 평판으로 바뀐다.
 * 활성 그룹에 노드가 0 개거나 activeGroupId 가 null 이면 빈 Group 반환.
 *
 * @param {Record<number, number[]>} hoistGroups
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {number|null} activeGroupId  - 평판을 그릴 활성 그룹 ID (없으면 비활성)
 * @returns {THREE.Group}
 */
export function buildHoistLevelPlate(hoistGroups, stageData, activeGroupId) {
  const root = new THREE.Group()
  root.name = 'HoistLevelPlate'
  if (!stageData || !hoistGroups) return root
  if (!Number.isInteger(activeGroupId) || !(activeGroupId in GROUP_COLORS)) return root

  const bbox = stageData.bbox
  if (!bbox) return root

  // 씬 좌표(미터)로 변환된 XY 범위 — getNodePos 가 사용하는 것과 동일한 변환:
  //   scene = (mm - center) / 1000
  const center = stageData.center
  const xMin = (bbox.minX - center.x) / 1000
  const xMax = (bbox.maxX - center.x) / 1000
  const yMin = (bbox.minY - center.y) / 1000
  const yMax = (bbox.maxY - center.y) / 1000
  const sizeX = Math.max(xMax - xMin, 0.5)
  const sizeY = Math.max(yMax - yMin, 0.5)
  const mx = sizeX * MARGIN_FACTOR
  const my = sizeY * MARGIN_FACTOR
  const w = sizeX + mx * 2
  const h = sizeY + my * 2
  const cx = (xMin + xMax) / 2
  const cy = (yMin + yMax) / 2

  // 활성 그룹 한 개만 처리.
  {
    const groupId = activeGroupId
    const nodeIds = hoistGroups[groupId] ?? []
    if (nodeIds.length === 0) return root
    const firstPos = stageData.getNodePos(nodeIds[0])
    if (!firstPos) return root

    const colorHex = GROUP_COLORS[groupId]
    const z = firstPos.z + Z_OFFSET_M  // 살짝 띄워 Z-fighting 회피

    // 면 채움
    const fillGeo = new THREE.PlaneGeometry(w, h)
    const fillMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: PLATE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const fill = new THREE.Mesh(fillGeo, fillMat)
    fill.position.set(cx, cy, z)
    fill.renderOrder = 50
    root.add(fill)

    // 가장자리 — 레벨이 한눈에 들어오도록
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx - w / 2, cy - h / 2, z),
      new THREE.Vector3(cx + w / 2, cy - h / 2, z),
      new THREE.Vector3(cx + w / 2, cy + h / 2, z),
      new THREE.Vector3(cx - w / 2, cy + h / 2, z),
      new THREE.Vector3(cx - w / 2, cy - h / 2, z),
    ])
    const edgeMat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: EDGE_OPACITY,
      depthTest: false,
    })
    const edge = new THREE.Line(edgeGeo, edgeMat)
    edge.renderOrder = 51
    root.add(edge)
  }

  return root
}
