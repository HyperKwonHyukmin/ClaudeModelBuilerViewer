import * as THREE from 'three'

// CSS pixels, independent of zoom, model dimensions and display pixel ratio.
export const NODE_PICK_RADIUS_PX = 10
export const LINE_PICK_RADIUS_PX = 6

export function worldUnitsPerPixel(camera, height) {
  return (camera.top - camera.bottom) / (camera.zoom * Math.max(1, height))
}

export function isPickVisible(object) {
  for (let p = object; p; p = p.parent) if (!p.visible) return false
  return true
}

export function isLiveInstance(object, index) {
  if (!object.isInstancedMesh || index == null) return true
  const a = object.instanceMatrix.array
  const o = index * 16
  // Existing layer/delete/isolation masks collapse instances to 0.0001.
  return Math.hypot(a[o], a[o + 1], a[o + 2]) > 0.001
}

export function pickScreenNode(mesh, camera, rect, pointer, deletedIds, radius = NODE_PICK_RADIUS_PX) {
  if (!mesh || !isPickVisible(mesh) || !rect.width || !rect.height) return null
  mesh.updateWorldMatrix(true, false)
  camera.updateMatrixWorld()
  const world = new THREE.Vector3()
  const projected = new THREE.Vector3()
  const a = mesh.instanceMatrix.array
  let best = null
  for (let i = 0; i < mesh.count; i++) {
    if (!isLiveInstance(mesh, i) || deletedIds?.has(mesh.userData.nodeIds[i])) continue
    world.set(a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]).applyMatrix4(mesh.matrixWorld)
    projected.copy(world).project(camera)
    if (projected.z < -1 || projected.z > 1) continue
    const x = (projected.x + 1) * rect.width / 2
    const y = (1 - projected.y) * rect.height / 2
    const distancePx = Math.hypot(x - (pointer.clientX - rect.left), y - (pointer.clientY - rect.top))
    if (distancePx > radius) continue
    // Within one pixel treat coincident candidates as tied: choose the front node.
    if (best && (distancePx > best.distancePx + 1 ||
      (Math.abs(distancePx - best.distancePx) <= 1 && projected.z >= best.depth))) continue
    best = { object: mesh, instanceId: i, point: world.clone(), distancePx, depth: projected.z, x, y }
  }
  return best
}

export function pickScreenElement(targets, stageData, camera, rect, pointer, mask) {
  if (!stageData) return null
  const p = new THREE.Vector2(pointer.clientX - rect.left, pointer.clientY - rect.top)
  const a = new THREE.Vector3(), b = new THREE.Vector3()
  let best = null
  for (const object of targets) {
    if (!object.isInstancedMesh || !object.userData.elementData) continue
    for (let i = 0; i < object.count; i++) {
      if (!isLiveInstance(object, i)) continue
      const e = object.userData.elementData[i]
      if (!e || mask?.deletedElementIds?.has(e.id)) continue
      const start = stageData.getNodePos(e.startNode), end = stageData.getNodePos(e.endNode)
      if (!start || !end) continue
      a.copy(start).project(camera); b.copy(end).project(camera)
      if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) continue
      const ax = (a.x + 1) * rect.width / 2, ay = (1 - a.y) * rect.height / 2
      const dx = (b.x - a.x) * rect.width / 2, dy = (a.y - b.y) * rect.height / 2
      const len2 = dx * dx + dy * dy
      const t = len2 ? THREE.MathUtils.clamp(((p.x - ax) * dx + (p.y - ay) * dy) / len2, 0, 1) : 0
      const distancePx = Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy)
      const depth = a.z + (b.z - a.z) * t
      if (distancePx > LINE_PICK_RADIUS_PX) continue
      if (best && (distancePx > best.distancePx + 1 ||
        (Math.abs(distancePx - best.distancePx) <= 1 && depth >= best.depth))) continue
      best = { object, instanceId: i, point: start.clone().lerp(end, t), distancePx, depth }
    }
  }
  return best
}

// Click, hover and pivot all share the same visibility and hit policy.
export function pickViewport({ pickables, targets, camera, rect, pointer, raycaster, mask, nodeOnly = false, stageData }) {
  if (!rect.width || !rect.height) return []
  camera.updateMatrixWorld()
  const ndc = new THREE.Vector2((pointer.clientX - rect.left) / rect.width * 2 - 1,
    1 - (pointer.clientY - rect.top) / rect.height * 2)
  raycaster.setFromCamera(ndc, camera)
  raycaster.params.Line.threshold = worldUnitsPerPixel(camera, rect.height) * LINE_PICK_RADIUS_PX
  const visible = targets.filter(isPickVisible)
  const node = visible.includes(pickables.nodes)
    ? pickScreenNode(pickables.nodes, camera, rect, pointer, mask?.deletedNodeIds) : null
  if (nodeOnly) return node ? [node] : []
  const hits = raycaster.intersectObjects(visible.filter(o => o !== pickables.nodes)).filter(hit => {
    if (!isLiveInstance(hit.object, hit.instanceId)) return false
    const ud = hit.object.userData
    if (ud.elementData) return !mask?.deletedElementIds?.has(ud.elementData[hit.instanceId]?.id)
    if (ud.massData) return !mask?.deletedMassIds?.has(ud.massData[hit.instanceId]?.id)
    if (ud.rigidData) return !mask?.fullyRemovedRbeIds?.has(ud.rigidData[(hit.index ?? 0) >> 1]?.id)
    return true
  })
  if (node) {
    const nodeDistance = raycaster.ray.direction.dot(node.point.clone().sub(raycaster.ray.origin))
    const clearance = Math.max(0.06, worldUnitsPerPixel(camera, rect.height) * 4)
    // Opaque geometry occludes nodes; explicit node-only / section views can inspect through it.
    if (!hits.length || pickables.nodes.material.depthTest === false ||
      (hits[0].object.material.transparent && hits[0].object.material.opacity <= 0.4) ||
      nodeDistance <= hits[0].distance + clearance) {
      return [node, ...hits]
    }
  }
  if (hits.length) return hits
  const element = pickScreenElement(visible, stageData, camera, rect, pointer, mask)
  return element ? [element] : []
}
