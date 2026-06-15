import * as THREE from 'three'

const SEL_COLOR = 0x00E5FF   // cyan glow
const NODE_HL_R = 0.065      // slightly larger than NODE_RADIUS (0.056)
const ELEM_HL_R = 0.042      // slightly thicker than beam radii

const _dummy = new THREE.Object3D()
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir   = new THREE.Vector3()
const _mat4  = new THREE.Matrix4()

const _hlMat = () => new THREE.MeshBasicMaterial({
  color: SEL_COLOR,
  transparent: true,
  opacity: 0.80,
  depthTest: false,   // render on top of everything (X-ray style)
})

/**
 * Builds highlight cylinders for a set of elements.
 * Used when a Node is picked → show all connected elements.
 *
 * @param {number[]} elementIds
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildElementsHighlight(elementIds, stageData) {
  const group = new THREE.Group()
  const idSet = new Set(elementIds)
  const elems = stageData.elements.filter(e => idSet.has(e.id))
  if (elems.length === 0) return group

  const geo = new THREE.CylinderGeometry(ELEM_HL_R, ELEM_HL_R, 1, 8, 1)
  const mesh = new THREE.InstancedMesh(geo, _hlMat(), elems.length)
  mesh.count = 0

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue
    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue
    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}

/**
 * 편집 모드 Ctrl+Click 다중 선택 element(주황색)를 표시하는 highlight.
 * 시안(단일 선택) · 노란색(노드 다중 선택) 과 구분되는 주황색으로 렌더.
 *
 * @param {number[]} elementIds
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildMultiSelElementHighlight(elementIds, stageData) {
  const group = new THREE.Group()
  const idSet = new Set(elementIds)
  const elems = stageData.elements.filter(e => idSet.has(e.id))
  if (elems.length === 0) return group

  const geo = new THREE.CylinderGeometry(ELEM_HL_R * 1.3, ELEM_HL_R * 1.3, 1, 8, 1)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xFF6B35,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, elems.length)
  mesh.count = 0

  for (const e of elems) {
    const start = stageData.getNodePos(e.startNode)
    const end   = stageData.getNodePos(e.endNode)
    if (!start || !end) continue
    _dir.subVectors(end, start)
    const len = _dir.length()
    if (len < 1e-6) continue
    _dummy.position.addVectors(start, end).multiplyScalar(0.5)
    _dummy.scale.set(1, len, 1)
    _dummy.quaternion.setFromUnitVectors(_axisY, _dir.normalize())
    _dummy.updateMatrix()
    mesh.setMatrixAt(mesh.count++, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}

/**
 * 편집 모드 다중 선택 노드(노란색)를 표시하는 별도 highlight.
 * SEL_COLOR(시안) 와 명확히 구분되는 색을 써서 "단일 선택" 과 헷갈리지 않게.
 *
 * @param {number[]} nodeIds
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildMultiSelectionHighlight(nodeIds, stageData) {
  const group = new THREE.Group()
  const valid = nodeIds
    .map(id => ({ id, pos: stageData.getNodePos(id) }))
    .filter(x => x.pos)
  if (valid.length === 0) return group

  const geo = new THREE.SphereGeometry(NODE_HL_R * 1.15, 14, 9)  // 단일 선택보다 살짝 더 크게
  const mat = new THREE.MeshBasicMaterial({
    color: 0xFFB800,        // 편집 모드 워터마크와 동일한 노란색
    transparent: true,
    opacity: 0.80,
    depthTest: false,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, valid.length)
  mesh.count = 0
  for (const { pos } of valid) {
    _mat4.setPosition(pos)
    mesh.setMatrixAt(mesh.count++, _mat4)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)

  for (const { id, pos } of valid) {
    const label = makeNodeIdLabel(`N${id}`)
    label.position.set(pos.x, pos.y, pos.z + NODE_HL_R * 1.8)
    group.add(label)
  }
  return group
}

/**
 * Builds highlight spheres for a set of node IDs.
 * Used when an Element is picked → show startNode and endNode.
 *
 * @param {number[]} nodeIds
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildNodesHighlight(nodeIds, stageData) {
  const group = new THREE.Group()
  const valid = nodeIds.filter(id => stageData.getNodePos(id))
  if (valid.length === 0) return group

  const geo  = new THREE.SphereGeometry(NODE_HL_R, 12, 8)
  const mesh = new THREE.InstancedMesh(geo, _hlMat(), valid.length)
  mesh.count = 0

  for (const id of valid) {
    _mat4.setPosition(stageData.getNodePos(id))
    mesh.setMatrixAt(mesh.count++, _mat4)
  }
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)
  return group
}

function makeNodeIdLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 110
  canvas.height = 44
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.font = 'bold 18px sans-serif'
  const textWidth = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 6, Math.max(40, textWidth + 14))
  const x = (canvas.width - boxW) / 2
  const y = 8
  const h = 26

  ctx.fillStyle = 'rgba(10, 10, 20, 0.82)'
  ctx.strokeStyle = 'rgba(255, 184, 0, 0.92)'
  ctx.lineWidth = 2
  roundRect(ctx, x, y, boxW, h, 5)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#FFE6A8'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  // 씬 단위 스케일 — 노드 위쪽에 작은 칩 형태로 자연스럽게 떠 있도록.
  sprite.scale.set(0.42, 0.17, 1)
  sprite.renderOrder = 20
  return sprite
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
