import * as THREE from 'three'

// 활성 권상 그룹의 가이드 평판(첫 노드의 Z 레벨) 기준으로 "바로 위 / 바로 아래" 레벨의
// 노드를 후보로 강조한다. 사용자가 평판 근처의 실제 노드 중에서 권상점을 고르기 쉽도록 돕는다.
//
// · 위 레벨   → 주황(ABOVE_COLOR)
// · 아래 레벨 → 흰색(BELOW_COLOR)  — 그룹 강조(cyan/보라/녹색/핑크)·무게중심(노랑)과 색이 겹치지 않게 선택.
// 각 레벨에는 후보 노드 마커(구) + 방향/오프셋 라벨(▲/▼)을 함께 그린다.

const ABOVE_COLOR = 0xFF9F45   // 위 레벨 — 주황
const BELOW_COLOR = 0xF2F6FF   // 아래 레벨 — 흰색(아주 옅은 청백)
const NODE_R = 0.115           // 후보 마커 반경 (그룹 하이라이트 0.13 보다 약간 작게)

/**
 * 활성 권상 그룹 평판의 위/아래 가장 가까운 레벨에 속한 노드를 후보로 강조하는 overlay 를 만든다.
 *
 * @param {Record<number, number[]>} hoistGroups
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {number|null} activeGroupId  - 평판 기준이 되는 활성 그룹 ID
 * @returns {THREE.Group}
 */
export function buildHoistCandidateNodes(hoistGroups, stageData, activeGroupId) {
  const root = new THREE.Group()
  root.name = 'HoistCandidateNodes'
  if (!stageData || !hoistGroups || !stageData.nodeMap) return root
  if (!Number.isInteger(activeGroupId)) return root

  const activeNodes = hoistGroups[activeGroupId] ?? []
  if (activeNodes.length === 0) return root

  const firstNode = stageData.nodeMap.get(activeNodes[0])
  if (!firstNode) return root
  const plateZ = firstNode.z   // mm — 평판이 놓인 Z 레벨

  // 레벨 판정 허용오차 — 모델 높이의 0.4%(최소 2mm). 같은 층의 미세 Z 편차를 한 레벨로 묶는다.
  const bbox = stageData.bbox
  const heightMm = bbox ? Math.max(0, bbox.maxZ - bbox.minZ) : 0
  const levelTol = Math.max(2, heightMm * 0.004)

  // 이미 어떤 권상 그룹에든 포함된 노드는 후보에서 제외(이미 강조돼 있으므로 중복 방지).
  const used = new Set()
  for (const gid of [1, 2, 3, 4]) for (const n of hoistGroups[gid] ?? []) used.add(n)

  // 평판보다 위/아래에서 "가장 가까운 레벨 Z" 를 찾는다.
  let aboveZ = null
  let belowZ = null
  for (const [, n] of stageData.nodeMap) {
    const dz = n.z - plateZ
    if (dz > levelTol) {
      if (aboveZ == null || n.z < aboveZ) aboveZ = n.z
    } else if (dz < -levelTol) {
      if (belowZ == null || n.z > belowZ) belowZ = n.z
    }
  }

  // 각 레벨(levelZ ± levelTol)에 속하는 후보 노드 ID 를 모은다 (used 제외).
  const collect = (levelZ) => {
    if (levelZ == null) return []
    const out = []
    for (const [id, n] of stageData.nodeMap) {
      if (used.has(id)) continue
      if (Math.abs(n.z - levelZ) <= levelTol) out.push(id)
    }
    return out
  }
  const aboveIds = collect(aboveZ)
  const belowIds = collect(belowZ)
  if (aboveIds.length === 0 && belowIds.length === 0) return root

  if (aboveIds.length > 0) {
    root.add(buildLevelMarkers(aboveIds, stageData, ABOVE_COLOR))
    root.add(makeLevelLabel(`▲ 위 레벨 +${Math.round(aboveZ - plateZ)}mm · ${aboveIds.length}점`, ABOVE_COLOR, aboveIds, stageData))
  }
  if (belowIds.length > 0) {
    root.add(buildLevelMarkers(belowIds, stageData, BELOW_COLOR))
    root.add(makeLevelLabel(`▼ 아래 레벨 ${Math.round(belowZ - plateZ)}mm · ${belowIds.length}점`, BELOW_COLOR, belowIds, stageData))
  }

  return root
}

function buildLevelMarkers(ids, stageData, color) {
  const positions = ids.map(id => stageData.getNodePos(id)).filter(Boolean)
  const geo = new THREE.SphereGeometry(NODE_R, 16, 12)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length)
  const m = new THREE.Matrix4()
  mesh.count = 0
  for (const p of positions) {
    m.setPosition(p)
    mesh.setMatrixAt(mesh.count++, m)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.renderOrder = 45
  return mesh
}

// 후보 노드 무리의 XY 중심 + 레벨 Z 위에 방향/오프셋 라벨 스프라이트를 띄운다.
function makeLevelLabel(text, color, ids, stageData) {
  const positions = ids.map(id => stageData.getNodePos(id)).filter(Boolean)
  const c = new THREE.Vector3()
  for (const p of positions) c.add(p)
  if (positions.length > 0) c.multiplyScalar(1 / positions.length)

  const css = `#${color.toString(16).padStart(6, '0')}`
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 72
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = 'bold 26px sans-serif'
  const textWidth = Math.ceil(ctx.measureText(text).width)
  const boxW = Math.min(canvas.width - 8, Math.max(120, textWidth + 28))
  const x = (canvas.width - boxW) / 2
  const y = 13
  const h = 42

  ctx.fillStyle = 'rgba(8, 8, 20, 0.86)'
  ctx.strokeStyle = css
  ctx.lineWidth = 3
  roundRect(ctx, x, y, boxW, h, 9)
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
  sprite.position.set(c.x, c.y, c.z + NODE_R * 3.2)
  sprite.scale.set(1.15, 0.26, 1)
  sprite.renderOrder = 46
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
