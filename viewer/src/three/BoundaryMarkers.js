import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const CONE_RADIUS = 0.06
const CONE_HEIGHT = 0.12

/**
 * Builds an InstancedMesh of inverted cones for Boundary-tagged nodes.
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildBoundaryMarkers(stageData) {
  const ids = stageData.nodesByTag('Boundary')
  const geo = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 4)
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.boundary })
  const mesh = new THREE.InstancedMesh(geo, mat, ids.length)
  mesh.count = 0

  const m = new THREE.Matrix4()
  for (const id of ids) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    m.setPosition(pos)
    mesh.setMatrixAt(mesh.count, m)
    mesh.count++
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
