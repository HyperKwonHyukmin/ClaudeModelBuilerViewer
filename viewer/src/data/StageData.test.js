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
