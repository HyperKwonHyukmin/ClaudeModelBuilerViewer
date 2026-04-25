import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

// Rod radii in scene units (metres)
const STRUCT_R = 0.025   // 25 mm
const PIPE_R   = 0.020   // 20 mm
const SEGS     = 7       // cylinder circumference segments

// Reused objects — allocated once, no GC pressure per element
const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()

/**
 * Builds two InstancedMesh rod objects from a StageData's elements.
 *   structure — BEAM elements with category 'Structure' (steel-blue cylinders)
 *   pipe      — BEAM elements with category 'Pipe'      (orange cylinders)
 *
 * Each instance is a unit-height CylinderGeometry scaled + rotated to span
 * startNode → endNode.  Missing nodes are silently skipped.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {{ structure: THREE.InstancedMesh, pipe: THREE.InstancedMesh }}
 */
export function buildBeamMesh(stageData) {
  const elements = stageData.elements ?? []
  return {
    structure: _buildRods(elements, 'Structure', STRUCT_R, COLORS.structure, stageData),
    pipe:      _buildRods(elements, 'Pipe',      PIPE_R,   COLORS.pipe,      stageData),
  }
}

function _buildRods(elements, category, radius, color, stageData) {
  const geo  = new THREE.CylinderGeometry(radius, radius, 1, SEGS, 1)
  const mat  = new THREE.MeshPhongMaterial({ color, shininess: 25 })
  const elems = elements.filter(e => e.type === 'BEAM' && e.category === category)

  const mesh = new THREE.InstancedMesh(geo, mat, elems.length)
  mesh.count = 0

  const elementIds   = []   // instanceId → element.id
  const elementData  = []   // instanceId → { id, startNode, endNode, category, propertyId }

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue

    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue

    elementIds[mesh.count]  = e.id
    elementData[mesh.count] = { id: e.id, startNode: e.startNode, endNode: e.endNode, category: e.category, propertyId: e.propertyId }

    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)              // stretch unit cylinder to beam length
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { elementIds, elementData }
  return mesh
}
