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
    for (const { structure, pipe } of collected) {
      structure.geometry.dispose(); structure.material.dispose()
      pipe.geometry.dispose();      pipe.material.dispose()
    }
    collected.length = 0
  })

  it('returns structure and pipe InstancedMesh objects', () => {
    const stage = new StageData(makeStageJson([
      makeElem(1, 1, 2, 'Structure'),
      makeElem(2, 3, 4, 'Pipe'),
    ]))
    const result = buildBeamMesh(stage)
    collected.push(result)

    expect(result.structure).toBeInstanceOf(THREE.InstancedMesh)
    expect(result.pipe).toBeInstanceOf(THREE.InstancedMesh)
  })

  it('structure count equals number of valid Structure elements', () => {
    const stage = new StageData(makeStageJson([
      makeElem(1, 1, 2, 'Structure'),
      makeElem(2, 2, 3, 'Structure'),
    ]))
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    expect(structure.count).toBe(2)
    expect(pipe.count).toBe(0)
  })

  it('pipe count equals number of valid Pipe elements', () => {
    const stage = new StageData(makeStageJson([
      makeElem(1, 1, 2, 'Pipe'),
      makeElem(2, 3, 4, 'Pipe'),
      makeElem(3, 2, 3, 'Pipe'),
    ]))
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    expect(pipe.count).toBe(3)
    expect(structure.count).toBe(0)
  })

  it('skips elements whose startNode or endNode is missing', () => {
    const stage = new StageData(makeStageJson([
      makeElem(1, 1, 2,  'Structure'),
      makeElem(2, 1, 99, 'Structure'),  // node 99 does not exist
    ]))
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    expect(structure.count).toBe(1)   // only 1 valid element
  })

  it('uses correct colors for structure and pipe materials', () => {
    const stage = new StageData(makeStageJson([makeElem(1, 1, 2, 'Structure')]))
    const { structure, pipe } = buildBeamMesh(stage)
    collected.push({ structure, pipe })

    expect(structure.material.color.getHex()).toBe(0x4682B4)
    expect(pipe.material.color.getHex()).toBe(0xFF8C00)
  })
})
