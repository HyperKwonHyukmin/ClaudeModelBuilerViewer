import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import { buildBeamMesh } from './BeamMesh.js'
import { StageData } from '../data/StageData.js'

const makeStageJson = (elements) => ({
  meta: { phase: 'C', stageName: 'Test', timestamp: '', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: [] },
    { id: 3, x: 2000, y: 0, z: 0, tags: [] },
    { id: 4, x: 3000, y: 0, z: 0, tags: [] },
  ],
  elements,
  rigids: [], properties: [], materials: [], pointMasses: [],
  connectivity: { groupCount: 1, largestGroupNodeCount: 4, isolatedNodeCount: 0, groups: [] },
  healthMetrics: {
    totals: { nodeCount: 4, elementCount: elements.length, rigidCount: 0, pointMassCount: 0,
      bbox: { minX: 0, maxX: 3000, minY: 0, maxY: 0, minZ: 0, maxZ: 0 } },
    issues: {}
  },
  diagnostics: [], trace: [],
})

const makeElem = (id, startNode, endNode, category) => ({
  id, type: 'BEAM', startNode, endNode, propertyId: 1, category, orientation: [0,1,0], sourceName: 'test'
})

describe('buildBeamMesh', () => {
  const collected = []
  afterEach(() => {
    // Dispose geometries/materials to avoid leaks in test
    for (const { structure, pipe } of collected) {
      structure.geometry.dispose()
      structure.material.dispose()
      pipe.geometry.dispose()
      pipe.material.dispose()
    }
    collected.length = 0
  })

  it('returns structure and pipe LineSegments objects', () => {
    const json = makeStageJson([
      makeElem(1, 1, 2, 'Structure'),
      makeElem(2, 3, 4, 'Pipe'),
    ])
    const stage = new StageData(json)
    const result = buildBeamMesh(stage)
    collected.push(result)

    expect(result.structure).toBeInstanceOf(THREE.LineSegments)
    expect(result.pipe).toBeInstanceOf(THREE.LineSegments)
  })

  it('structure has correct vertex count (2 per element)', () => {
    const json = makeStageJson([
      makeElem(1, 1, 2, 'Structure'),
      makeElem(2, 2, 3, 'Structure'),
    ])
    const stage = new StageData(json)
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    const positions = structure.geometry.attributes.position
    expect(positions.count).toBe(4) // 2 elements × 2 vertices
    // pipe should have 0 vertices
    expect(pipe.geometry.attributes.position.count).toBe(0)
  })

  it('pipe has correct vertex count', () => {
    const json = makeStageJson([
      makeElem(1, 1, 2, 'Pipe'),
      makeElem(2, 3, 4, 'Pipe'),
      makeElem(3, 2, 3, 'Pipe'),
    ])
    const stage = new StageData(json)
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    expect(pipe.geometry.attributes.position.count).toBe(6) // 3 × 2
    expect(structure.geometry.attributes.position.count).toBe(0)
  })

  it('skips elements whose startNode or endNode is missing', () => {
    const json = makeStageJson([
      makeElem(1, 1, 2, 'Structure'),
      makeElem(2, 1, 99, 'Structure'), // node 99 does not exist
    ])
    const stage = new StageData(json)
    const { structure } = buildBeamMesh(stage)
    collected.push({ structure, pipe: structure }) // reuse for cleanup

    // Only 1 valid element → 2 vertices
    expect(structure.geometry.attributes.position.count).toBe(2)
  })

  it('uses correct colors for structure and pipe materials', () => {
    const json = makeStageJson([makeElem(1, 1, 2, 'Structure')])
    const stage = new StageData(json)
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    expect(structure.material.color.getHex()).toBe(0x4682B4)
    expect(pipe.material.color.getHex()).toBe(0xFF8C00)
  })
})
