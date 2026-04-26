import * as THREE from 'three'

// Overlay radii — slightly larger than the actual beams/nodes so they
// wrap around without Z-fighting
const ELEM_R  = 0.045   // cylinder radius for element highlights
const NODE_R  = 0.12    // sphere radius for node highlights
const SEGS    = 8

const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()

const SEV_COLORS = {
  error:   { color: 0xFF2222, emissive: 0x880000 },
  warning: { color: 0xFF8C00, emissive: 0x663300 },
  info:    { color: 0x4682B4, emissive: 0x1a3a6a },
}
const FALLBACK = SEV_COLORS.warning

/**
 * Builds a THREE.Group containing translucent highlight overlays for
 * every diagnostics entry that carries an elemId or nodeId.
 *
 * Elements → semi-transparent thick cylinder, colour by severity.
 * Nodes    → semi-transparent sphere, colour by severity.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildDiagnosticOverlay(stageData) {
  const group = new THREE.Group()
  const diags = stageData.diagnostics ?? []

  if (diags.length === 0) return group

  // Build a map from elemId/nodeId to worst severity
  const elemSev  = new Map()   // elemId  → severity
  const nodeSev  = new Map()   // nodeId  → severity

  const sevRank = { error: 2, warning: 1, info: 0 }

  for (const d of diags) {
    const rank = sevRank[d.severity] ?? 0
    if (d.elemId != null) {
      const cur = sevRank[elemSev.get(d.elemId)] ?? -1
      if (rank > cur) elemSev.set(d.elemId, d.severity)
    }
    if (d.nodeId != null) {
      const cur = sevRank[nodeSev.get(d.nodeId)] ?? -1
      if (rank > cur) nodeSev.set(d.nodeId, d.severity)
    }
  }

  // Build element overlays
  if (elemSev.size > 0) {
    const elemMap = new Map((stageData.elements ?? []).map(e => [e.id, e]))
    _addElemOverlays(group, elemSev, elemMap, stageData)
  }

  // Build node overlays
  if (nodeSev.size > 0) {
    _addNodeOverlays(group, nodeSev, stageData)
  }

  return group
}

function _addElemOverlays(group, elemSev, elemMap, stageData) {
  // Group by severity for fewer draw calls
  for (const [sev, col] of Object.entries(SEV_COLORS)) {
    const ids = [...elemSev.entries()].filter(([, s]) => s === sev).map(([id]) => id)
    if (ids.length === 0) continue

    const geo = new THREE.CylinderGeometry(ELEM_R, ELEM_R, 1, SEGS, 1)
    const mat = new THREE.MeshStandardMaterial({
      color: col.color, emissive: col.emissive,
      transparent: true, opacity: 0.45, depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, ids.length)
    mesh.count = 0

    for (const id of ids) {
      const e = elemMap.get(id)
      if (!e) continue
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
  }
}

function _addNodeOverlays(group, nodeSev, stageData) {
  for (const [sev, col] of Object.entries(SEV_COLORS)) {
    const ids = [...nodeSev.entries()].filter(([, s]) => s === sev).map(([id]) => id)
    if (ids.length === 0) continue

    const geo = new THREE.SphereGeometry(NODE_R, SEGS, SEGS)
    const mat = new THREE.MeshStandardMaterial({
      color: col.color, emissive: col.emissive,
      transparent: true, opacity: 0.5, depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, ids.length)
    mesh.count = 0

    for (const id of ids) {
      const pos = stageData.getNodePos(id)
      if (!pos) continue
      _dummy.position.copy(pos)
      _dummy.scale.set(1, 1, 1)
      _dummy.quaternion.identity()
      _dummy.updateMatrix()
      mesh.setMatrixAt(mesh.count++, _dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    group.add(mesh)
  }
}
