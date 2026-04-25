import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const NODE_RADIUS = 0.04   // metres (40 mm radius in scene units)
const _geo = new THREE.SphereGeometry(NODE_RADIUS, 6, 4)
const _dummy = new THREE.Object3D()

/**
 * Builds an InstancedMesh of red spheres, one per node.
 * Using InstancedMesh instead of Points gives reliable depth and visibility.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildNodePoints(stageData) {
  const ids = [...stageData.nodeMap.keys()]
  const mesh = new THREE.InstancedMesh(
    _geo,
    new THREE.MeshBasicMaterial({ color: COLORS.node }),
    ids.length,
  )
  mesh.count = 0
  for (const id of ids) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    _dummy.position.copy(pos)
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
