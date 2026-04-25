import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const NODE_RADIUS = 0.07   // 70 mm — large enough to read as spheres, not dots
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
