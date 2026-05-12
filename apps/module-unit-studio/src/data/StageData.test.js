import { describe, it, expect } from 'vitest'
import { StageData } from './StageData.js'

// Minimal JSON fixture matching schema version 1.1
const makeJson = (overrides = {}) => ({
  meta: {
    phase: 'C',
    stageName: 'TestStage',
    timestamp: '2026-04-24T08:29:25.0Z',
    unit: 'mm',
    schemaVersion: '1.1',
  },
  nodes: [
    { id: 1, x: 1000, y: 2000, z: 3000, tags: [] },
    { id: 2, x: 3000, y: 2000, z: 3000, tags: ['Weld'] },
    { id: 3, x: 2000, y: 4000, z: 3000, tags: ['Boundary'] },
    { id: 4, x: 2000, y: 0,    z: 3000, tags: ['Weld', 'Boundary'] },
  ],
  elements: [],
  rigids: [],
  properties: [],
  materials: [],
  pointMasses: [],
  connectivity: { groupCount: 1, largestGroupNodeCount: 4, isolatedNodeCount: 0, groups: [] },
  healthMetrics: {
    totals: { nodeCount: 4, elementCount: 0, rigidCount: 0, pointMassCount: 0, bbox: { minX: 1000, minY: 0, minZ: 3000, maxX: 3000, maxY: 4000, maxZ: 3000 } },
    issues: {}
  },
  diagnostics: [],
  trace: [],
  ...overrides,
})

