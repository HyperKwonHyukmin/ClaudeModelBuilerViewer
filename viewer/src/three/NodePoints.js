import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const NODE_RADIUS = 0.056  // 56 mm (80 % of original 70 mm)
const _dummy = new THREE.Object3D()

/**
 * Builds an InstancedMesh of shaded spheres, one per node.
 * MeshPhongMaterial gives each sphere a highlight so overlapping
 * spheres remain individually distinguishable.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildNodePoints(stageData) {
  const ids  = [...stageData.nodeMap.keys()]
  const geo  = new THREE.SphereGeometry(NODE_RADIUS, 10, 7)
  const mat  = new THREE.MeshPhongMaterial({ color: COLORS.node, shininess: 70, specular: 0xffffff })

  const mesh = new THREE.InstancedMesh(geo, mat, ids.length)
  mesh.count = 0

  const nodeIds = []   // instanceId → node id

  for (const id of ids) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    nodeIds[mesh.count] = id
    _dummy.position.copy(pos)
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { nodeIds }
  return mesh
}
