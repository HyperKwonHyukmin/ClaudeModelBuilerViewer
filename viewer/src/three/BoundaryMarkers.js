import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

const CONE_RADIUS = 0.06
const CONE_HEIGHT = 0.12
const WELD_RADIUS = 0.04

/**
 * Builds a Group containing:
 *   - Inverted cones for Boundary-tagged nodes (green)
 *   - Octahedrons for Weld-tagged nodes (same green, merged into 경계조건 layer)
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildBoundaryMarkers(stageData) {
  const group = new THREE.Group()

  // ── Boundary cones ────────────────────────────────────────────────────
  const bIds = stageData.nodesByTag('Boundary')
  if (bIds.length > 0) {
    const geo = new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 4)
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.boundary })
    const mesh = new THREE.InstancedMesh(geo, mat, bIds.length)
    mesh.count = 0
    const m = new THREE.Matrix4()
    for (const id of bIds) {
      const pos = stageData.getNodePos(id)
      if (!pos) continue
      m.setPosition(pos)
      mesh.setMatrixAt(mesh.count++, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  // ── Weld octahedrons (merged into 경계조건 layer) ─────────────────────
  const wIds = stageData.nodesByTag('Weld')
  if (wIds.length > 0) {
    const geo = new THREE.OctahedronGeometry(WELD_RADIUS)
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.boundary })
    const mesh = new THREE.InstancedMesh(geo, mat, wIds.length)
    mesh.count = 0
    const m = new THREE.Matrix4()
    for (const id of wIds) {
      const pos = stageData.getNodePos(id)
      if (!pos) continue
      m.setPosition(pos)
      mesh.setMatrixAt(mesh.count++, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }

  return group
}
