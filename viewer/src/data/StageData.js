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
