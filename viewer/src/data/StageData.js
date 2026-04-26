import * as THREE from 'three'

/**
 * Wraps one parsed pipeline stage JSON.
 * Builds a nodeMap for O(1) lookup and handles coordinate transformation:
 *   scene position = (node_mm - bbox_center_mm) / 1000  →  meters
 */
export class StageData {
  /**
   * @param {object} json  Parsed stage JSON (schemaVersion 1.1)
   */
  constructor(json) {
    this.meta = json.meta
    this.elements = json.elements ?? []
    this.rigids = json.rigids ?? []
    this.properties = json.properties ?? []
    this.materials = json.materials ?? []
    this.pointMasses = json.pointMasses ?? []
    this.connectivity = json.connectivity
    this.healthMetrics = json.healthMetrics
    this.diagnostics = json.diagnostics ?? []
    this.trace = json.trace ?? []
    this.elementGroupMap = new Map()  // populated by _computeGroups

    // Build nodeMap: Map<id, {x, y, z, tags}>
    this.nodeMap = new Map()
    for (const n of json.nodes ?? []) {
      this.nodeMap.set(n.id, {
        x: n.x,
        y: n.y,
        z: n.z,
        tags: n.tags ?? [],
      })
    }

    // Compute bbox from nodes (use healthMetrics.totals.bbox if available,
    // fall back to computing from nodes array)
    const hmBbox = json.healthMetrics?.totals?.bbox
    if (hmBbox) {
      this.bbox = { ...hmBbox }
    } else {
      this.bbox = this._computeBbox(json.nodes ?? [])
    }

    // Precompute center
    this.center = {
      x: (this.bbox.minX + this.bbox.maxX) / 2,
      y: (this.bbox.minY + this.bbox.maxY) / 2,
      z: (this.bbox.minZ + this.bbox.maxZ) / 2,
    }

    // Connectivity groups (Union-Find on BEAM elements)
    this.groups = this._computeGroups()

    // Property/material lookup maps
    this.propertyMap = new Map(this.properties.map(p => [p.id, p]))
    this.materialMap = new Map(this.materials.map(m => [m.id, m]))

    // Client-side healthMetrics (fallback if JSON doesn't include it)
    if (!this.healthMetrics) this.healthMetrics = this._computeHealthMetrics()
    // Client-side connectivity (fallback if JSON doesn't include it)
    if (!this.connectivity) this.connectivity = this._computeConnectivity()
  }

  /**
   * Returns scene-space position for a node (mm → m, centered).
   * @param {number} id  Node id
   * @returns {THREE.Vector3 | null}
   */
  getNodePos(id) {
    const n = this.nodeMap.get(id)
    if (!n) return null
    return new THREE.Vector3(
      (n.x - this.center.x) / 1000,
      (n.y - this.center.y) / 1000,
      (n.z - this.center.z) / 1000,
    )
  }

  /**
   * Returns array of node ids that have the given tag.
   * @param {string} tag  e.g. 'Boundary', 'Weld'
   * @returns {number[]}
   */
  nodesByTag(tag) {
    const result = []
    for (const [id, n] of this.nodeMap) {
      if (n.tags.includes(tag)) result.push(id)
    }
    return result
  }

