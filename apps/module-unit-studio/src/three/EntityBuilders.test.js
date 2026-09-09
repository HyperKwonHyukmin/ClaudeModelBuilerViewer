import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildNodePoints, updateNodePresentation } from './NodePoints.js'
import { pxToWorldFactor, updateScreenSpaceUniforms } from './screenSpaceMaterial.js'
import { buildRigidMesh } from './RigidMesh.js'
import { buildMassMarkers } from './MassMarkers.js'
import { buildBoundaryMarkers } from './BoundaryMarkers.js'
import { buildUboltDofLabels } from './UboltDofLabels.js'
import { buildUboltMarkers } from './UboltMarkers.js'
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
  it('returns a Group containing LineSegments', () => {
    const json = makeJson({ rigids: [{ id: 1, independentNode: 1, dependentNodes: [2], remark: 'UBOLT', sourceName: 'x' }] })
    const stage = new StageData(json)
    const group = buildRigidMesh(stage)
    expect(group).toBeInstanceOf(THREE.Group)
    expect(group.children.some(c => c instanceof THREE.LineSegments)).toBe(true)
    group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.() })
  })

  it('creates 2 vertices per resolved rigid (independent→dependent)', () => {
    const json = makeJson({
      rigids: [
        { id: 1, independentNode: 1, dependentNodes: [2], remark: 'UBOLT', sourceName: 'x' },
        { id: 2, independentNode: 3, dependentNodes: [4], remark: 'UBOLT', sourceName: 'x' },
      ]
    })
    const stage = new StageData(json)
    const group = buildRigidMesh(stage)
    // 2 rigids × 1 dependent each → 4 vertices total (모두 UBOLT 한 mesh에 집계)
    const total = group.children.reduce((s, c) => s + (c.geometry?.attributes?.position?.count ?? 0), 0)
    expect(total).toBe(4)
    group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.() })
  })

  it('skips rigids with empty dependentNodes', () => {
    const json = makeJson({
      rigids: [{ id: 1, independentNode: 1, dependentNodes: [], remark: 'UBOLT', sourceName: 'x' }]
    })
    const stage = new StageData(json)
    const group = buildRigidMesh(stage)
    // 정점 0 → 자식 LineSegments 자체가 만들어지지 않음
    expect(group.children.length).toBe(0)
  })

  it('attaches userData.rigidData with one entry per segment for picking', () => {
    const json = makeJson({
      rigids: [
        { id: 10, independentNode: 1, dependentNodes: [2], remark: 'UBOLT', cm: '123', sourceName: 'x' },
        { id: 20, independentNode: 3, dependentNodes: [4], remark: null,    cm: null,  sourceName: 'x' },
      ]
    })
    const stage = new StageData(json)
    const group = buildRigidMesh(stage)
    const lines = group.children.filter(c => c instanceof THREE.LineSegments)
    expect(lines).toHaveLength(2)   // ubolt mesh + 일반 mesh 분리
    for (const line of lines) {
      expect(Array.isArray(line.userData.rigidData)).toBe(true)
      const segCount = line.geometry.attributes.position.count / 2
      expect(line.userData.rigidData).toHaveLength(segCount)
      for (const meta of line.userData.rigidData) {
        expect(meta).toMatchObject({ id: expect.any(Number), independentNode: expect.any(Number) })
        expect(Array.isArray(meta.dependentNodes)).toBe(true)
      }
    }
    group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.() })
  })

  it('treats cm-only rigids as U-bolt data when remark is missing', () => {
    const json = makeJson({
      rigids: [{ id: 10, independentNode: 1, dependentNodes: [2], remark: null, cm: '23' }]
    })
    const stage = new StageData(json)
    const rigidGroup = buildRigidMesh(stage)
    const markerGroup = buildUboltMarkers(stage)
    const originalDocument = globalThis.document
    globalThis.document = makeCanvasDocument()
    const dofGroup = buildUboltDofLabels(stage)
    globalThis.document = originalDocument

    expect(rigidGroup.children).toHaveLength(1)
    expect(rigidGroup.children[0].userData.rigidData[0]).toMatchObject({ id: 10, cm: '23' })
    expect(markerGroup.children[0].count).toBe(1)
    expect(dofGroup.children).toHaveLength(1)

    rigidGroup.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.() })
    markerGroup.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.() })
    dofGroup.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.() })
  })

  it('keeps Side Passage-class visibility in overview and promotes nodes during node work', () => {
    const stage = new StageData(makeJson())
    const mesh = buildNodePoints(stage)
    const overview = updateNodePresentation(mesh, { worldPerPixel: 0.01, zoom: 1, mode: 'auto' })
    expect(overview).toMatchObject({ pixels: 6, opacity: 1, depthTest: true })
    const working = updateNodePresentation(mesh, { worldPerPixel: 0.01, zoom: 1, mode: 'auto', interactive: true })
    expect(working).toMatchObject({ pixels: 8, opacity: 1, depthTest: true })
    mesh.geometry.dispose()
    mesh.material.dispose()
  })

  it('converts pixels with the orthographic viewport and zoom used by Module Unit', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100)
    camera.zoom = 2
    const stage = new StageData(makeJson())
    const mesh = buildNodePoints(stage)
    const root = new THREE.Group()
    root.add(mesh)
    expect(pxToWorldFactor(camera, 600)).toBeCloseTo(0.005)
    expect(updateScreenSpaceUniforms(root, camera, 600)).toBe(1)
    expect(mesh.material.userData.ss.uniforms.uOrthographic.value).toBe(1)
    mesh.geometry.dispose()
    mesh.material.dispose()
  })
})

function makeCanvasDocument() {
  return {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            font: '',
            measureText: text => ({ width: String(text).length * 32 }),
            beginPath() {},
            moveTo() {},
            lineTo() {},
            quadraticCurveTo() {},
            closePath() {},
            fill() {},
            stroke() {},
            fillText() {},
            set fillStyle(_value) {},
            set strokeStyle(_value) {},
            set lineWidth(_value) {},
            set textAlign(_value) {},
            set textBaseline(_value) {},
          }
        },
      }
    },
  }
}

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

// ── BoundaryMarkers (now returns a Group merging Boundary + Weld) ─────
describe('buildBoundaryMarkers', () => {
  it('returns a THREE.Group', () => {
    const stage = new StageData(makeJson())
    const group = buildBoundaryMarkers(stage)
    expect(group).toBeInstanceOf(THREE.Group)
  })

  it('group has children for Boundary-tagged and Weld-tagged nodes', () => {
    const stage = new StageData(makeJson())
    const group = buildBoundaryMarkers(stage)
    // makeJson has Boundary nodes (3,4) and Weld nodes (2,4) → 2 InstancedMesh children
    expect(group.children.length).toBeGreaterThan(0)
  })

  it('returns an empty Group when no tagged nodes', () => {
    const json = makeJson({ nodes: [{ id: 1, x: 0, y: 0, z: 0, tags: [] }] })
    const stage = new StageData(json)
    const group = buildBoundaryMarkers(stage)
    expect(group).toBeInstanceOf(THREE.Group)
    expect(group.children.length).toBe(0)
  })
})
