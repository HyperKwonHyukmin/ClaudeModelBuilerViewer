import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const DIAMOND_SIZE = 0.14   // octahedron radius (≈ 140 mm)

/**
 * Builds a Group of diamond-shaped (OctahedronGeometry) markers for
 * Boundary-tagged and Weld-tagged nodes, merged into the 경계조건 layer.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildBoundaryMarkers(stageData) {
  const group = new THREE.Group()
  const geo = new THREE.OctahedronGeometry(DIAMOND_SIZE)
  const mat = new THREE.MeshPhongMaterial({ color: COLORS.boundary, shininess: 60 })

  const allIds = [
    ...stageData.nodesByTag('Boundary'),
    ...stageData.nodesByTag('Weld'),
  ]

  if (allIds.length === 0) return group

  const mesh = new THREE.InstancedMesh(geo, mat, allIds.length)
  mesh.count = 0
  const m = new THREE.Matrix4()
  for (const id of allIds) {
    const pos = stageData.getNodePos(id)
    if (!pos) continue
    m.setPosition(pos)
    mesh.setMatrixAt(mesh.count++, m)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}