  /**
   * Union-Find connectivity grouping on BEAM elements.
   * Sets this.elementGroupMap (Map<elementId, groupIndex>) and returns groups[].
   */
  _computeGroups() {
    // --- Union-Find ---
    const parent = new Map()
    const rank   = new Map()

    const find = (x) => {
      if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0) }
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)))
      return parent.get(x)
    }
    const union = (a, b) => {
      const ra = find(a), rb = find(b)
      if (ra === rb) return
      const ka = rank.get(ra) ?? 0, kb = rank.get(rb) ?? 0
      if (ka < kb) parent.set(ra, rb)
      else if (ka > kb) parent.set(rb, ra)
      else { parent.set(rb, ra); rank.set(ra, (rank.get(ra) ?? 0) + 1) }
    }

    const beams = this.elements.filter(e => e.type === 'BEAM' && e.startNode != null && e.endNode != null)
    for (const e of beams) union(e.startNode, e.endNode)

    // --- Build groups ---
    const groupMap = new Map()  // root → { elementIds[], nodeSet }
    for (const e of beams) {
      const root = find(e.startNode)
      if (!groupMap.has(root)) groupMap.set(root, { elementIds: [], nodeSet: new Set() })
      const g = groupMap.get(root)
      g.elementIds.push(e.id)
      g.nodeSet.add(e.startNode)
      g.nodeSet.add(e.endNode)
    }

    // Sort largest first, assign stable numeric IDs
    const groups = [...groupMap.values()]
      .sort((a, b) => b.elementIds.length - a.elementIds.length)
      .map((g, i) => ({ id: i, elementIds: g.elementIds, nodeCount: g.nodeSet.size }))

    // Element → group index map
    this.elementGroupMap = new Map()
    for (const g of groups) {
      for (const eid of g.elementIds) this.elementGroupMap.set(eid, g.id)
    }

    return groups
  }

  /**
   * Compute healthMetrics from parsed arrays when JSON doesn't include it.
   */
  _computeHealthMetrics() {
    const beams = this.elements.filter(e => e.type === 'BEAM')
    const structCount = beams.filter(e => e.category === 'Structure').length
    const pipeCount   = beams.filter(e => e.category === 'Pipe').length

    // Count node usage to detect free-end and orphan nodes
    const nodeUsage = new Map()
    for (const [id] of this.nodeMap) nodeUsage.set(id, 0)
    for (const e of beams) {
      if (e.startNode != null) nodeUsage.set(e.startNode, (nodeUsage.get(e.startNode) ?? 0) + 1)
      if (e.endNode   != null) nodeUsage.set(e.endNode,   (nodeUsage.get(e.endNode)   ?? 0) + 1)
    }
    let freeEndNodes = 0, orphanNodes = 0
    for (const cnt of nodeUsage.values()) {
      if (cnt === 0) orphanNodes++
      else if (cnt === 1) freeEndNodes++
    }

    // Compute total length
    let totalLengthMm = 0, structLenMm = 0, pipeLenMm = 0
    for (const e of beams) {
      const a = this.nodeMap.get(e.startNode)
      const b = this.nodeMap.get(e.endNode)
      if (!a || !b) continue
      const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)
      totalLengthMm += len
      if (e.category === 'Structure') structLenMm += len
      else pipeLenMm += len
    }

    // Short elements (< 1mm)
    let shortElements = 0
    for (const e of beams) {
      const a = this.nodeMap.get(e.startNode)
      const b = this.nodeMap.get(e.endNode)
      if (!a || !b) continue
      const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)
      if (len < 1) shortElements++
    }

    return {
      totals: {
        nodeCount: this.nodeMap.size,
        elementCount: beams.length,
        rigidCount: this.rigids.length,
        pointMassCount: this.pointMasses.length,
        elementsByCategory: { Structure: structCount, Pipe: pipeCount },
        totalLengthMm,
        lengthByCategoryMm: { Structure: structLenMm, Pipe: pipeLenMm },
        bbox: { ...this.bbox },
      },
      issues: {
        freeEndNodes,
        orphanNodes,
        shortElements,
        disconnectedGroups: Math.max(0, this.groups.length - 1),
        unresolvedUbolts: 0,
      },
      diagnosticCounts: { error: 0, warning: 0, info: 0, byCode: {} },
    }
  }

  /**
   * Compute connectivity from groups when JSON doesn't include it.
   */
  _computeConnectivity() {
    const groups = this.groups
    const largest = groups[0]
    // Orphan: nodes not connected to any BEAM element
    const connectedNodes = new Set()
    for (const e of this.elements) {
      if (e.type === 'BEAM') {
        if (e.startNode != null) connectedNodes.add(e.startNode)
        if (e.endNode   != null) connectedNodes.add(e.endNode)
      }
    }
    let isolatedNodeCount = 0
    for (const [id] of this.nodeMap) {
      if (!connectedNodes.has(id)) isolatedNodeCount++
    }

    return {
      groupCount: groups.length,
      largestGroupNodeCount: largest?.nodeCount ?? 0,
      largestGroupElementCount: largest?.elementIds?.length ?? 0,
      largestGroupNodeRatio: this.nodeMap.size > 0 ? (largest?.nodeCount ?? 0) / this.nodeMap.size : 0,
      isolatedNodeCount,
      groups: groups.map(g => ({ id: g.id, nodeCount: g.nodeCount, elementCount: g.elementIds.length })),
    }
  }

  /**
   * Get property details for an element.
   */
  getProperty(propertyId) {
    return this.propertyMap.get(propertyId) ?? null
  }

  /**
   * Get material details for a property.
   */
  getMaterial(materialId) {
    return this.materialMap.get(materialId) ?? null
  }

  /**
   * Get point mass at a node (if any).
   */
  getPointMass(nodeId) {
    return this.pointMasses.find(pm => pm.nodeId === nodeId) ?? null
  }

  /**
   * Format cross-section dims as human-readable string.
   */
  static formatDims(prop) {
    if (!prop) return '-'
    const d = prop.dims ?? []
    switch (prop.kind) {
      case 'Bar':  return `${d[0]}×${d[1]} mm`
      case 'Rod':  return `Ø${d[0]} mm`
      case 'Tube': return `Ø${d[0]}/${d[1]} mm`
      case 'L':    return `L ${d[0]}×${d[1]}×${d[2]} mm`
      case 'H':    return `H ${d[2]}×${d[0]}×${d[3]}/${d[1]} mm`
      default:     return d.join('×') + ' mm'
    }
  }

  _computeBbox(nodes) {
    if (nodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const n of nodes) {
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
      if (n.z < minZ) minZ = n.z
      if (n.z > maxZ) maxZ = n.z
    }
    return { minX, maxX, minY, maxY, minZ, maxZ }
  }
}
