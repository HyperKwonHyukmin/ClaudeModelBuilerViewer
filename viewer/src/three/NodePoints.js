import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

/**
 * Builds a Points object for all nodes in the stage.
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Points}
 */
export function buildNodePoints(stageData) {
  const verts = []
  for (const [id] of stageData.nodeMap) {
    const pos = stageData.getNodePos(id)
    if (pos) verts.push(pos.x, pos.y, pos.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  const mat = new THREE.PointsMaterial({ color: COLORS.node, size: 0.03, sizeAttenuation: true })
  return new THREE.Points(geo, mat)
}
