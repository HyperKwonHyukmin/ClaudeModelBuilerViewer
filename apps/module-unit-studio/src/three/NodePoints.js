import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const NODE_RADIUS = 0.0448  // 44.8 mm (80 % of 56 mm)
const _dummy = new THREE.Object3D()

// freeNode 모드 색상
const COLOR_NORMAL   = new THREE.Color(COLORS.node)   // Shared Node (2+) — 빨강
const COLOR_FREE_END = new THREE.Color(0xF2C94C)       // Free Node (1 연결) — amber
const COLOR_ORPHAN   = new THREE.Color(0xB46DFF)       // Orphan Node (0 연결) — violet

// 권상 모드에서 RBE 연결 노드를 시각적으로 표시 — 연한 분홍.
// Wire CROD 는 RBE2 independent/dependent 노드 모두에 연결 가능하므로 선택을 막지 않는다.
// 이 색은 선택 제한이 아니라 기존 강체 연결을 통해 하중이 전달된다는 정보 표시다.
const COLOR_RBE_HOIST = new THREE.Color(0xE9A8B8)      // 연한 분홍 (light pink)

/**
 * Builds an InstancedMesh of shaded spheres, one per node.
 *
 * colorMode 'freeNode': per-instance colors based on element connection count
 *   - 0 connections → purple (고립 Node)
 *   - 1 connection  → yellow (Free Node)
 *   - 2+            → red    (다중 요소 Node)
 *
 * userData includes:
 *   nodeIds        — instanceId → node id
 *   nodeCategories — instanceId → 'normal' | 'free' | 'orphan'
 *   nodePositions  — instanceId → THREE.Vector3 (for filter re-matrix)
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {'category'|'freeNode'} [colorMode='category']
 * @returns {THREE.InstancedMesh}
 */
export function buildNodePoints(stageData, colorMode = 'category', renderMode = 'cylinder') {
  const ids = [...stageData.nodeMap.keys()]
  // STUDIO 표준 §11: 저폴리(10×7)+flatShading 금지 → 매끈한 16×12 + 반투명(depthWrite false).
  // 반투명이라 부재(Line/Tube)가 노드를 통과해 비쳐 "연결 여부" 판단이 쉽고 더 전문적이다(ModelBuilder 노드 룩 통일).
  // opacity 는 0.78 — 기존 0.65 대비 색감 +20%(요청). 너무 투명하면 노드 색이 옅게 보이던 문제 개선.
  const geo = new THREE.SphereGeometry(NODE_RADIUS, 16, 12)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.78, depthWrite: false })

  // 3D 단면 모드에서는 단면 메쉬(Angle/Channel 등)가 sphere 보다 커서 Node 를 가린다.
  // 권상위치를 찍을 때 Node 가 반드시 보여야 하므로 section3d 일 때만 depth test 를 끄고
  // renderOrder 를 올려 항상 단면 위에 표시한다. cylinder 모드는 기존대로 자연스러운 깊이 정렬 유지.
  const mesh = new THREE.InstancedMesh(geo, mat, ids.length)
  if (renderMode === 'section3d') {
    mat.depthTest  = false
    mat.depthWrite = false
    mat.transparent = true
    mesh.renderOrder = 10
  }
  mesh.count = 0

  // freeNode 모드: element 당 node 사용 횟수 집계
  // RBE2의 independent/dependent 노드는 BEAM 연결과 무관하게 shared로 강제 분류
  // (RBE로 강체 연결되는 시작점이므로 free/orphan이 아님)
  let usageMap = null
  if (colorMode === 'freeNode') {
    usageMap = new Map()
    for (const id of ids) usageMap.set(id, 0)
    for (const e of stageData.elements) {
      if (e.startNode != null) usageMap.set(e.startNode, (usageMap.get(e.startNode) ?? 0) + 1)
      if (e.endNode   != null) usageMap.set(e.endNode,   (usageMap.get(e.endNode)   ?? 0) + 1)
    }
  }
  // RBE 연결 노드 Set 은 colorMode 와 무관하게 항상 계산해 둔다 — 권상 모드 토글 시
  // applyHoistModeHighlight() 가 이 집합을 기준으로 instance 색을 분홍/원래로 전환한다.
  const rbeNodeSet = new Set()
  for (const r of stageData.rigids ?? []) {
    if (r.independentNode != null) rbeNodeSet.add(r.independentNode)
    for (const d of r.dependentNodes ?? []) rbeNodeSet.add(d)
  }

  const nodeIds         = []
  const nodeCategories  = []   // 'normal' | 'free' | 'orphan'
  const nodePositions   = []   // THREE.Vector3 — for applyFreeNodeFilters
  const nodeBaseColors  = []   // THREE.Color — 권상 모드 OFF 복원용 원래 색

  for (const id of ids) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    const i = mesh.count

    nodeIds[i]        = id
    nodePositions[i]  = pos.clone()

    let cat = 'normal'
    if (usageMap) {
      if (rbeNodeSet.has(id)) {
        cat = 'normal'   // RBE2 연결점(independent/dependent)은 항상 shared
      } else {
        const cnt = usageMap.get(id) ?? 0
        cat = cnt === 0 ? 'orphan' : cnt === 1 ? 'free' : 'normal'
      }
    }
    nodeCategories[i] = cat

    _dummy.position.copy(pos)
    _dummy.scale.setScalar(1)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)

    const col = cat === 'orphan' ? COLOR_ORPHAN : cat === 'free' ? COLOR_FREE_END : COLOR_NORMAL
    mesh.setColorAt(i, col)
    nodeBaseColors[i] = col.clone()

    mesh.count++
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.userData = { nodeIds, nodeCategories, nodePositions, nodeBaseColors, rbeNodeSet }
  return mesh
}

