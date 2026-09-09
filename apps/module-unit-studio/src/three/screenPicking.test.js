import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { pickScreenNode, pickScreenElement, pickViewport, worldUnitsPerPixel } from './screenPicking.js'
import { buildNodePoints, updateNodePresentation } from './NodePoints.js'

const rect = { left: 20, top: 30, width: 800, height: 600 }
const pointer = (x = 400, y = 300) => ({ clientX: x + rect.left, clientY: y + rect.top })
function fixture(positions = [[0, 0, 0]]) {
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100)
  camera.position.z = 10
  camera.updateMatrixWorld()
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0448), new THREE.MeshBasicMaterial(), positions.length)
  positions.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(...p)))
  mesh.userData.nodeIds = positions.map((_, i) => i + 1)
  return { camera, mesh }
}

describe('screen-space node picking', () => {
  it.each(['cylinder', 'section3d'])('keeps overview quiet but promotes nodes for explicit node work in %s', mode => {
    const { camera } = fixture()
    const mesh = buildNodePoints({ nodeMap: new Map([[1, {}]]), getNodePos: () => new THREE.Vector3(), rigids: [] }, 'category', mode)
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())
    beam.updateMatrixWorld()
    updateNodePresentation(mesh, { worldPerPixel: 0.01, zoom: 1 })
    expect(mesh.material.depthTest).toBe(true)
    expect(mesh.material.opacity).toBe(0.24)
    let hits = pickViewport({ pickables: { nodes: mesh }, targets: [mesh, beam], camera, rect,
      pointer: pointer(), raycaster: new THREE.Raycaster() })
    expect(hits[0].object).toBe(beam)

    updateNodePresentation(mesh, { worldPerPixel: 0.01, zoom: 1, interactive: true })
    expect(mesh.material.depthTest).toBe(false)
    expect(mesh.material.opacity).toBe(0.9)
    expect(mesh.renderOrder).toBeGreaterThan(beam.renderOrder)
    hits = pickViewport({ pickables: { nodes: mesh }, targets: [mesh, beam], camera, rect,
      pointer: pointer(), raycaster: new THREE.Raycaster() })
    expect(hits[0].object).toBe(mesh)
    mesh.visible = false
    expect(pickViewport({ pickables: { nodes: mesh }, targets: [mesh, beam], camera, rect,
      pointer: pointer(), raycaster: new THREE.Raycaster() })[0].object).toBe(beam)
  })
  it.each([0.1, 1, 10, 100])('has a 10 CSS pixel aperture at zoom %s', zoom => {
    const { camera, mesh } = fixture()
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    expect(pickScreenNode(mesh, camera, rect, pointer(409))?.instanceId).toBe(0)
    expect(pickScreenNode(mesh, camera, rect, pointer(411))).toBeNull()
  })
  it('chooses the nearest screen node and frontmost coincident node', () => {
    const { camera, mesh } = fixture([[0, 0, 0], [0, 0, 2], [0.08, 0, 0]])
    expect(pickScreenNode(mesh, camera, rect, pointer())?.instanceId).toBe(1)
    expect(pickScreenNode(mesh, camera, rect, pointer(408))?.instanceId).toBe(2)
  })
  it('excludes collapsed, deleted, layer-hidden and clipped nodes', () => {
    const { camera, mesh } = fixture([[0, 0, 0], [0, 0, 1], [0, 0, 200]])
    mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001))
    expect(pickScreenNode(mesh, camera, rect, pointer(), new Set([2]))).toBeNull()
    const group = new THREE.Group()
    group.add(mesh)
    group.visible = false
    expect(pickScreenNode(mesh, camera, rect, pointer())).toBeNull()
  })
  it('handles zero-size viewports', () => {
    const { camera, mesh } = fixture()
    expect(pickScreenNode(mesh, camera, { ...rect, height: 0 }, pointer())).toBeNull()
  })
  it('uses projection scale instead of camera distance for line tolerance', () => {
    const { camera } = fixture()
    expect(worldUnitsPerPixel(camera, 600)).toBe(0.01)
    camera.position.z = 50
    camera.zoom = 10
    expect(worldUnitsPerPixel(camera, 600)).toBe(0.001)
  })
  it('respects node filters and opaque occlusion, but allows explicit node-only selection', () => {
    const { camera, mesh } = fixture()
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial())
    blocker.position.z = 2
    blocker.updateMatrixWorld()
    const options = { pickables: { nodes: mesh }, targets: [mesh, blocker], camera, rect,
      pointer: pointer(), raycaster: new THREE.Raycaster() }
    expect(pickViewport(options)[0].object).toBe(blocker)
    expect(pickViewport({ ...options, targets: [mesh], nodeOnly: true })[0].object).toBe(mesh)
    expect(pickViewport({ ...options, targets: [], nodeOnly: true })).toEqual([])
  })
  it('picks a thin beam within six pixels, excluding hidden and deleted instances', () => {
    const { camera } = fixture()
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.01, 0.01, 1), new THREE.MeshBasicMaterial(), 1)
    mesh.setMatrixAt(0, new THREE.Matrix4())
    mesh.userData.elementData = [{ id: 12, startNode: 1, endNode: 2 }]
    const points = [null, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]
    const stage = { getNodePos: id => points[id] }
    expect(pickScreenElement([mesh], stage, camera, rect, pointer(400, 305))?.instanceId).toBe(0)
    expect(pickScreenElement([mesh], stage, camera, rect, pointer(400, 307))).toBeNull()
    expect(pickScreenElement([mesh], stage, camera, rect, pointer(), { deletedElementIds: new Set([12]) })).toBeNull()
    mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001))
    expect(pickScreenElement([mesh], stage, camera, rect, pointer())).toBeNull()
  })
})
