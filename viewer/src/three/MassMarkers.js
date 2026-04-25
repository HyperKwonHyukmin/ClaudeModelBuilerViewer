import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const MASS_RADIUS = 0.05

/**
 * Builds an InstancedMesh of spheres for point masses.
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildMassMarkers(stageData) {
  const masses = stageData.pointMasses
  const geo = new THREE.IcosahedronGeometry(MASS_RADIUS, 1)
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.mass })
  const mesh = new THREE.InstancedMesh(geo, mat, masses.length)
  mesh.count = 0

  const m = new THREE.Matrix4()
  for (const pm of masses) {
    const pos = stageData.getNodePos(pm.nodeId)
    if (!pos) continue
    m.setPosition(pos)
    mesh.setMatrixAt(mesh.count, m)
    mesh.count++
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}
