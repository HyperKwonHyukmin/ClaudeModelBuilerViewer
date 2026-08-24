import * as THREE from 'three'
import { COLORS } from '../utils/colors.js'

// 활성 권상 그룹의 가상판(첫 노드의 Z 레벨)에서 ±Tolerance(mm) 이내의 "같은 레벨" 노드를
// 후보로 강조한다. 사용자가 가상판 근처의 실제 노드 중에서 권상점을 고르기 쉽도록 돕는다.
//
// ── 동작(v0.0.46~) ──
//   · 기준 = 선택 노드의 수평 가상판(plateZ). 후보 = |node.z − plateZ| ≤ tol 인 같은 레벨 노드.
//   · X·Y 는 보지 않으므로 모델 어느 구역에서나 일관되게 동작한다.
//     (과거: 전역에서 "바로 위/아래 레벨"을 찾던 방식 → 경사·단차 구역에서 엉뚱한 곳을 잡던 버그를 제거.)
//   · tol 은 사용자 지정값(useEditStore.hoistToleranceMm) 우선, 없으면 모델 높이 기반 자동값.
//
// ── 스타일(STUDIO 표준 §6/§11) ──
//   · "대상을 가리지 말 것" — 솔리드 구가 아니라 바깥 와이어프레임 구(외곽선) + 작은 코어 구 2겹.
//   · 색은 도메인/그룹/선택 색과 겹치지 않는 민트(COLORS.hoistCandidate, "한 색 = 한 의미").

const CAND_COLOR  = COLORS.hoistCandidate
const NODE_RADIUS = 0.0448          // NodePoints 와 동일한 노드 반경(스타일 통일)
const SHELL_R     = NODE_RADIUS * 1.7   // 바깥 와이어프레임 외곽선
const CORE_R      = NODE_RADIUS * 0.62  // 안쪽 코어 점

/**
 * 후보 레벨 판정 자동 Tolerance(mm). 사용자가 값을 비우면 이 값을 쓴다.
 * 모델 높이의 0.4%(최소 2mm) — 같은 층의 미세 Z 편차를 한 레벨로 묶을 정도.
 * @param {number} heightMm  모델 bbox Z 높이(mm)
 * @returns {number}
 */
export function autoHoistToleranceMm(heightMm) {
  const h = Number.isFinite(heightMm) ? Math.max(0, heightMm) : 0
  return Math.max(2, h * 0.004)
}

/**
 * 가상판(plateZ)에서 ±tolMm 이내의 같은 레벨 노드 ID 를 고른다(순수 함수, 렌더링과 무관).
 * X·Y 는 무시하고 Z 단면만 본다 → 구역에 무관하게 일관 동작.
 *
 * @param {Iterable<[number, {z:number}]>} nodeEntries  nodeMap 처럼 [id, {x,y,z}] 를 순회 가능한 것
 * @param {number} plateZ   기준 가상판 Z(mm)
 * @param {number} tolMm    허용오차(mm, 비음수)
 * @param {Set<number>|number[]} [usedIds]  이미 그룹에 속해 제외할 노드 ID
 * @returns {number[]}
 */
export function selectHoistCandidateNodes(nodeEntries, plateZ, tolMm, usedIds) {
  const out = []
  if (!nodeEntries || !Number.isFinite(plateZ) || !Number.isFinite(tolMm)) return out
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds ?? [])
  for (const [id, n] of nodeEntries) {
    if (used.has(id)) continue
    if (!n || !Number.isFinite(n.z)) continue
    if (Math.abs(n.z - plateZ) <= tolMm) out.push(id)
  }
  return out
}

/**
 * 활성 권상 그룹 가상판의 ±Tolerance 이내 같은 레벨 노드를 후보로 강조하는 overlay 를 만든다.
 *
 * @param {Record<number, number[]>} hoistGroups
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {number|null} activeGroupId  - 가상판 기준이 되는 활성 그룹 ID
 * @param {number|null} [toleranceMm]  - 사용자 지정 Tolerance(mm). null/0이하면 자동값 사용
 * @returns {THREE.Group}
 */
export function buildHoistCandidateNodes(hoistGroups, stageData, activeGroupId, toleranceMm = null) {
  const root = new THREE.Group()
  root.name = 'HoistCandidateNodes'
  if (!stageData || !hoistGroups || !stageData.nodeMap) return root
  if (!Number.isInteger(activeGroupId)) return root

  const activeNodes = hoistGroups[activeGroupId] ?? []
  if (activeNodes.length === 0) return root

  const firstNode = stageData.nodeMap.get(activeNodes[0])
  if (!firstNode) return root
  const plateZ = firstNode.z   // mm — 가상판이 놓인 Z 레벨

  const bbox = stageData.bbox
  const heightMm = bbox ? Math.max(0, bbox.maxZ - bbox.minZ) : 0
  const tol = Number.isFinite(toleranceMm) && toleranceMm > 0
    ? toleranceMm
    : autoHoistToleranceMm(heightMm)

  // 이미 어떤 권상 그룹에든 포함된 노드는 후보에서 제외(이미 강조돼 있으므로 중복 방지).
  const used = new Set()
  for (const gid of [1, 2, 3, 4]) for (const n of hoistGroups[gid] ?? []) used.add(n)

  const ids = selectHoistCandidateNodes(stageData.nodeMap, plateZ, tol, used)
  if (ids.length === 0) return root

  const positions = ids.map(id => stageData.getNodePos(id)).filter(Boolean)
  if (positions.length === 0) return root

  root.add(buildShellMarkers(positions))
  root.add(buildCoreMarkers(positions))
  root.add(makeCandidateLabel(`권상 후보 · ${ids.length}점 (±${Math.round(tol)}mm)`, positions))
  return root
}

// 바깥 와이어프레임 외곽선 — 노드를 가리지 않게 비가림(depthTest off).
// (Circle Guide 오버레이도 동일 마커/라벨을 공유하도록 export)
export function buildShellMarkers(positions) {
  const geo = new THREE.SphereGeometry(SHELL_R, 16, 12)
  const mat = new THREE.MeshBasicMaterial({
    color: CAND_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
  })
  return makeInstanced(geo, mat, positions, 44)
}

// 안쪽 코어 점 — 후보 위치를 또렷이 찍어준다.
export function buildCoreMarkers(positions) {
  const geo = new THREE.SphereGeometry(CORE_R, 12, 8)
  const mat = new THREE.MeshBasicMaterial({
    color: CAND_COLOR,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  })
  return makeInstanced(geo, mat, positions, 45)
}

function makeInstanced(geo, mat, positions, renderOrder) {
  const mesh = new THREE.InstancedMesh(geo, mat, positions.length)
  const m = new THREE.Matrix4()
  mesh.count = 0
  for (const p of positions) {
    m.setPosition(p)
    mesh.setMatrixAt(mesh.count++, m)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.renderOrder = renderOrder
  return mesh
}

// 후보 노드 무리의 XY 중심 위에 "권상 후보 · N점 (±Tmm)" 라벨 스프라이트를 띄운다.
export function makeCandidateLabel(text, positions) {
  const c = new THREE.Vector3()
  for (const p of positions) c.add(p)
  if (positions.length > 0) c.multiplyScalar(1 / positions.length)

  const css = `#${CAND_COLOR.toString(16).padStart(6, '0')}`
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
  sprite.position.set(c.x, c.y, c.z + SHELL_R * 2.4)
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
