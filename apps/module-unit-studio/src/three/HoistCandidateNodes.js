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
const REVIEW_COLOR = 0xFFC447
const ADVISORY_COLOR = 0xFF8A3D
const NODE_RADIUS = 0.0448          // NodePoints 와 동일한 노드 반경(스타일 통일)
const SHELL_R     = NODE_RADIUS * 1.7   // 바깥 와이어프레임 외곽선
const CORE_R      = NODE_RADIUS * 0.62  // 안쪽 코어 점
const ENGINE_MAX_Z_DIFF_MM = 500
const DEFAULT_MAX_CANDIDATES = 40

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
 * 이미 찍은 점과 CoG를 기준으로 다음 권상점 후보를 랭킹한다.
 * 같은 Z는 우선순위일 뿐 유일한 필터가 아니다. Strict OFF에서는 500mm를 넘는 Z 단차도
 * advisory로 남겨 현장 사용자가 경고를 보고 선택할 수 있게 한다.
 */
export function rankNextHoistCandidates(nodeEntries, selectedIds, options = {}) {
  if (!nodeEntries) return []
  const entries = [...nodeEntries]
  const byId = new Map(entries)
  const selected = (selectedIds ?? []).map(id => byId.get(id)).filter(isFiniteNode)
  if (selected.length === 0 || selected.length >= 4) return []

  const used = options.usedIds instanceof Set ? options.usedIds : new Set(options.usedIds ?? [])
  const tol = Number.isFinite(options.toleranceMm) && options.toleranceMm >= 0 ? options.toleranceMm : 0
  const strict = options.strict === true
  const cog = isFiniteXY(options.cogMm) ? options.cogMm : null
  const preferred = options.preferredNodeIds instanceof Set ? options.preferredNodeIds : new Set(options.preferredNodeIds ?? [])
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? options.maxCandidates : DEFAULT_MAX_CANDIDATES

  const finite = entries.map(([, n]) => n).filter(isFiniteNode)
  if (finite.length === 0) return []
  const span = Math.max(1, Math.hypot(
    Math.max(...finite.map(n => n.x)) - Math.min(...finite.map(n => n.x)),
    Math.max(...finite.map(n => n.y)) - Math.min(...finite.map(n => n.y)),
  ))

  const ranked = []
  for (const [id, n] of entries) {
    if (used.has(id) || !isFiniteNode(n)) continue
    const pts = [...selected, n]
    const zRange = Math.max(...pts.map(p => p.z)) - Math.min(...pts.map(p => p.z))
    const tier = zRange <= tol ? 'recommended' : zRange <= ENGINE_MAX_Z_DIFF_MM ? 'review' : 'advisory'
    if (strict && tier === 'advisory') continue

    let score = tier === 'recommended' ? 30 : tier === 'review' ? 10 : -60
    if (preferred.has(id)) score += 8

    if (selected.length === 1) {
      const a = selected[0]
      const separation = Math.hypot(n.x - a.x, n.y - a.y) / span
      score += separation * 45
      if (cog) {
        const ax = a.x - cog.x, ay = a.y - cog.y
        const bx = n.x - cog.x, by = n.y - cog.y
        const ar = Math.hypot(ax, ay), br = Math.hypot(bx, by)
        if (ar > 1e-6 && br > 1e-6) {
          const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (ar * br)))
          score += ((1 - cosine) / 2) * 50
          score += Math.max(0, 1 - Math.abs(ar - br) / span) * 20
        }
      }
    } else {
      score += (convexHullAreaXY(pts) / (span * span)) * 120
      const nearest = Math.min(...selected.map(p => Math.hypot(n.x - p.x, n.y - p.y)))
      score += (nearest / span) * 25
      if (cog) {
        const oldCx = selected.reduce((s, p) => s + p.x, 0) / selected.length
        const oldCy = selected.reduce((s, p) => s + p.y, 0) / selected.length
        const newCx = pts.reduce((s, p) => s + p.x, 0) / pts.length
        const newCy = pts.reduce((s, p) => s + p.y, 0) / pts.length
        score += ((Math.hypot(oldCx - cog.x, oldCy - cog.y) - Math.hypot(newCx - cog.x, newCy - cog.y)) / span) * 30
      }
    }
    score -= (zRange / ENGINE_MAX_Z_DIFF_MM) * 5
    ranked.push({ id, tier, score, zDiffMm: zRange })
  }

  return ranked.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, maxCandidates)
}

