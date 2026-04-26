import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

// Reused objects — no GC pressure per element
const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()
const _col   = new THREE.Color()

// Palette for group/propertyId coloring (same as BeamMesh.js)
const _palette = []
function getPaletteColor(index, total) {
  while (_palette.length <= index) {
    _palette.push(new THREE.Color().setHSL(_palette.length / Math.max(total, 1), 0.7, 0.55))
  }
  return _palette[index]
}

const SHAPE_COLORS = {
  Bar:  new THREE.Color(0x61b861),
  Rod:  new THREE.Color(0xe06060),
  Tube: new THREE.Color(0xd4a843),
  H:    new THREE.Color(0x7b7be8),
  L:    new THREE.Color(0x45b8c4),
}
const SHAPE_FALLBACK = new THREE.Color(0x888888)

const MIN_DIM = 0.001  // 1 mm minimum to avoid degenerate geometry

/**
 * Builds the 3D cross-section geometry for a beam property.
 * All geometry is oriented along Y-axis (height=1), centered at origin.
 * Instance matrix scales Y to beam length.
 *
 * @param {string} kind  'Bar' | 'Rod' | 'Tube' | 'L' | 'H'
 * @param {number[]} dims  dimensions in mm
 * @returns {THREE.BufferGeometry}
 */
function makeSection(kind, dims) {
  switch (kind) {
    case 'Bar': {
      const w = Math.max(dims[0] ?? 10, MIN_DIM) / 1000
      const h = Math.max(dims[1] ?? 10, MIN_DIM) / 1000
      return new THREE.BoxGeometry(w, 1, h)
    }

    case 'Rod': {
      const r = Math.max(dims[0] ?? 10, MIN_DIM) / 2000
      return new THREE.CylinderGeometry(r, r, 1, 20)
    }

    case 'Tube': {
      const ro = Math.max(dims[0] ?? 20, MIN_DIM) / 2000
      const ri = Math.min(Math.max(dims[1] ?? 15, MIN_DIM) / 2000, ro * 0.99)
      const shape = new THREE.Shape()
      shape.absarc(0, 0, ro, 0, Math.PI * 2, false)
      const hole = new THREE.Path()
      hole.absarc(0, 0, ri, 0, Math.PI * 2, true)
      shape.holes.push(hole)
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 20 })
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, -0.5, 0)
      return geo
    }

    case 'L': {
      // dims = [l1, l2, t1, t2] in mm
      // l1=horizontal leg, l2=vertical leg, t1=horizontal thickness, t2=vertical thickness
      const L1 = Math.max(dims[0] ?? 50, MIN_DIM) / 1000
      const L2 = Math.max(dims[1] ?? 50, MIN_DIM) / 1000
      const T1 = Math.max(dims[2] ?? 5, MIN_DIM) / 1000
      const T2 = Math.max(dims[3] ?? 5, MIN_DIM) / 1000
      const shape = new THREE.Shape()
      // L outline in XY plane, origin at bottom-left corner
      shape.moveTo(0, 0)
      shape.lineTo(L1, 0)
      shape.lineTo(L1, T1)
      shape.lineTo(T2, T1)
      shape.lineTo(T2, L2)
      shape.lineTo(0, L2)
      shape.closePath()
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 })
      // Center the cross-section at origin in XZ, then rotate to Y-axis
      geo.translate(-L1 / 2, -L2 / 2, 0)
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, -0.5, 0)
      return geo
    }

    case 'H': {
      // dims = [flange_width, web_thickness, height, flange_thickness] in mm
      const FW = Math.max(dims[0] ?? 80, MIN_DIM) / 1000
      const WT = Math.max(dims[1] ?? 8, MIN_DIM) / 1000
      const H  = Math.max(dims[2] ?? 100, MIN_DIM) / 1000
      const FT = Math.max(dims[3] ?? 8, MIN_DIM) / 1000
      // I-beam outline (symmetric about X=0 and Y=0 in XY plane)
      const shape = new THREE.Shape()
      shape.moveTo(-FW / 2, -H / 2)
      shape.lineTo( FW / 2, -H / 2)
      shape.lineTo( FW / 2, -H / 2 + FT)
      shape.lineTo( WT / 2, -H / 2 + FT)
      shape.lineTo( WT / 2,  H / 2 - FT)
      shape.lineTo( FW / 2,  H / 2 - FT)
      shape.lineTo( FW / 2,  H / 2)
      shape.lineTo(-FW / 2,  H / 2)
      shape.lineTo(-FW / 2,  H / 2 - FT)
      shape.lineTo(-WT / 2,  H / 2 - FT)
      shape.lineTo(-WT / 2, -H / 2 + FT)
      shape.lineTo(-FW / 2, -H / 2 + FT)
      shape.closePath()
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 })
      // Shape is already centered at XY origin; rotate to Y-axis
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, -0.5, 0)
      return geo
    }

    default: {
      // Fallback: generic cylinder
      return new THREE.CylinderGeometry(0.02, 0.02, 1, 12)
    }
  }
}

