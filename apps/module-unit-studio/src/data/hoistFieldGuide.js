// Field screening only: no engine status or Strict gate is changed here.
const finitePoint = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
const mean = pts => Object.fromEntries(['x', 'y', 'z'].map(k => [k, pts.reduce((s, p) => s + p[k], 0) / pts.length]))
const signature = ids => [...ids].map(Number).sort((a, b) => a - b).join(',')

// Fluid emptying and rotation already mutate StageData; rigid edits do not alter mass.
export const hasPendingGuideMassEdits = intents => (intents ?? []).some(i => !['addRigid', 'deleteRigid', 'emptyPipeFluid', 'rotateModel'].includes(i.kind))

export function hullXY(points) {
  const pts = [...new Map(points.map(p => [`${p.x},${p.y}`, p])).values()].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const half = arr => {
    const out = []
    for (const p of arr) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop()
      out.push(p)
    }
    return out.slice(0, -1)
  }
  return [...half(pts), ...half([...pts].reverse())]
}

function onSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return { x: a.x + t * dx, y: a.y + t * dy, z: p.z }
}

export function measurePlacement(hull, cog) {
  if (!hull.length) return null
  let nearest = hull[0]
  if (hull.length > 1) {
    const ends = hull.length === 2 ? 1 : hull.length
    for (let i = 0; i < ends; i++) {
      const p = onSegment(cog, hull[i], hull[(i + 1) % hull.length])
      if (distance(cog, p) < distance(cog, nearest)) nearest = p
    }
  }
  const inside = hull.length >= 3 && hull.every((p, i) => cross(p, hull[(i + 1) % hull.length], cog) >= -1e-6)
  const d = distance(cog, nearest)
  return { inside, nearest, deviationMm: inside ? 0 : d, signedMarginMm: inside ? d : -d }
}

export function directionXY(dx, dy) {
  const scale = Math.max(Math.abs(dx), Math.abs(dy))
  if (scale < 1e-6) return '현재 위치'
  return [Math.abs(dx) > scale * .15 ? (dx > 0 ? '+X' : '−X') : '', Math.abs(dy) > scale * .15 ? (dy > 0 ? '+Y' : '−Y') : ''].filter(Boolean).join(' / ')
}

/** Engine apexes are reused only if mode, height, groups and lug coordinates still match. */
function matchingApexes(report, groups, stageData, wireLengthM, mode) {
  const apexes = report?.visualization?.apexes
  const wires = report?.visualization?.wires
  if (!apexes?.length || !wires?.length || report?.input?.liftingMode?.id !== mode) return null
  if (!Number.isFinite(report.input.wireLengthMm) || Math.abs(report.input.wireLengthMm - wireLengthM * 1000) > .01) return null
  const mapping = new Map()
  for (const a of apexes) {
    if (!finitePoint(a.pointMm) || !a.assignedNodeIds?.length) return null
    const gid = Number(a.splitFromGroupId ?? a.groupId)
    mapping.set(gid, [...(mapping.get(gid) ?? []), ...a.assignedNodeIds])
  }
  if (mapping.size !== groups.length || groups.some(g => signature(mapping.get(g.id) ?? []) !== signature(g.ids))) return null
  if (wires.some(w => {
    const p = stageData.nodeMap.get(Number(w.lugNodeId)), q = w.endMm
    return !finitePoint(p) || !finitePoint(q) || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > .1
  })) return null
  return apexes.map(a => ({ ...a.pointMm, groupId: Number(a.splitFromGroupId ?? a.groupId) }))
}

