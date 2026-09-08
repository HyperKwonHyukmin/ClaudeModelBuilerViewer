import * as THREE from 'three'

// 그룹 2 는 무게중심 노란 원과 헷갈리지 않도록 보라, 3/4 는 그 영향으로 시프트.
// 4 가지 모두 노란 계열에서 떨어진 hue 로 통일.
const GROUP_COLORS = {
  1: 0x00D1FF,  // cyan
  2: 0xB57CFF,  // 보라 (기존 3 색)
  3: 0x6AE07A,  // 녹색 (기존 4 색)
  4: 0xFF66AA,  // 핫핑크 (신규)
}

const COG_R = 0.18         // 마커 sphere 반경 (씬 단위 m)
const CROSS_LEN = 0.55     // 십자 가이드 길이
const LINE_OPACITY = 0.85

/**
 * 권상 그룹별 도형의 기하 무게중심(centroid)을 작은 sphere + 십자 가이드 + 라벨로 표시.
 * 그룹의 노드가 2개 이상일 때만 그린다 (도형이 만들어진 시점). 모델 전체 무게중심 마커와
 * 비교해 권상 균형을 시각적으로 가늠할 수 있게 한다.
 *
 * @param {Record<number, number[]>} hoistGroups
 * @param {import('../data/StageData.js').StageData} stageData
 * @returns {THREE.Group}
 */
export function buildHoistGroupCog(hoistGroups, stageData) {
  const root = new THREE.Group()
  root.name = 'HoistGroupCog'
  if (!stageData || !hoistGroups) return root

  for (const groupId of [1, 2, 3, 4]) {
    const nodeIds = hoistGroups[groupId] ?? []
    const positions = nodeIds
      .map(id => stageData.getNodePos(id))
      .filter(Boolean)
    if (positions.length < 2) continue

    const centroid = computeCentroid(positions)
    const colorHex = GROUP_COLORS[groupId]

    // Sphere
    const sphereGeo = new THREE.SphereGeometry(COG_R, 18, 12)
    const sphereMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
    })
    const sphere = new THREE.Mesh(sphereGeo, sphereMat)
    sphere.position.copy(centroid)
    sphere.renderOrder = 70
    root.add(sphere)

    // 십자 가이드 (X/Y/Z 축 방향) — 모델 COG 와 같은 시각 어휘
    root.add(makeCross(centroid, colorHex))

    // 라벨
    const label = makeLabel(`G${groupId} 기하 중심`, colorHex)
    label.position.set(centroid.x, centroid.y, centroid.z + COG_R * 2.6)
    root.add(label)
  }

  return root
}

function computeCentroid(positions) {
  let sx = 0, sy = 0, sz = 0
  for (const p of positions) { sx += p.x; sy += p.y; sz += p.z }
  const n = positions.length
  return new THREE.Vector3(sx / n, sy / n, sz / n)
}

function makeCross(center, colorHex) {
  const half = CROSS_LEN / 2
  const pts = [
    new THREE.Vector3(center.x - half, center.y, center.z),
    new THREE.Vector3(center.x + half, center.y, center.z),
    new THREE.Vector3(center.x, center.y - half, center.z),
    new THREE.Vector3(center.x, center.y + half, center.z),
    new THREE.Vector3(center.x, center.y, center.z - half),
    new THREE.Vector3(center.x, center.y, center.z + half),
  ]
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: LINE_OPACITY,
    depthTest: false,
  })
  const line = new THREE.LineSegments(geo, mat)
  line.renderOrder = 71
  return line
}

function makeLabel(text, color) {
  const css = `#${color.toString(16).padStart(6, '0')}`
  const canvas = document.createElement('canvas')
  canvas.width = 280
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 24px sans-serif'
  const textWidth = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(120, textWidth + 24))
  const x = (canvas.width - boxW) / 2
  const y = 13
  const h = 40

  ctx.fillStyle = 'rgba(8, 8, 20, 0.86)'
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
  sprite.scale.set(1.05, 0.27, 1)
  sprite.renderOrder = 72
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