/**
 * 권상 모드 토글에 따라 RBE 연결 노드 instance 색을 분홍/원래로 전환한다.
 *
 *   active=true  → RBE 노드 색을 연한 분홍(COLOR_RBE_HOIST)으로 덮어쓴다.
 *                  선택 가능하지만 기존 강체 연결을 사용하는 노드임을 표시한다.
 *   active=false → 빌드 시 저장된 원래 색(nodeBaseColors)으로 복원한다.
 *
 * 컬러 모드(category/freeNode/propertyId/group/...) 와 무관하게 동작하며,
 * 호출 비용은 RBE 노드 수에 비례하므로 매 토글 시 안전하게 호출 가능.
 *
 * @param {THREE.InstancedMesh} mesh        - buildNodePoints 가 반환한 mesh
 * @param {boolean} active                  - 권상 모드 활성 여부
 */
export function applyHoistModeHighlight(mesh, active) {
  const ud = mesh?.userData
  if (!ud?.rbeNodeSet || !ud?.nodeIds || !ud?.nodeBaseColors) return
  const { rbeNodeSet, nodeIds, nodeBaseColors } = ud
  if (rbeNodeSet.size === 0) return
  for (let i = 0; i < mesh.count; i++) {
    if (!rbeNodeSet.has(nodeIds[i])) continue
    const col = active ? COLOR_RBE_HOIST : nodeBaseColors[i]
    if (col) mesh.setColorAt(i, col)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/**
 * Shows/hides node instances based on freeNode filter toggles.
 * Hidden instances are scaled to near-zero; shown instances restored to scale 1.
 *
 * 추가로 hideIds 가 주어지면 그 노드 ID 들도 함께 숨긴다 (예: 배관 레이어 OFF 일 때
 * 배관 전용 노드 숨기기). freeNodeFilters 와 hideIds 는 OR 조합으로 동작 — 둘 중
 * 하나라도 hide 면 숨겨진다.
 *
 * @param {THREE.InstancedMesh} mesh
 * @param {{ normal: boolean, free: boolean, orphan: boolean }} filters
 * @param {Set<number>} [hideIds]  - 추가로 숨길 nodeId 집합 (없으면 무시)
 */
export function applyFreeNodeFilters(mesh, filters, hideIds) {
  if (!mesh?.userData?.nodeCategories) return
  const { nodeCategories, nodePositions, nodeIds } = mesh.userData
  const hasHideSet = hideIds instanceof Set && hideIds.size > 0
  for (let i = 0; i < mesh.count; i++) {
    const cat     = nodeCategories[i]
    let visible = cat === 'normal' ? filters.normal
                : cat === 'free'   ? filters.free
                : filters.orphan
    if (visible && hasHideSet && hideIds.has(nodeIds[i])) visible = false
    _dummy.position.copy(nodePositions[i])
    _dummy.scale.setScalar(visible ? 1 : 0.0001)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
}
