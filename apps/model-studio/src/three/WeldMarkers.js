import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const WELD_RADIUS = 0.04

/**
 * Builds an InstancedMesh of octahedrons for Weld-tagged nodes.
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.InstancedMesh}
 */
export function buildWeldMarkers(stageData) {
  const ids = stageData.nodesByTag('Weld')
  const geo = new THREE.OctahedronGeometry(WELD_RADIUS)
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.weld })
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
