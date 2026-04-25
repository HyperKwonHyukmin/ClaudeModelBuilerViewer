import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

/**
 * Builds two LineSegments objects from a StageData's elements:
 *   - structure: elements with category === 'Structure'
 *   - pipe:      elements with category === 'Pipe'
 *
 * Each element contributes 2 vertices (startNode, endNode).
 * Elements referencing missing nodes are silently skipped.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {{ structure: THREE.LineSegments, pipe: THREE.LineSegments }}
 */
export function buildBeamMesh(stageData) {
  const structureVerts = []
  const pipeVerts = []

  for (const elem of stageData.elements) {
    if (elem.type !== 'BEAM') continue

    const start = stageData.getNodePos(elem.startNode)
    const end = stageData.getNodePos(elem.endNode)
    if (!start || !end) continue

    const target = elem.category === 'Pipe' ? pipeVerts : structureVerts
    target.push(start.x, start.y, start.z, end.x, end.y, end.z)
  }

  return {
    structure: _makeLineSegments(structureVerts, COLORS.structure),
    pipe: _makeLineSegments(pipeVerts, COLORS.pipe),
  }
}

function _makeLineSegments(verts, color) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  const mat = new THREE.LineBasicMaterial({ color })
  return new THREE.LineSegments(geo, mat)
}
