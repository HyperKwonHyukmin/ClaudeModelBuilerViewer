import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

/**
 * Builds LineSegments for RBE2 rigid connections.
 * Only renders rigids that have at least one dependentNode.
 * For each (independentNode, dependentNode) pair, draws one line segment.
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.LineSegments}
 */
export function buildRigidMesh(stageData) {
  const verts = []
  for (const rigid of stageData.rigids) {
    if (!rigid.dependentNodes?.length) continue
    const indPos = stageData.getNodePos(rigid.independentNode)
    if (!indPos) continue
    for (const depId of rigid.dependentNodes) {
      const depPos = stageData.getNodePos(depId)
      if (!depPos) continue
      verts.push(indPos.x, indPos.y, indPos.z, depPos.x, depPos.y, depPos.z)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  const mat = new THREE.LineBasicMaterial({ color: COLORS.rigid })
  return new THREE.LineSegments(geo, mat)
}
