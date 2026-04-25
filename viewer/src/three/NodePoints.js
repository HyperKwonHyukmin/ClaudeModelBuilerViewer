import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const NODE_RADIUS = 0.056  // 56 mm (80 % of original 70 mm)
const _dummy = new THREE.Object3D()

// freeNode 모드 색상
const COLOR_NORMAL   = new THREE.Color(COLORS.node)   // 다중 요소 Node (2+) — 빨강
const COLOR_FREE_END = new THREE.Color(0xFFDD00)       // Free Node (1 연결) — 노란색
const COLOR_ORPHAN   = new THREE.Color(0xCC44FF)       // 고립 Node (0 연결) — 보라색

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
export function buildNodePoints(stageData, colorMode = 'category') {
  const ids = [...stageData.nodeMap.keys()]
  const geo = new THREE.SphereGeometry(NODE_RADIUS, 10, 7)
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 70, specular: 0xffffff })

  const mesh = new THREE.InstancedMesh(geo, mat, ids.length)
  mesh.count = 0

  // freeNode 모드: element 당 node 사용 횟수 집계
  let usageMap = null
  if (colorMode === 'freeNode') {
    usageMap = new Map()
    for (const id of ids) usageMap.set(id, 0)
    for (const e of stageData.elements) {
      if (e.startNode != null) usageMap.set(e.startNode, (usageMap.get(e.startNode) ?? 0) + 1)
      if (e.endNode   != null) usageMap.set(e.endNode,   (usageMap.get(e.endNode)   ?? 0) + 1)
    }
  }

  const nodeIds        = []
  const nodeCategories = []   // 'normal' | 'free' | 'orphan'
  const nodePositions  = []   // THREE.Vector3 — for applyFreeNodeFilters

  for (const id of ids) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    const i = mesh.count

    nodeIds[i]        = id
    nodePositions[i]  = pos.clone()

    let cat = 'normal'
    if (usageMap) {
      const cnt = usageMap.get(id) ?? 0
      cat = cnt === 0 ? 'orphan' : cnt === 1 ? 'free' : 'normal'
    }
    nodeCategories[i] = cat

    _dummy.position.copy(pos)
    _dummy.scale.setScalar(1)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)

    const col = cat === 'orphan' ? COLOR_ORPHAN : cat === 'free' ? COLOR_FREE_END : COLOR_NORMAL
    mesh.setColorAt(i, col)

    mesh.count++
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.userData = { nodeIds, nodeCategories, nodePositions }
  return mesh
}

/**
 * Shows/hides node instances based on freeNode filter toggles.
 * Hidden instances are scaled to near-zero; shown instances restored to scale 1.
 *
 * @param {THREE.InstancedMesh} mesh
 * @param {{ normal: boolean, free: boolean, orphan: boolean }} filters
 */
export function applyFreeNodeFilters(mesh, filters) {
  if (!mesh?.userData?.nodeCategories) return
  const { nodeCategories, nodePositions } = mesh.userData
  for (let i = 0; i < mesh.count; i++) {
    const cat     = nodeCategories[i]
    const visible = cat === 'normal' ? filters.normal
                  : cat === 'free'   ? filters.free
                  : filters.orphan
    _dummy.position.copy(nodePositions[i])
    _dummy.scale.setScalar(visible ? 1 : 0.0001)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
}