/**
 * 활성 권상 그룹에서 현재 선택·CoG·Z단차를 함께 평가한 다음 권상점 후보 overlay를 만든다.
 *
 * @param {Record<number, number[]>} hoistGroups
 * @param {import('../data/StageData.js').StageData} stageData
 * @param {number|null} activeGroupId  - 가상판 기준이 되는 활성 그룹 ID
 * @param {number|null} [toleranceMm]  - 사용자 지정 Tolerance(mm). null/0이하면 자동값 사용
 * @returns {THREE.Group}
 */
export function buildHoistCandidateNodes(hoistGroups, stageData, activeGroupId, toleranceMm = null, options = {}) {
  const root = new THREE.Group()
  root.name = 'HoistCandidateNodes'
  if (!stageData || !hoistGroups || !stageData.nodeMap) return root
  if (!Number.isInteger(activeGroupId)) return root

  const activeNodes = hoistGroups[activeGroupId] ?? []
  if (activeNodes.length === 0) return root

  if (!stageData.nodeMap.get(activeNodes[0])) return root

  const bbox = stageData.bbox
  const heightMm = bbox ? Math.max(0, bbox.maxZ - bbox.minZ) : 0
  const tol = Number.isFinite(toleranceMm) && toleranceMm > 0
    ? toleranceMm
    : autoHoistToleranceMm(heightMm)

  // 이미 어떤 권상 그룹에든 포함된 노드는 후보에서 제외(이미 강조돼 있으므로 중복 방지).
  const used = new Set()
  for (const gid of [1, 2, 3, 4]) for (const n of hoistGroups[gid] ?? []) used.add(n)

  const ranked = rankNextHoistCandidates(stageData.nodeMap, activeNodes, {
    ...options, usedIds: used, toleranceMm: tol,
  })
  if (ranked.length === 0) return root

  const colors = { recommended: CAND_COLOR, review: REVIEW_COLOR, advisory: ADVISORY_COLOR }
  for (const tier of ['recommended', 'review', 'advisory']) {
    const positions = ranked.filter(c => c.tier === tier).map(c => stageData.getNodePos(c.id)).filter(Boolean)
    if (positions.length === 0) continue
    root.add(buildShellMarkers(positions, colors[tier]))
    root.add(buildCoreMarkers(positions, colors[tier]))
  }
  const allPositions = ranked.map(c => stageData.getNodePos(c.id)).filter(Boolean)
  const recommendedCount = ranked.filter(c => c.tier === 'recommended').length
  const reviewCount = ranked.length - recommendedCount
  root.add(makeCandidateLabel(`다음 후보 ${ranked.length}점 · 권장 ${recommendedCount} / 확인 ${reviewCount}`, allPositions))
  return root
}

// 바깥 와이어프레임 외곽선 — 노드를 가리지 않게 비가림(depthTest off).
// (Circle Guide 오버레이도 동일 마커/라벨을 공유하도록 export)
export function buildShellMarkers(positions, color = CAND_COLOR) {
  const geo = new THREE.SphereGeometry(SHELL_R, 16, 12)
  const mat = new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
  })
  return makeInstanced(geo, mat, positions, 44)
}

// 안쪽 코어 점 — 후보 위치를 또렷이 찍어준다.
export function buildCoreMarkers(positions, color = CAND_COLOR) {
  const geo = new THREE.SphereGeometry(CORE_R, 12, 8)
  const mat = new THREE.MeshBasicMaterial({
    color,
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
  mesh.raycast = () => {}
  return mesh
}

// 후보 노드 무리의 XY 중심 위에 "권상 후보 · N점 (±Tmm)" 라벨 스프라이트를 띄운다.
export function makeCandidateLabel(text, positions, color = CAND_COLOR) {
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
  const topZ = positions.length > 0 ? Math.max(...positions.map(p => p.z)) : c.z
  sprite.position.set(c.x, c.y, topZ + SHELL_R * 5)
  sprite.scale.set(1.15, 0.26, 1)
  sprite.renderOrder = 46
  sprite.raycast = () => {}
  return sprite
}

function isFiniteXY(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y)
}

function isFiniteNode(p) {
  return isFiniteXY(p) && Number.isFinite(p.z)
}

function convexHullAreaXY(points) {
  const pts = points.map(p => ({ x: p.x, y: p.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return 0
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop()
    upper.push(p)
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
  let twiceArea = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    twiceArea += a.x * b.y - b.x * a.y
  }
  return Math.abs(twiceArea) / 2
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
