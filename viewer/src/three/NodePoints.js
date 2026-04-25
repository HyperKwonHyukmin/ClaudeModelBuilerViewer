import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const NODE_RADIUS = 0.056  // 56 mm (80 % of original 70 mm)
const _dummy = new THREE.Object3D()

// freeNode 모드 색상
const COLOR_NORMAL   = new THREE.Color(COLORS.node)   // 정상 (2+ 연결) — 빨강
const COLOR_FREE_END = new THREE.Color(0xFFDD00)       // 자유단 (1 연결) — 노란색
const COLOR_ORPHAN   = new THREE.Color(0xCC44FF)       // 고립 (0 연결) — 보라색

/**
 * Builds an InstancedMesh of shaded spheres, one per node.
 *
 * colorMode 'freeNode': per-instance colors based on element connection count
 *   - 0 connections → purple (orphan)
 *   - 1 connection  → yellow (free end / dangling)
 *   - 2+            → normal red
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {'category'|'propertyId'|'shapeType'|'freeNode'} [colorMode='category']
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

  const nodeIds = []   // instanceId → node id

  for (const id of ids) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    nodeIds[mesh.count] = id
    _dummy.position.copy(pos)
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count, _dummy.matrix)

    if (usageMap) {
      const cnt = usageMap.get(id) ?? 0
      const col = cnt === 0 ? COLOR_ORPHAN : cnt === 1 ? COLOR_FREE_END : COLOR_NORMAL
      mesh.setColorAt(mesh.count, col)
    } else {
      mesh.setColorAt(mesh.count, COLOR_NORMAL)
    }

    mesh.count++
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.userData = { nodeIds }
  return mesh
}
