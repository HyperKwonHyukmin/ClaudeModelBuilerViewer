import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const MASS_SIZE = 0.09   // cube half-extent → 90 mm side length

/**
 * Builds an InstancedMesh of cubes for point masses.
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildMassMarkers(stageData) {
  const masses = stageData.pointMasses
  const geo = new THREE.BoxGeometry(MASS_SIZE, MASS_SIZE, MASS_SIZE)
  const mat = new THREE.MeshPhongMaterial({ color: COLORS.mass, shininess: 60 })
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
