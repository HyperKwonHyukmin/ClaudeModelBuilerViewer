import * as THREE from 'three'

const GROUP_COLORS = {
  1: 0x00D1FF,  // cyan
  2: 0xB57CFF,  // 보라 — 무게중심 노란 원과 구분
  3: 0x6AE07A,  // 녹색
  4: 0xFF66AA,  // 핫핑크
}

const NODE_R = 0.13

export function buildHoistGroupHighlight(hoistGroups, stageData) {
  const root = new THREE.Group()
  root.name = 'HoistGroupHighlight'
  if (!stageData || !hoistGroups) return root

  for (const groupId of [1, 2, 3, 4]) {
    const nodeIds = hoistGroups[groupId] ?? []
    const valid = nodeIds
      .map(id => ({ id, pos: stageData.getNodePos(id) }))
      .filter(x => x.pos)
    if (valid.length === 0) continue

    const color = GROUP_COLORS[groupId]
    const group = new THREE.Group()
    group.name = `HoistGroup${groupId}`

    const geo = new THREE.SphereGeometry(NODE_R, 18, 12)
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, valid.length)
    const matrix = new THREE.Matrix4()
    mesh.count = 0
    for (const { pos } of valid) {
      matrix.setPosition(pos)
      mesh.setMatrixAt(mesh.count++, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.renderOrder = 40
    group.add(mesh)

    for (const { id, pos } of valid) {
      const label = makeLabel(`G${groupId} N${id}`, color)
      label.position.set(pos.x, pos.y, pos.z + NODE_R * 2.4)
      group.add(label)
    }

    root.add(group)
  }

  return root
}

function makeLabel(text, color) {
  const css = `#${color.toString(16).padStart(6, '0')}`
  const canvas = document.createElement('canvas')
  canvas.width = 220
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 28px sans-serif'
  const textWidth = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(82, textWidth + 24))
  const x = (canvas.width - boxW) / 2
  const y = 13
  const h = 40

  ctx.fillStyle = 'rgba(8, 8, 20, 0.84)'
  ctx.strokeStyle = css
  ctx.lineWidth = 3
  roundRect(ctx, x, y, boxW, h, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
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
  sprite.scale.set(0.86, 0.28, 1)
  sprite.renderOrder = 41
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
