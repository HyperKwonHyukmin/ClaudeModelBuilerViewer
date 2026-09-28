import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'
import { getGroupDisplayCount, groupColorThree } from '../utils/groupPalette.js'
import { sizeScreenMarker } from './screenMarker.js'

// Rod radii in scene units (metres)
const STRUCT_R = 0.025   // 25 mm
const PIPE_R   = 0.020   // 20 mm
const SEGS     = 6       // cylinder circumference segments (화면에선 가는 선이라 6면이면 충분)
// 선 모드 부재의 화면 반지름(px). 위 *_R 은 CPU raycast 판정 반경으로만 쓰이고,
// 실제 굵기는 셰이더가 줌과 무관하게 이 값으로 고정한다 — 확대해도 굵어지지 않는 얇은 직선.
const LINE_PX  = 0.75

// Reused objects — allocated once, no GC pressure per element
const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()
const _col   = new THREE.Color()

// Palette for propertyId / shapeType coloring (evenly spaced HSL hues)
const _palette = []
function getPaletteColor(index, total) {
  while (_palette.length <= index) {
    _palette.push(new THREE.Color().setHSL(_palette.length / Math.max(total, 1), 0.7, 0.55))
  }
  return _palette[index]
}

// Shape-type → fixed color map
const SHAPE_COLORS = {
  Bar:  new THREE.Color(0x61b861),
  Rod:  new THREE.Color(0xe06060),
  Tube: new THREE.Color(0xd4a843),
  H:    new THREE.Color(0x7b7be8),
  L:    new THREE.Color(0x45b8c4),
}
const SHAPE_FALLBACK = new THREE.Color(0x888888)

/**
 * Builds two InstancedMesh rod objects from a StageData's elements.
 *   structure — BEAM elements with category 'Structure' (steel-blue cylinders)
 *   pipe      — BEAM elements with category 'Pipe'      (orange cylinders)
 *
 * colorMode:
 *   'category'   — fixed category colors (default)
 *   'propertyId' — unique hue per propertyId
 *   'shapeType'  — fixed color per cross-section kind (Bar/Rod/Tube/H/L)
 *
 * Each instance is a unit-height CylinderGeometry scaled + rotated to span
 * startNode → endNode.  Missing nodes are silently skipped.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {'category'|'propertyId'|'shapeType'} [colorMode='category']
 * @returns {{ structure: THREE.InstancedMesh, pipe: THREE.InstancedMesh }}
 */
export function buildBeamMesh(stageData, colorMode = 'category') {
  const elements = stageData.elements ?? []

  // category and freeNode both use per-category meshes for independent toggling
  if (colorMode === 'category' || colorMode === 'freeNode') {
    return {
      structure: _buildRods(elements, 'Structure', STRUCT_R, COLORS.structure, stageData, null),
      pipe:      _buildRods(elements, 'Pipe',      PIPE_R,   COLORS.pipe,      stageData, null),
    }
  }

  // Non-category: build one merged mesh with per-instance colors
  const allElems = elements.filter(e => e.type === 'BEAM')

  // Pre-compute color lookup
  let colorFn
  if (colorMode === 'propertyId') {
    const ids = [...new Set(allElems.map(e => e.propertyId))]
    const idxMap = new Map(ids.map((id, i) => [id, i]))
    const total  = ids.length
    _palette.length = 0   // reset palette for new data
    colorFn = (e) => getPaletteColor(idxMap.get(e.propertyId), total)
  } else if (colorMode === 'group') {
    // 색·번호 모두 마지막 stage 기준으로 통일 — LayerPanel 버튼과 동일한 팔레트 helper 사용
    const groups = stageData.finalGroups ?? stageData.groups ?? []
    const { maxIndividual, displayCount } = getGroupDisplayCount(groups)
    const groupMap = stageData.finalElementGroupMap ?? stageData.elementGroupMap
    colorFn = (e) => {
      const gIdx = groupMap.get(e.id) ?? -1
      const colorIdx = (gIdx >= 0 && gIdx < maxIndividual) ? gIdx : maxIndividual
      return groupColorThree(_col, colorIdx, displayCount)
    }
  } else {
    // shapeType
    const propMap = new Map((stageData.properties ?? []).map(p => [p.id, p]))
    colorFn = (e) => {
      const prop = propMap.get(e.propertyId)
      return SHAPE_COLORS[prop?.kind] ?? SHAPE_FALLBACK
    }
  }

  // We still return {structure, pipe} for API compatibility,
  // but pipe is empty and structure holds all beams with per-instance color.
  const merged = _buildRodsColored(allElems, STRUCT_R, stageData, colorFn)
  const emptyPipe = _buildRods([], 'Pipe', PIPE_R, COLORS.pipe, stageData, null)
  return { structure: merged, pipe: emptyPipe }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _buildRods(elements, category, radius, color, stageData) {
  const geo  = new THREE.CylinderGeometry(radius, radius, 1, SEGS, 1)
  const mat  = new THREE.MeshBasicMaterial({ color })
  const elems = elements.filter(e => e.type === 'BEAM' && e.category === category)

  const mesh = new THREE.InstancedMesh(geo, mat, elems.length)
  mesh.count = 0

  const elementIds       = []
  const elementData      = []
  const elementGroupIds  = []
  // Float32Array of 16 floats per instance — for group visibility restore
  const originalMatrices = new Float32Array(elems.length * 16)

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue

    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue

    const idx = mesh.count
    elementIds[idx]      = e.id
    elementGroupIds[idx] = (stageData.finalElementGroupMap ?? stageData.elementGroupMap).get(e.id) ?? -1
    elementData[idx]     = { id: e.id, startNode: e.startNode, endNode: e.endNode, category: e.category, propertyId: e.propertyId }

    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(idx, _dummy.matrix)
    _dummy.matrix.toArray(originalMatrices, idx * 16)
    mesh.count++
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.userData = { elementIds, elementData, elementGroupIds, originalMatrices }
  sizeScreenMarker(mesh, radius, LINE_PX, true)
  return mesh
}

function _buildRodsColored(elems, radius, stageData, colorFn) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, SEGS, 1)
  const mat = new THREE.MeshBasicMaterial()

  const mesh = new THREE.InstancedMesh(geo, mat, elems.length)
  mesh.count = 0

  const elementIds       = []
  const elementData      = []
  const elementGroupIds  = []
  const originalMatrices = new Float32Array(elems.length * 16)

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue

    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue

    const idx = mesh.count
    elementIds[idx]      = e.id
    elementGroupIds[idx] = (stageData.finalElementGroupMap ?? stageData.elementGroupMap).get(e.id) ?? -1
    elementData[idx]     = { id: e.id, startNode: e.startNode, endNode: e.endNode, category: e.category, propertyId: e.propertyId }

    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(idx, _dummy.matrix)
    _dummy.matrix.toArray(originalMatrices, idx * 16)
    mesh.setColorAt(idx, _col.copy(colorFn(e)))
    mesh.count++
  }

  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.userData = { elementIds, elementData, elementGroupIds, originalMatrices }
  sizeScreenMarker(mesh, radius, LINE_PX, true)
  return mesh
}