describe('StageData', () => {
  describe('getNodeGroupIndices', () => {
    it('finalGroups 가 있으면 그것을 우선 사용한다 (시각적 색의 ground truth)', () => {
      const stage = new StageData(makeJson({
        connectivity: {
          groups: [
            { elementIds: [10, 11], nodeIds: [1, 2], nodeCount: 2 },
          ],
        },
        elements: [
          { id: 10, type: 'BEAM', startNode: 1, endNode: 2, category: 'Structure' },
          { id: 11, type: 'BEAM', startNode: 2, endNode: 1, category: 'Structure' },
        ],
      }))
      // 마지막 단계 매핑이 부착되지 않은 상태에서는 자체 groups 폴백
      expect(stage.getNodeGroupIndices(1)).toEqual([0])
      // finalGroups 가 다른 매핑을 부착하면 그게 우선
      stage.finalGroups = [
        { id: 0, elementIds: [], nodeIds: [3, 4] },
        { id: 1, elementIds: [], nodeIds: [1, 2] },
      ]
      stage._nodeGroupsMap = null  // 캐시 무효화 (테스트 목적)
      expect(stage.getNodeGroupIndices(1)).toEqual([1])
      expect(stage.getNodeGroupIndices(3)).toEqual([0])
    })

    it('getRbeConnectedNodeIds 는 independent / dependent 노드를 모두 반환', () => {
      const stage = new StageData(makeJson({
        rigids: [
          { id: 100, independentNode: 1, dependentNodes: [2, 3], cm: '123456' },
          { id: 101, independentNode: 4, dependentNodes: [], cm: '123456' },
        ],
      }))
      const ids = stage.getRbeConnectedNodeIds()
      expect(ids.has(1)).toBe(true)
      expect(ids.has(2)).toBe(true)
      expect(ids.has(3)).toBe(true)
      expect(ids.has(4)).toBe(true)
      expect(ids.has(5)).toBe(false)
      expect(ids.has(99)).toBe(false)
    })

    it('getPipeOnlyNodeIds 는 Pipe 만 연결된 노드만 반환 (Structure/RBE/PointMass 공유 노드 제외)', () => {
      const stage = new StageData(makeJson({
        nodes: [
          { id: 1, x: 0, y: 0, z: 0, tags: [] },
          { id: 2, x: 1, y: 0, z: 0, tags: [] },   // Pipe 만 연결
          { id: 3, x: 2, y: 0, z: 0, tags: [] },   // Pipe + Structure
          { id: 4, x: 3, y: 0, z: 0, tags: [] },   // Pipe 만 연결되지만 RBE dependent
          { id: 5, x: 4, y: 0, z: 0, tags: [] },   // Pipe 만 연결되지만 PointMass
          { id: 6, x: 5, y: 0, z: 0, tags: [] },   // Structure 만
        ],
        elements: [
          { id: 10, type: 'BEAM', startNode: 1, endNode: 2, category: 'Pipe',      propertyId: 1 },
          { id: 11, type: 'BEAM', startNode: 2, endNode: 3, category: 'Pipe',      propertyId: 1 },
          { id: 12, type: 'BEAM', startNode: 3, endNode: 6, category: 'Structure', propertyId: 1 },
          { id: 13, type: 'BEAM', startNode: 4, endNode: 5, category: 'Pipe',      propertyId: 1 },
        ],
        rigids: [{ id: 100, independentNode: 4, dependentNodes: [], cm: '123456' }],
        pointMasses: [{ id: 200, nodeId: 5, mass: 1.0, sourceName: 'pm' }],
      }))
      const ids = stage.getPipeOnlyNodeIds()
      expect(ids.has(1)).toBe(true)    // Pipe(끝점)
      expect(ids.has(2)).toBe(true)    // Pipe 만 연결
      expect(ids.has(3)).toBe(false)   // Pipe + Structure
      expect(ids.has(4)).toBe(false)   // RBE 가 pin
      expect(ids.has(5)).toBe(false)   // PointMass 가 pin
      expect(ids.has(6)).toBe(false)   // Structure
    })

    it('한 노드가 두 그룹의 교차점이면 두 그룹 모두 반환', () => {
      const stage = new StageData(makeJson())
      stage.finalGroups = [
        { id: 0, elementIds: [], nodeIds: [1, 2, 5] },
        { id: 1, elementIds: [], nodeIds: [5, 3, 4] },   // 노드 5 는 양쪽
      ]
      stage._nodeGroupsMap = null
      expect(stage.getNodeGroupIndices(5)).toEqual([0, 1])
      expect(stage.getNodeGroupIndices(2)).toEqual([0])
      expect(stage.getNodeGroupIndices(3)).toEqual([1])
      expect(stage.getNodeGroupIndices(99)).toEqual([])
    })
  })

  describe('constructor', () => {
    it('builds nodeMap with O(1) access', () => {
      const stage = new StageData(makeJson())
      expect(stage.nodeMap.size).toBe(4)
      expect(stage.nodeMap.get(1)).toMatchObject({ x: 1000, y: 2000, z: 3000, tags: [] })
      expect(stage.nodeMap.get(99)).toBeUndefined()
    })

    it('preserves meta, healthMetrics, connectivity, diagnostics, trace', () => {
      const stage = new StageData(makeJson())
      expect(stage.meta.stageName).toBe('TestStage')
      expect(stage.healthMetrics.totals.nodeCount).toBe(4)
      expect(stage.connectivity.groupCount).toBe(1)
      expect(stage.diagnostics).toHaveLength(0)
      expect(stage.trace).toHaveLength(0)
    })

    it('normalizes Nastran beam card types for viewer rendering', () => {
      const stage = new StageData(makeJson({
        elements: [
          { id: 10, type: 'CBEAM', startNode: 1, endNode: 2, category: 'Structure' },
          { id: 11, type: 'CBAR', startNode: 2, endNode: 3, category: 'Structure' },
          { id: 12, type: 'CROD', startNode: 3, endNode: 4, category: 'Pipe' },
        ],
        connectivity: null,
      }))

      expect(stage.elements.map(e => e.type)).toEqual(['BEAM', 'BEAM', 'BEAM'])
      expect(stage.elements.map(e => e.cardType)).toEqual(['CBEAM', 'CBAR', 'CROD'])
      expect(stage.groups[0].elementIds).toEqual(expect.arrayContaining([10, 11, 12]))
    })

    it('uses modelPart to split structure and pipe categories', () => {
      const stage = new StageData(makeJson({
        elements: [
          { id: 10, type: 'CBEAM', startNode: 1, endNode: 2, category: 'Structure', modelPart: 'stru' },
          { id: 11, type: 'CBEAM', startNode: 2, endNode: 3, category: 'Structure', modelPart: 'pipe' },
        ],
        connectivity: null,
        healthMetrics: null,
      }))

      expect(stage.elements.map(e => e.category)).toEqual(['Structure', 'Pipe'])
      expect(stage.elements.map(e => e.sourceCategory)).toEqual(['Structure', 'Structure'])
      expect(stage.healthMetrics.totals.elementsByCategory).toEqual({ Structure: 1, Pipe: 1 })
    })
  })

  describe('bbox and center', () => {
    it('computes bbox correctly', () => {
      const stage = new StageData(makeJson())
      // x: 1000-3000, y: 0-4000, z: 3000-3000
      expect(stage.bbox.minX).toBe(1000)
      expect(stage.bbox.maxX).toBe(3000)
      expect(stage.bbox.minY).toBe(0)
      expect(stage.bbox.maxY).toBe(4000)
      expect(stage.bbox.minZ).toBe(3000)
      expect(stage.bbox.maxZ).toBe(3000)
    })

    it('computes center correctly', () => {
      const stage = new StageData(makeJson())
      expect(stage.center.x).toBeCloseTo(2000)
      expect(stage.center.y).toBeCloseTo(2000)
      expect(stage.center.z).toBeCloseTo(3000)
    })
  })

  describe('getNodePos', () => {
    it('returns centered and scaled (mm→m) position for known node', () => {
      const stage = new StageData(makeJson())
      // node 1: x=1000, center.x=2000 → (1000-2000)/1000 = -1.0
      // node 1: y=2000, center.y=2000 → (2000-2000)/1000 = 0.0
      // node 1: z=3000, center.z=3000 → (3000-3000)/1000 = 0.0
      const pos = stage.getNodePos(1)
      expect(pos.x).toBeCloseTo(-1.0)
      expect(pos.y).toBeCloseTo(0.0)
      expect(pos.z).toBeCloseTo(0.0)
    })

    it('returns null for unknown node id', () => {
      const stage = new StageData(makeJson())
      expect(stage.getNodePos(999)).toBeNull()
    })
  })

  describe('nodesByTag', () => {
    it('returns ids of nodes with given tag', () => {
      const stage = new StageData(makeJson())
      const weldIds = stage.nodesByTag('Weld')
      expect(weldIds).toContain(2)
      expect(weldIds).toContain(4)
      expect(weldIds).not.toContain(1)
      expect(weldIds).not.toContain(3)
    })

    it('returns ids of Boundary-tagged nodes', () => {
      const stage = new StageData(makeJson())
      const boundaryIds = stage.nodesByTag('Boundary')
      expect(boundaryIds).toContain(3)
      expect(boundaryIds).toContain(4)
      expect(boundaryIds).not.toContain(1)
    })

    it('returns empty array for unknown tag', () => {
      const stage = new StageData(makeJson())
      expect(stage.nodesByTag('Unknown')).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('handles single node (bbox with zero extents)', () => {
      const json = makeJson({
        nodes: [{ id: 1, x: 500, y: 500, z: 500, tags: [] }],
        healthMetrics: {
          totals: { nodeCount: 1, elementCount: 0, rigidCount: 0, pointMassCount: 0, bbox: { minX: 500, minY: 500, minZ: 500, maxX: 500, maxY: 500, maxZ: 500 } },
          issues: {}
        }
      })
      const stage = new StageData(json)
      expect(stage.nodeMap.size).toBe(1)
      const pos = stage.getNodePos(1)
      // center = (500,500,500), node pos = (0,0,0)
      expect(pos.x).toBeCloseTo(0)
      expect(pos.y).toBeCloseTo(0)
      expect(pos.z).toBeCloseTo(0)
    })

    it('handles nodes with no tags array gracefully', () => {
      const json = makeJson({
        nodes: [{ id: 1, x: 0, y: 0, z: 0, tags: undefined }],
        healthMetrics: {
          totals: { nodeCount: 1, elementCount: 0, rigidCount: 0, pointMassCount: 0, bbox: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 } },
          issues: {}
        }
      })
      expect(() => new StageData(json)).not.toThrow()
      const stage = new StageData(json)
      expect(stage.nodesByTag('Weld')).toHaveLength(0)
    })
  })
})