export function buildFieldGuide({ stageData, groups: rawGroups, cog, wireLengthM, tolerance, mode, report, deleteMask }) {
  const notices = []
  const groups = []
  const connected = new Set()
  for (const e of stageData?.elements ?? []) {
    if (!deleteMask?.deletedElementIds?.has(e.id)) for (const id of e.nodeIds ?? [e.startNode, e.endNode]) connected.add(id)
  }
  const used = new Set()
  for (const [id, ids] of Object.entries(rawGroups ?? {})) {
    if (!ids.length) continue
    const pts = []
    for (const nid of ids) {
      const p = stageData?.nodeMap?.get(nid)
      if (!finitePoint(p) || deleteMask?.deletedNodeIds?.has(nid)) {
        notices.push({ groupId: Number(id), nodeId: nid, text: `G${id} · Node ${nid}: 삭제되거나 없는 노드입니다. 체결점을 다시 선택하세요.` })
        continue
      }
      if (used.has(nid)) notices.push({ groupId: Number(id), nodeId: nid, text: `Node ${nid}가 여러 그룹에 중복되어 있습니다. 그룹 배정을 확인하세요.` })
      used.add(nid)
      if (!connected.has(nid)) notices.push({ groupId: Number(id), nodeId: nid, text: `G${id} · Node ${nid}: 직접 연결 부재가 확인되지 않습니다. RBE 및 실제 하중 전달 경로를 확인하세요.` })
      pts.push(p)
    }
    if (pts.length) groups.push({ id: Number(id), ids, pts, center: mean(pts) })
  }
  if (!finitePoint(cog) || !groups.length) return { available: false, notices, message: !finitePoint(cog) ? '무게중심 정보가 없어 배치를 비교할 수 없습니다.' : '권상 노드를 선택하면 배치 안내가 표시됩니다.' }
  const heightValid = Number.isFinite(wireLengthM) && wireLengthM > 0
  const actual = heightValid && !notices.length ? matchingApexes(report, groups, stageData, wireLengthM, mode) : null
  const apexes = actual || groups.map(g => ({ ...g.center, z: g.center.z + (heightValid ? wireLengthM * 1000 : 0), groupId: g.id }))
  const hull = hullXY(apexes)
  const planeZ = cog.z // XY projection plane is NOT a physical support surface.
  const nominal = measurePlacement(hull, cog)
  const toleranceValid = tolerance?.enabled && ['x', 'y', 'z'].every(k => Number.isFinite(tolerance[k]) && tolerance[k] >= 0)
  const tol = toleranceValid ? tolerance : { x: 0, y: 0, z: 0 }
  const corners = toleranceValid ? [-1, 1].flatMap(x => [-1, 1].map(y => ({ x: cog.x + x * tol.x, y: cog.y + y * tol.y, z: cog.z + tol.z }))) : [cog]
  const worst = corners.map(c => ({ cog: c, ...measurePlacement(hull, c) })).sort((a, b) => a.signedMarginMm - b.signedMarginMm)[0]
  const h = mean(apexes).z - cog.z - tol.z
  const tiltDeg = heightValid && h > 0 && hull.length < 3 ? Math.atan2(worst.deviationMm, h) * 180 / Math.PI : null
  const span = Math.max(...hull.flatMap(a => hull.map(b => distance(a, b))), 1)
  // 5% is a visual attention band, not a safety limit or a PASS/FAIL criterion.
  const nearBoundary = hull.length >= 3 && worst.inside && worst.signedMarginMm / span < .05
  const focus = worst.nearest
  const direction = directionXY(worst.cog.x - focus.x, worst.cog.y - focus.y)
  const nearestGroup = [...groups].sort((a, b) => distance(a.center, focus) - distance(b.center, focus))[0]
  const actions = [...notices]
  if (!heightValid) actions.push({ text: '정점 솟음 높이를 입력하세요. 현재는 XY 배치만 비교합니다.' })
  if (heightValid && h <= 0) actions.push({ text: '정점 평균 높이가 무게중심보다 낮거나 같습니다. 실제 훅 높이와 무게중심 높이를 확인하세요.' })
  if (hull.length >= 3 && !worst.inside) actions.push({ groupId: nearestGroup.id, text: `${toleranceValid && nominal.inside ? '오차 범위 일부가' : '무게중심이'} 권상 정점 영역 밖입니다. ${direction} 방향으로 인접 G${nearestGroup.id} 체결점 또는 전체 배치를 조정해 영역을 확보하세요.` })
  else if (hull.length < 3 && worst.deviationMm > 1) actions.push({ groupId: nearestGroup.id, text: `권상 중심${hull.length === 2 ? '선' : ''}에서 편심이 있습니다. ${direction} 방향으로 배치를 이동하는 안을 검토하세요. 기울어짐 가능성이 있으며 전도 여부를 단정하지 않습니다.` })
  else if (nearBoundary) actions.push({ groupId: nearestGroup.id, text: `G${nearestGroup.id} 쪽 경계 여유가 작습니다. 가까운 경계 쪽 체결점을 벌리는 안과 슬링각·간섭을 함께 확인하세요.` })
  if (tolerance?.enabled && !toleranceValid) actions.push({ text: '무게중심 오차 X/Y/Z에 0 이상의 값을 모두 입력하세요. 현재 오차는 미고려입니다.' })
  let minAngle = null, angleGroup = null
  if (heightValid) for (const g of groups) {
    // Preview uses group centre; actual split slings are reported by Stage 4 separately.
    const ap = { ...g.center, z: g.center.z + wireLengthM * 1000 }
    for (const p of g.pts) {
      const angle = Math.atan2(ap.z - p.z, distance(ap, p)) * 180 / Math.PI
      if (minAngle === null || angle < minAngle) { minAngle = angle; angleGroup = g.id }
    }
  }
  if (minAngle !== null && minAngle < 60) actions.push({ groupId: angleGroup, text: `G${angleGroup} 중심 미리보기 슬링각 ${minAngle.toFixed(1)}°: 정점 높이를 높이거나 체결 간격을 줄이는 안을 확인하세요. 변경 후 편심·간섭도 다시 검토하세요.` })
  return {
    available: true, cog, groups, apexes, hull, planeZ, nominal, worst, corners: toleranceValid ? corners : [],
    tiltDeg, heightMm: heightValid ? h : null, minAngle, nearBoundary, direction, actions,
    source: actual ? '엔진 정점 · 현재 배치 일치' : mode === 'goliat' ? '그룹 중심 미리보기 · Trolley 분할 미반영' : '그룹 중심 미리보기',
    caution: actions.length > 0 || (tiltDeg !== null && tiltDeg >= 1),
    toleranceApplied: !!toleranceValid,
  }
}
