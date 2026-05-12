import * as THREE from 'three'

/**
 * Builds a world-space X/Y/Z coordinate axes gizmo.
 * Placed at origin (model center after centering).
 * Size scales to the model's largest dimension.
 *
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildWorldAxes(stageData) {
  const bbox = stageData.bbox
  const dx = (bbox.maxX - bbox.minX) / 1000
  const dy = (bbox.maxY - bbox.minY) / 1000
  const dz = (bbox.maxZ - bbox.minZ) / 1000
  const modelSize = Math.max(dx, dy, dz, 1)
  const L = modelSize * 0.14   // arrow length
  const hL = L * 0.18          // arrowhead length
  const hR = L * 0.07          // arrowhead radius

  const group = new THREE.Group()
  const origin = new THREE.Vector3(0, 0, 0)

  const AXES = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xFF3333, label: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x33DD33, label: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x3388FF, label: 'Z' },
  ]

  for (const { dir, color, label } of AXES) {
    const arrow = new THREE.ArrowHelper(dir, origin, L, color, hL, hR)
    // Make shaft line thicker — not possible with ArrowHelper directly,
    // but we keep it as is (standard thin line + cone head)
    group.add(arrow)

    // Label sprite at tip + small offset
    const sprite = _makeLabel(label, color, dir.clone().multiplyScalar(L * 1.22))
    group.add(sprite)
  }

  // Small origin dot
  const dotGeo = new THREE.SphereGeometry(L * 0.04, 8, 6)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  group.add(new THREE.Mesh(dotGeo, dotMat))

  return group
}

// ── Label sprite (canvas texture) ────────────────────────────────────────

function _makeLabel(text, color, position) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')

  // Colored circle background
  const hex = `#${color.toString(16).padStart(6, '0')}`
  ctx.fillStyle = hex + '44'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)
  ctx.fill()

  // Text
  ctx.fillStyle = hex
  ctx.font = `bold ${Math.round(size * 0.52)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, size / 2 + 2)

  const texture = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)

  // Scale sprite relative to axis length
  const s = position.length() * 0.22
  sprite.scale.set(s, s, 1)
  sprite.position.copy(position)
  return sprite
}
