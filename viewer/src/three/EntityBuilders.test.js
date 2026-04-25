import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import { buildNodePoints } from './NodePoints.js'
import { buildRigidMesh } from './RigidMesh.js'
import { buildMassMarkers } from './MassMarkers.js'
import { buildBoundaryMarkers } from './BoundaryMarkers.js'
import { buildWeldMarkers } from './WeldMarkers.js'
import { StageData } from '../data/StageData.js'

const makeJson = (overrides = {}) => ({
  meta: { phase: 'C', stageName: 'Test', timestamp: '', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: ['Weld'] },
    { id: 3, x: 2000, y: 0, z: 0, tags: ['Boundary'] },
    { id: 4, x: 3000, y: 0, z: 0, tags: ['Weld', 'Boundary'] },
  ],
  elements: [],
  rigids: [],
  properties: [], materials: [],
  pointMasses: [],
  connectivity: { groupCount: 1, largestGroupNodeCount: 4, isolatedNodeCount: 0, groups: [] },
  healthMetrics: {
    totals: { nodeCount: 4, elementCount: 0, rigidCount: 0, pointMassCount: 0,
      bbox: { minX: 0, maxX: 3000, minY: 0, maxY: 0, minZ: 0, maxZ: 0 } },
    issues: {}
  },
  diagnostics: [], trace: [],
  ...overrides,
})

// ── NodePoints ────────────────────────────────────────────────
describe('buildNodePoints', () => {
  it('returns an InstancedMesh (red spheres)', () => {
    const stage = new StageData(makeJson())
    const mesh = buildNodePoints(stage)
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    mesh.material.dispose()
  })

  it('has count equal to number of nodes', () => {
    const stage = new StageData(makeJson())
    const mesh = buildNodePoints(stage)
    expect(mesh.count).toBe(4)
    mesh.material.dispose()
  })
})

// ── RigidMesh ─────────────────────────────────────────────────
describe('buildRigidMesh', () => {
  it('returns a LineSegments object', () => {
    const json = makeJson({ rigids: [{ id: 1, independentNode: 1, dependentNodes: [2], remark: 'UBOLT', sourceName: 'x' }] })
    const stage = new StageData(json)
    const mesh = buildRigidMesh(stage)
    expect(mesh).toBeInstanceOf(THREE.LineSegments)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it('creates 2 vertices per resolved rigid (independent→dependent)', () => {
    const json = makeJson({
      rigids: [
        { id: 1, independentNode: 1, dependentNodes: [2], remark: 'UBOLT', sourceName: 'x' },
        { id: 2, independentNode: 3, dependentNodes: [4], remark: 'UBOLT', sourceName: 'x' },
      ]
    })
    const stage = new StageData(json)
    const mesh = buildRigidMesh(stage)
    // 2 rigids × 1 dependent each → 4 vertices total
    expect(mesh.geometry.attributes.position.count).toBe(4)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it('skips rigids with empty dependentNodes', () => {
    const json = makeJson({
      rigids: [{ id: 1, independentNode: 1, dependentNodes: [], remark: 'UBOLT', sourceName: 'x' }]
    })
    const stage = new StageData(json)
    const mesh = buildRigidMesh(stage)
    expect(mesh.geometry.attributes.position.count).toBe(0)
    mesh.geometry.dispose(); mesh.material.dispose()
  })
})

// ── MassMarkers ───────────────────────────────────────────────
describe('buildMassMarkers', () => {
  it('returns an InstancedMesh', () => {
    const json = makeJson({ pointMasses: [{ id: 1, nodeId: 1, mass: 1.5, sourceName: 'x' }] })
    const stage = new StageData(json)
    const mesh = buildMassMarkers(stage)
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it('has count equal to number of point masses', () => {
    const json = makeJson({
      pointMasses: [
        { id: 1, nodeId: 1, mass: 1.0, sourceName: 'x' },
        { id: 2, nodeId: 2, mass: 2.0, sourceName: 'x' },
        { id: 3, nodeId: 3, mass: 3.0, sourceName: 'x' },
      ]
    })
    const stage = new StageData(json)
    const mesh = buildMassMarkers(stage)
    expect(mesh.count).toBe(3)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it('returns empty InstancedMesh when no masses', () => {
    const stage = new StageData(makeJson())
    const mesh = buildMassMarkers(stage)
    expect(mesh.count).toBe(0)
    mesh.geometry.dispose(); mesh.material.dispose()
  })
})

// ── BoundaryMarkers ───────────────────────────────────────────
describe('buildBoundaryMarkers', () => {
  it('returns an InstancedMesh with count = Boundary-tagged nodes', () => {
    const stage = new StageData(makeJson())
    const mesh = buildBoundaryMarkers(stage)
    // nodes 3 and 4 have Boundary tag
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(mesh.count).toBe(2)
    mesh.geometry.dispose(); mesh.material.dispose()
  })

  it('returns count=0 when no Boundary nodes', () => {
    const json = makeJson({ nodes: [{ id: 1, x: 0, y: 0, z: 0, tags: [] }] })
    const stage = new StageData(json)
    const mesh = buildBoundaryMarkers(stage)
    expect(mesh.count).toBe(0)
    mesh.geometry.dispose(); mesh.material.dispose()
  })
})

// ── WeldMarkers ───────────────────────────────────────────────
describe('buildWeldMarkers', () => {
  it('returns an InstancedMesh with count = Weld-tagged nodes', () => {
    const stage = new StageData(makeJson())
    const mesh = buildWeldMarkers(stage)
    // nodes 2 and 4 have Weld tag
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh)
    expect(mesh.count).toBe(2)
    mesh.geometry.dispose(); mesh.material.dispose()
  })
})
