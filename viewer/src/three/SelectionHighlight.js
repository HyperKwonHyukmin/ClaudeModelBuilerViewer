import * as THREE from 'three'

const SEL_COLOR = 0x00E5FF   // cyan glow
const NODE_HL_R = 0.090      // slightly larger than NODE_RADIUS (0.056)
const ELEM_HL_R = 0.042      // slightly thicker than beam radii

const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()
const _mat4  = new THREE.Matrix4()

const _hlMat = () => new THREE.MeshBasicMaterial({
  color: SEL_COLOR,
  transparent: true,
  opacity: 0.80,
  depthTest: false,   // render on top of everything (X-ray style)
})

/**
 * Builds highlight cylinders for a set of elements.
 * Used when a Node is picked → show all connected elements.
 *
 * @param {number[]} elementIds
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildElementsHighlight(elementIds, stageData) {
  const group = new THREE.Group()
  const idSet = new Set(elementIds)
  const elems = stageData.elements.filter(e => idSet.has(e.id))
  if (elems.length === 0) return group

  const geo = new THREE.CylinderGeometry(ELEM_HL_R, ELEM_HL_R, 1, 8, 1)
  const mesh = new THREE.InstancedMesh(geo, _hlMat(), elems.length)
  mesh.count = 0

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue
    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue
    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}

/**
 * Builds highlight spheres for a set of node IDs.
 * Used when an Element is picked → show startNode and endNode.
 *
 * @param {number[]} nodeIds
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildNodesHighlight(nodeIds, stageData) {
  const group = new THREE.Group()
  const valid = nodeIds.filter(id => stageData.getNodePos(id))
  if (valid.length === 0) return group

  const geo  = new THREE.SphereGeometry(NODE_HL_R, 12, 8)
  const mesh = new THREE.InstancedMesh(geo, _hlMat(), valid.length)
  mesh.count = 0

  for (const id of valid) {
    _mat4.setPosition(stageData.getNodePos(id))
    mesh.setMatrixAt(mesh.count++, _mat4)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}