/**
 * Builds 3D cross-section InstancedMesh objects, one per unique propertyId.
 * Returns structure/pipe Groups for layer toggling and allBeamMeshes for raycasting.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {'category'|'freeNode'|'group'|'propertyId'|'shapeType'} [colorMode='category']
 * @returns {{ structureGroup: THREE.Group, pipeGroup: THREE.Group, allBeamMeshes: THREE.InstancedMesh[] }}
 */
export function buildBeamMesh3D(stageData, colorMode = 'category') {
  const elements = stageData.elements ?? []
  const beams = elements.filter(e => e.type === 'BEAM' && e.startNode != null && e.endNode != null)

  // Group beams by propertyId
  const byProp = new Map()
  for (const e of beams) {
    const pid = e.propertyId
    if (!byProp.has(pid)) byProp.set(pid, [])
    byProp.get(pid).push(e)
  }

  // Pre-compute color function for non-category modes
  let colorFn = null
  if (colorMode === 'propertyId') {
    const ids = [...new Set(beams.map(e => e.propertyId))]
    const idxMap = new Map(ids.map((id, i) => [id, i]))
    _palette.length = 0
    colorFn = (e) => getPaletteColor(idxMap.get(e.propertyId), ids.length)
  } else if (colorMode === 'group') {
    const groups = stageData.groups ?? []
    const maxIndividual = groups.length <= 5 ? groups.length : 10
    _palette.length = 0
    colorFn = (e) => {
      const gIdx = stageData.elementGroupMap.get(e.id) ?? -1
      const colorIdx = (gIdx >= 0 && gIdx < maxIndividual) ? gIdx : maxIndividual
      return getPaletteColor(colorIdx, maxIndividual + 1)
    }
  } else if (colorMode === 'shapeType') {
    colorFn = (e) => {
      const prop = stageData.propertyMap.get(e.propertyId)
      return SHAPE_COLORS[prop?.kind] ?? SHAPE_FALLBACK
    }
  }

  const structureGroup = new THREE.Group()
  const pipeGroup      = new THREE.Group()
  const allBeamMeshes  = []

  const mat = new THREE.MeshStandardMaterial({ metalness: 0.15, roughness: 0.55, flatShading: true })

  for (const [pid, propElems] of byProp) {
    const property = stageData.propertyMap.get(pid)
    const geo = makeSection(property?.kind ?? 'Rod', property?.dims ?? [20])

    // Determine base color for category/freeNode modes
    const hasStructure = propElems.some(e => e.category === 'Structure')
    const hasPipe      = propElems.some(e => e.category === 'Pipe')

    // Build one mesh per property (may contain both categories if mixed, but typically one)
    // Split by category to maintain independent layer toggling
    for (const category of ['Structure', 'Pipe']) {
      const catElems = propElems.filter(e => e.category === category)
      if (catElems.length === 0) continue

      const baseColor = category === 'Structure' ? COLORS.structure : COLORS.pipe
      const useInstanceColor = colorFn !== null

      const meshMat = mat.clone()
      if (!useInstanceColor) meshMat.color.set(baseColor)

      const mesh = new THREE.InstancedMesh(geo, meshMat, catElems.length)
      mesh.count = 0

      const elementIds       = []
      const elementData      = []
      const elementGroupIds  = []
      const originalMatrices = new Float32Array(catElems.length * 16)

      for (const e of catElems) {
        const start = stageData.getNodePos(e.startNode)
        const end   = stageData.getNodePos(e.endNode)
        if (!start || !end) continue

        _dir.subVectors(end, start)
        const len = _dir.length()
        if (len < 1e-6) continue

        const idx = mesh.count
        elementIds[idx]      = e.id
        elementGroupIds[idx] = stageData.elementGroupMap.get(e.id) ?? -1
        elementData[idx]     = { id: e.id, startNode: e.startNode, endNode: e.endNode, category: e.category, propertyId: e.propertyId }

        _dummy.position.addVectors(start, end).multiplyScalar(0.5)
        _dummy.scale.set(1, len, 1)
        _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
        _dummy.updateMatrix()
        mesh.setMatrixAt(idx, _dummy.matrix)
        _dummy.matrix.toArray(originalMatrices, idx * 16)

        if (useInstanceColor) {
          mesh.setColorAt(idx, _col.copy(colorFn(e)))
        }

        mesh.count++
      }

      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.userData = { elementIds, elementData, elementGroupIds, originalMatrices }

      if (category === 'Structure') structureGroup.add(mesh)
      else pipeGroup.add(mesh)
      allBeamMeshes.push(mesh)
    }
  }

  return { structureGroup, pipeGroup, allBeamMeshes }
}
