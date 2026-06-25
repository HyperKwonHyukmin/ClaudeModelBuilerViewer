import * as THREE from 'three'
import { rotatePointAboutAxis, rotateDirectionAboutAxis } from './geometry.js'

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
    this.elements = (json.elements ?? []).map(normalizeElement)
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
   * Returns ALL connectivity group indices a node belongs to (sorted by group id).
   * 시각적 그룹 색의 ground truth 인 finalGroups (모든 stage 공유) 를 우선 사용한다.
   * finalGroups 가 없으면 현재 stage 의 groups 로 폴백.
   *
   * 두 그룹이 만나는 교차점 노드는 두 그룹 모두에 들어 있을 수 있으므로 배열 반환.
   * 호출자(ThreeViewport)가 진행 중인 polygon 그룹과 일치하는 후보를 우선 선택할 수 있다.
   *
   * @param {number} nodeId
   * @returns {number[]}  소속 그룹 id 배열 (없으면 빈 배열)
   */
  getNodeGroupIndices(nodeId) {
    if (!this._nodeGroupsMap) {
      this._nodeGroupsMap = new Map()  // nodeId → number[]
      const groups = this.finalGroups ?? this.groups ?? []
      for (const g of groups) {
        for (const nid of g.nodeIds ?? []) {
          let arr = this._nodeGroupsMap.get(nid)
          if (!arr) { arr = []; this._nodeGroupsMap.set(nid, arr) }
          if (!arr.includes(g.id)) arr.push(g.id)
        }
      }
    }
    return this._nodeGroupsMap.get(nodeId) ?? []
  }

  /**
   * @deprecated 호환용 단일값 반환 — 가능한 그룹 중 첫 번째.
   * 새 코드는 getNodeGroupIndices(nodeId) 를 직접 사용해 모호성을 해소할 것.
   */
  getNodeGroupIndex(nodeId) {
    const arr = this.getNodeGroupIndices(nodeId)
    return arr.length > 0 ? arr[0] : null
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
   * 모델 전체를 axis(X/Y/Z) 중심·pivot 기준으로 angleDeg 회전한다 (in-place mutate).
   * - 모든 노드 좌표(mm) 회전
   * - 모든 CBEAM/CBAR orientation 벡터(방향) 회전 — 단면 방향/응력 일관 유지
   * - 좌표 의존 캐시(bbox/center) 재계산 (topology 캐시는 노드 ID 기반이라 유지)
   * @param {'X'|'Y'|'Z'} axis
   * @param {number} angleDeg
   * @param {{x:number,y:number,z:number}} pivot  회전 기준점(보통 CoG)
   * @returns {number} 회전한 노드 수
   */
  applyRotation(axis, angleDeg, pivot) {
    const p = pivot ?? this.center ?? { x: 0, y: 0, z: 0 }
    let count = 0
    for (const n of this.nodeMap.values()) {
      const [x, y, z] = rotatePointAboutAxis(n.x, n.y, n.z, axis, angleDeg, p)
      n.x = x; n.y = y; n.z = z
      count++
    }
    for (const e of this.elements ?? []) {
      if (Array.isArray(e.orientation) && e.orientation.length === 3) {
        const [vx, vy, vz] = rotateDirectionAboutAxis(e.orientation[0], e.orientation[1], e.orientation[2], axis, angleDeg)
        e.orientation = [vx, vy, vz]
      }
    }
    // 좌표 의존 파생값 갱신 (getNodePos 가 center 를 사용하므로 회전 후 반드시 재계산)
    this.bbox = this._computeBbox([...this.nodeMap.values()])
    this.center = {
      x: (this.bbox.minX + this.bbox.maxX) / 2,
      y: (this.bbox.minY + this.bbox.maxY) / 2,
      z: (this.bbox.minZ + this.bbox.maxZ) / 2,
    }
    // healthMetrics.totals.bbox 도 좌표 스냅샷이므로 함께 갱신 (stale 방지)
    if (this.healthMetrics?.totals?.bbox) {
      this.healthMetrics.totals.bbox = { ...this.bbox }
    }
    return count
  }

  /**
   * 같은 데이터(nodeMap/elements/캐시 등)를 가리키는 새 인스턴스를 만든다.
   * applyRotation 처럼 in-place mutate 한 뒤 호출하면, React 가 stageData "참조 변경"으로
   * 인식해 ThreeViewport 의 stageData 키 effect(씬 rebuild·오버레이·CoG)를 모두 재실행한다.
   * 회전은 topology(노드 ID 기반 캐시)를 바꾸지 않으므로 캐시를 그대로 공유해도 안전하다.
   * @returns {StageData}
   */
  shallowClone() {
    const next = Object.create(StageData.prototype)
    Object.assign(next, this)
    return next
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
   * BEAM 연결성 그룹 정보를 채운다.
   * 우선순위:
   *  1) JSON의 connectivity.groups[]에 nodeIds/elementIds가 있으면 그대로 사용 (빌더 결과 = ground truth)
   *  2) 없으면 client-side Union-Find로 fallback 계산 (RBE2 union 포함)
   *
   * Sets this.elementGroupMap (Map<elementId, groupIndex>) and returns groups[].
   */
  _computeGroups() {
    // 1) 빌더가 이미 RBE2 union까지 적용한 그룹을 JSON에 넣어준 경우
    const conn = this.connectivity
    if (conn?.groups?.length && conn.groups[0]?.elementIds && conn.groups[0]?.nodeIds) {
      // 빈 그룹(요소 0개)은 시각화 의미가 없으므로 제외 — 노드만 가진 잔여 그룹은 색·번호 카드를 차지하지 않도록 필터
      // 그 다음 요소 수 내림차순으로 정렬해 가장 큰 그룹이 0번이 되도록 (빌더 출력도 보통 같은 순서지만 안전 장치)
      const groups = [...conn.groups]
        .filter(g => (g.elementIds?.length ?? 0) > 0)
        .sort((a, b) => (b.elementIds?.length ?? 0) - (a.elementIds?.length ?? 0))
        .map((g, i) => ({
          id:         i,
          elementIds: g.elementIds ?? [],
          nodeCount:  g.nodeIds?.length ?? g.nodeCount ?? 0,
          nodeIds:    g.nodeIds ?? [],
        }))

      this.elementGroupMap = new Map()
      for (const g of groups) {
        for (const eid of g.elementIds) this.elementGroupMap.set(eid, g.id)
      }
      return groups
    }

    // 2) Fallback — client-side Union-Find (BEAM + RBE2)
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
    for (const r of this.rigids) {
      if (r.independentNode == null || !r.dependentNodes?.length) continue
      for (const depNode of r.dependentNodes) union(r.independentNode, depNode)
    }

    const groupMap = new Map()
    for (const e of beams) {
      const root = find(e.startNode)
      if (!groupMap.has(root)) groupMap.set(root, { elementIds: [], nodeSet: new Set() })
      const g = groupMap.get(root)
      g.elementIds.push(e.id)
      g.nodeSet.add(e.startNode)
      g.nodeSet.add(e.endNode)
    }

    const groups = [...groupMap.values()]
      .sort((a, b) => b.elementIds.length - a.elementIds.length)
      .map((g, i) => ({ id: i, elementIds: g.elementIds, nodeCount: g.nodeSet.size, nodeIds: [...g.nodeSet] }))

    this.elementGroupMap = new Map()
    for (const g of groups) {
      for (const eid of g.elementIds) this.elementGroupMap.set(eid, g.id)
    }
    return groups
  }

  /**
   * BEAM 요소에 한 번도 참조되지 않고 RBE2 의 independent/dependent 도 아닌 노드 id 목록.
   * NodePoints.js · _computeHealthMetrics 의 'orphan' 판정 룰과 동일하다.
   */
  getOrphanNodeIds() {
    const beams = this.elements.filter(e => e.type === 'BEAM')
    const usage = new Map()
    for (const [id] of this.nodeMap) usage.set(id, 0)
    for (const e of beams) {
      if (e.startNode != null) usage.set(e.startNode, (usage.get(e.startNode) ?? 0) + 1)
      if (e.endNode   != null) usage.set(e.endNode,   (usage.get(e.endNode)   ?? 0) + 1)
    }
    const rbeNodeSet = new Set()
    for (const r of this.rigids) {
      if (r.independentNode != null) rbeNodeSet.add(r.independentNode)
      for (const d of r.dependentNodes ?? []) rbeNodeSet.add(d)
    }
    const orphans = []
    for (const [id, cnt] of usage) {
      if (cnt === 0 && !rbeNodeSet.has(id)) orphans.push(id)
    }
    orphans.sort((a, b) => a - b)
    return orphans
  }

  /**
   * Compute healthMetrics from parsed arrays when JSON doesn't include it.
   */
  _computeHealthMetrics() {
    const beams = this.elements.filter(e => e.type === 'BEAM')
    const structCount = beams.filter(e => e.category === 'Structure').length
    const pipeCount   = beams.filter(e => e.category === 'Pipe').length

    // Count node usage to detect free-end and orphan nodes
    // RBE2 연결점(independent/dependent)은 카운트와 무관하게 shared로 간주 → free/orphan에서 제외
    const nodeUsage = new Map()
    for (const [id] of this.nodeMap) nodeUsage.set(id, 0)
    for (const e of beams) {
      if (e.startNode != null) nodeUsage.set(e.startNode, (nodeUsage.get(e.startNode) ?? 0) + 1)
      if (e.endNode   != null) nodeUsage.set(e.endNode,   (nodeUsage.get(e.endNode)   ?? 0) + 1)
    }
    const rbeNodeSet = new Set()
    for (const r of this.rigids) {
      if (r.independentNode != null) rbeNodeSet.add(r.independentNode)
      for (const d of r.dependentNodes ?? []) rbeNodeSet.add(d)
    }
    let freeEndNodes = 0, orphanNodes = 0
    for (const [id, cnt] of nodeUsage) {
      if (rbeNodeSet.has(id)) continue
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
   * RBE2(rigids) 의 independent / dependent 노드 ID 집합. lazy 캐시.
   * 권상 모드에서 기존 강체 연결 노드를 정보성 색상으로 표시하는 데 사용한다.
   * Wire CROD 연결은 허용되며 이 집합 자체가 선택 제한으로 사용되지는 않는다.
   * @returns {Set<number>}
   */
  getRbeConnectedNodeIds() {
    if (this._rbeNodeIds) return this._rbeNodeIds
    const out = new Set()
    for (const r of this.rigids ?? []) {
      if (r.independentNode != null) out.add(r.independentNode)
      for (const d of r.dependentNodes ?? []) {
        if (d != null) out.add(d)
      }
    }
    this._rbeNodeIds = out
    return out
  }

  /**
   * Pipe element 에만 연결된 노드 ID 집합. Structure 요소나 RBE/PointMass 에 연결된
   * 노드는 제외 — 그런 노드는 배관 레이어가 꺼져도 다른 카테고리가 살아있으므로
   * 사용자에게 의미 있는 노드로 남기 위함. lazy 캐시.
   * @returns {Set<number>}
   */
  getPipeOnlyNodeIds() {
    if (this._pipeOnlyNodeIds) return this._pipeOnlyNodeIds
    const status = new Map()   // nodeId → { pipe:bool, other:bool }
    const mark = (nodeId, isPipe) => {
      if (nodeId == null) return
      const v = status.get(nodeId) ?? { pipe: false, other: false }
      if (isPipe) v.pipe = true
      else v.other = true
      status.set(nodeId, v)
    }
    for (const e of this.elements ?? []) {
      const isPipe = e.category === 'Pipe'
      mark(e.startNode, isPipe)
      mark(e.endNode,   isPipe)
    }
    // RBE 와 PointMass 는 배관 외 다른 의미를 부여하므로 'other' 로 카운트.
    for (const r of this.rigids ?? []) {
      mark(r.independentNode, false)
      for (const d of r.dependentNodes ?? []) mark(d, false)
    }
    for (const pm of this.pointMasses ?? []) {
      mark(pm.nodeId, false)
    }
    const out = new Set()
    for (const [nodeId, v] of status) {
      if (v.pipe && !v.other) out.add(nodeId)
    }
    this._pipeOnlyNodeIds = out
    return out
  }

  /**
   * Structure element 에만 연결된 노드 ID 집합. Pipe 요소나 RBE/PointMass 에 연결된
   * 노드는 제외 — 그런 노드는 구조 레이어가 꺼져도 다른 카테고리가 살아있으므로
   * 사용자에게 의미 있는 노드로 남기 위함. lazy 캐시.
   * @returns {Set<number>}
   */
  getStructureOnlyNodeIds() {
    if (this._structureOnlyNodeIds) return this._structureOnlyNodeIds
    const status = new Map()   // nodeId → { struct:bool, other:bool }
    const mark = (nodeId, isStruct) => {
      if (nodeId == null) return
      const v = status.get(nodeId) ?? { struct: false, other: false }
      if (isStruct) v.struct = true
      else v.other = true
      status.set(nodeId, v)
    }
    for (const e of this.elements ?? []) {
      const isStruct = e.category === 'Structure'
      mark(e.startNode, isStruct)
      mark(e.endNode,   isStruct)
    }
    for (const r of this.rigids ?? []) {
      mark(r.independentNode, false)
      for (const d of r.dependentNodes ?? []) mark(d, false)
    }
    for (const pm of this.pointMasses ?? []) {
      mark(pm.nodeId, false)
    }
    const out = new Set()
    for (const [nodeId, v] of status) {
      if (v.struct && !v.other) out.add(nodeId)
    }
    this._structureOnlyNodeIds = out
    return out
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

const BEAM_CARD_TYPES = new Set(['BEAM', 'CBEAM', 'CBAR', 'CROD', 'CONROD'])
const MODEL_PART_CATEGORY = new Map([
  ['stru', 'Structure'],
  ['structure', 'Structure'],
  ['struct', 'Structure'],
  ['pipe', 'Pipe'],
  ['piping', 'Pipe'],
])

function normalizeElement(element) {
  const type = String(element?.type ?? '').toUpperCase()
  if (!BEAM_CARD_TYPES.has(type)) return element
  const category = normalizeModelPartCategory(element.modelPart) ?? element.category
  return {
    ...element,
    cardType: element.cardType ?? type,
    sourceCategory: element.sourceCategory ?? element.category,
    category,
    type: 'BEAM',
  }
}

function normalizeModelPartCategory(modelPart) {
  const key = String(modelPart ?? '').trim().toLowerCase()
  return MODEL_PART_CATEGORY.get(key) ?? null
}
