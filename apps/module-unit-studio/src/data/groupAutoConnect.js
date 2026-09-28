/**
 * groupAutoConnect — 분리된 연결 그룹(소그룹)을 주 구조에 잇는 RBE2 후보를 계산하는 순수 함수.
 *
 * 배경(2026-09-11, 3454-35020 실측): Model Builder 산출 모델은 주 구조 9,656 요소 + 소그룹 5개
 * (131·128·78·26·8)처럼 **큰 그룹 하나와 작은 조각 몇 개**로 갈라진다. Model Check 는 색으로
 * 보여 주기만 하고 잇는 수단은 Edit 탭의 수동 RBE 뿐이었다.
 *
 * 규칙(설계 문서 §C, 사용자 결정):
 *   · 주 구조 = 요소 수 최대 그룹. 나머지 = 소그룹. 그룹이 1개면 할 일 없음.
 *   · 연결 방향 = 소그룹 → 주 구조. RBE2 독립(indep) = 주 구조 노드, 종속(dep) = 소그룹 노드.
 *   · 타깃 = 주 구조의 **Structure 카테고리 부재 노드**만 (배관 노드에 묶으면 배관이 하중을 받는다).
 *   · 후보 범위(2026-09-11 3차, 사용자 요청): 소스는 소그룹의 **자유단(Free) 노드**만 —
 *     부재 하나에만 붙은 끝점이다(`freeOnly` 기본 true). 소그룹의 '모든' 노드를 이으면 중간 노드까지
 *     주 구조에 매달려 실제 연결 의도(끝이 닿아 있는 곳을 잇는다)와 어긋난다.
 *     타깃은 주 구조의 Structure 부재 노드(Free·Shared 모두) 중 최근접.
 *     자유단마다 1건씩 제안한다(`perNode` 기본 true). 예전 규칙(축방향 프레임마다 1쌍)은
 *     `perNode:false` 로 남겨 두어 "요약"이 필요할 때 쓴다.
 *   · 타깃이 이미 어떤 RBE 의 종속이면 그 RBE 의 독립노드로 대체(종속 중복 FATAL 방지). 체인이면 제외.
 *   · 이미 RBE 에 속한 소그룹 노드는 건너뛴다. 같은 소그룹 노드는 1건만.
 *
 * Side Passage 의 hbeamAutoConnect.js 골격(공간해시·스테이션 클러스터·RBE 대체)을 그대로 쓴다.
 * Three/React 의존 없음 — vitest 로 검증한다.
 */

export const GROUP_AUTO_DEFAULTS = Object.freeze({
  radiusMm: 450,        // 소그룹 노드 주변 주 구조 노드 탐색 반경
  radiusMinMm: 100,     // UI 입력 하한
  radiusMaxMm: 2000,    // UI 입력 상한
  stationGapMm: 500,    // 타깃 축방향 간격이 이 값을 넘으면 다른 프레임 (perNode:false 에서만 사용)
  perNode: true,        // true = 후보 노드마다 1건 / false = 프레임당 1건
  freeOnly: true,       // true = 소그룹의 자유단(부재 1개에만 붙은 끝점)만 소스로 / false = 모든 노드
  cm: '123456',
  remark: 'AUTOCONNECT',
})

/** skipped.reason → 화면 라벨 */
export const GROUP_SKIP_LABEL = Object.freeze({
  'in-rbe':                 '이미 RBE 에 속함',
  'no-structure-in-radius': '반경 안 주 구조 노드 없음',
  'station-covered':        '같은 프레임의 다른 노드가 선택됨',
  'no-usable-target':       '반경 안 구조 노드가 모두 기존 RBE 에 묶여 있음',
  'not-free-node':          '자유단(Free) 노드가 아님 — 소그룹 내부 노드',
})

const emptyResult = () => ({ proposals: [], skipped: [], groups: [], mainGroupId: null, warnings: [] })

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function isFiniteNode(n) {
  return !!n && Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)
}

/**
 * @param {import('./StageData.js').StageData} stageData
 * @param {{ radiusMm?: number, stationGapMm?: number, perNode?: boolean, freeOnly?: boolean,
 *           existingIntents?: Array<{kind:string, params?:object}> }} [opts]
 * @returns {{
 *   proposals: Array<{
 *     srcNode:number, tgtNode:number, distMm:number,
 *     alongMm:number,      // 타깃 노드의 소그룹 축방향 위치(mm)
 *     groupId:number, groupIndex:number,
 *     tgtKind:string, tgtElemId:number|null, replacedFrom:number|null,
 *     disabled?:boolean — UI 가 체크 해제한 후보에 붙이는 표시(플래너는 만들지 않음)
 *   }>,
 *   skipped:   Array<{ groupId:number, srcNode:number, reason:string }>,
 *   groups:    Array<{ id:number, index:number, nodeCount:number, elementCount:number, stationCount:number }>,
 *   mainGroupId: number|null,
 *   warnings:  string[],
 * }}
 */
export function planGroupConnections(stageData, opts = {}) {
  const out = emptyResult()
  if (!stageData?.nodeMap || stageData.nodeMap.size === 0) return out
  const num = (v, dflt) => (typeof v !== 'boolean' && Number(v) > 0 ? Number(v) : dflt)
  const radiusMm = num(opts.radiusMm, GROUP_AUTO_DEFAULTS.radiusMm)
  const stationGapMm = num(opts.stationGapMm, GROUP_AUTO_DEFAULTS.stationGapMm)
  const perNode = opts.perNode !== false
  const freeOnly = opts.freeOnly !== false
  const nodeMap = stageData.nodeMap
  const propOf = (pid) => stageData.propertyMap?.get(pid)

  // ── ① 그룹 분류 — 주 구조(요소 수 최대) vs 소그룹 ────────────────────────
  const allGroups = (stageData.finalGroups ?? stageData.groups ?? [])
    .filter(g => Array.isArray(g?.nodeIds) && Array.isArray(g?.elementIds))
  if (allGroups.length < 2) return out

  let mainIdx = 0
  for (let i = 1; i < allGroups.length; i++) {
    if (allGroups[i].elementIds.length > allGroups[mainIdx].elementIds.length) mainIdx = i
  }
  const main = allGroups[mainIdx]
  out.mainGroupId = main.id
  const mainElemSet = new Set(main.elementIds)

  // ── ② 부재 인덱스 ────────────────────────────────────────────────────────
  const elements = (stageData.elements ?? []).filter(e =>
    e.type === 'BEAM' && e.startNode != null && e.endNode != null &&
    nodeMap.has(e.startNode) && nodeMap.has(e.endNode) &&
    isFiniteNode(nodeMap.get(e.startNode)) && isFiniteNode(nodeMap.get(e.endNode)))
  const dropped = (stageData.elements ?? []).filter(e => e.type === 'BEAM').length - elements.length
  if (dropped > 0) {
    out.warnings.push(`좌표가 없거나 유효하지 않은 노드를 참조하는 부재 ${dropped}개를 제외했습니다.`)
  }

  // 주 구조의 Structure 노드 → 대표 부재(첫 등장 요소). 배관(category 'Pipe')은 타깃에서 제외.
  const structNode = new Map()
  let mainHasStructure = false
  for (const e of elements) {
    if (!mainElemSet.has(e.id)) continue
    if (e.category === 'Pipe') continue
    mainHasStructure = true
    const kind = propOf(e.propertyId)?.kind ?? '?'
    if (!structNode.has(e.startNode)) structNode.set(e.startNode, { elemId: e.id, kind })
    if (!structNode.has(e.endNode))   structNode.set(e.endNode,   { elemId: e.id, kind })
  }
  if (!mainHasStructure) {
    out.warnings.push('주 구조에 Structure 부재가 없어 연결할 타깃이 없습니다(배관만 있는 그룹).')
    return out
  }

  // 요소별 양 끝 노드 차수 — 소그룹 축 계산(끝점 판정)에 쓴다.
  const elemById = new Map(elements.map(e => [e.id, e]))

  // ── ③ RBE 점유 — 원본 rigids + 이미 추가된 addRigid intent(재실행 중복 방지) ──
  const dependentSet = new Set()
  const indepOf = new Map()       // 종속노드 → 그 RBE 의 독립노드
  const rbeNodeSet = new Set()
  const registerRigid = (indep, deps) => {
    if (indep != null) rbeNodeSet.add(indep)
    for (const d of deps ?? []) {
      if (d == null) continue
      dependentSet.add(d); rbeNodeSet.add(d)
      if (indep != null && !indepOf.has(d)) indepOf.set(d, indep)
    }
  }
  for (const r of stageData.rigids ?? []) registerRigid(r.independentNode ?? null, r.dependentNodes)
  for (const it of opts.existingIntents ?? []) {
    if (it?.kind !== 'addRigid') continue
    registerRigid(it.params?.independentNode ?? null, it.params?.dependentNodes)
  }
  // 종속의 종속(체인) — 대체 독립노드 자체가 다시 다른 RBE 의 종속이면 둘 다 사용 불가.
  const chainBlocked = new Set()
  for (const [dep, indep] of indepOf) {
    if (dependentSet.has(indep)) { chainBlocked.add(dep); chainBlocked.add(indep) }
  }

  // ── ④ 주 구조 노드 공간 해시 (셀 = 반경, 27 이웃) ─────────────────────────
  const cell = radiusMm
  const key = (ix, iy, iz) => `${ix}|${iy}|${iz}`
  const grid = new Map()
  for (const id of structNode.keys()) {
    const p = nodeMap.get(id)
    if (!p) continue
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell))
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(id)
  }
  const structNear = (p) => {
    const ix = Math.floor(p.x / cell), iy = Math.floor(p.y / cell), iz = Math.floor(p.z / cell)
    const found = []
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(key(ix + dx, iy + dy, iz + dz))
      if (!bucket) continue
      for (const id of bucket) {
        const d = dist3(p, nodeMap.get(id))
        if (d <= radiusMm) found.push({ tgtNode: id, dist: d })
      }
    }
    return found
  }

  // ── ⑤ 소그룹별: 축 → 후보 → 스테이션 클러스터 → 프레임당 1쌍 ──────────────
  allGroups.forEach((g, groupIndex) => {
    if (groupIndex === mainIdx) return
    const nodeIds = g.nodeIds.filter(id => isFiniteNode(nodeMap.get(id)))
    if (nodeIds.length === 0) {
      out.groups.push({ id: g.id, index: groupIndex, nodeCount: 0, elementCount: g.elementIds.length, stationCount: 0 })
      return
    }
    const pts = nodeIds.map(id => ({ id, p: nodeMap.get(id) }))

    // 축: 이 그룹 요소로 계산한 차수 1 끝점이 정확히 2개면 그 벡터, 아니면 bbox 최장축
    const degree = new Map()
    for (const eid of g.elementIds) {
      const e = elemById.get(eid)
      if (!e) continue
      degree.set(e.startNode, (degree.get(e.startNode) ?? 0) + 1)
      degree.set(e.endNode,   (degree.get(e.endNode)   ?? 0) + 1)
    }
    const ends = nodeIds.filter(id => degree.get(id) === 1)
    let origin, axis
    if (ends.length === 2) {
      const A = nodeMap.get(ends[0]), B = nodeMap.get(ends[1])
      const v = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z }
      const L = Math.hypot(v.x, v.y, v.z) || 1
      origin = A; axis = { x: v.x / L, y: v.y / L, z: v.z / L }
    } else {
      const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
      for (const { p } of pts) for (const k of ['x', 'y', 'z']) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]) }
      const ext = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }
      const k = ext.x >= ext.y && ext.x >= ext.z ? 'x' : ext.y >= ext.z ? 'y' : 'z'
      origin = min; axis = { x: k === 'x' ? 1 : 0, y: k === 'y' ? 1 : 0, z: k === 'z' ? 1 : 0 }
    }
    const along = (p) => (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y + (p.z - origin.z) * axis.z

    // 소스 = 소그룹의 자유단(Free) 노드 — 이 그룹 부재를 1개(또는 0개)만 참조하는 끝점.
    // 내부 노드(2개 이상 참조)는 이미 양쪽이 붙어 있어 주 구조에 또 매달 이유가 없다.
    // 닫힌 고리처럼 자유단이 하나도 없으면 모든 노드로 폴백한다(연결 수단이 아예 없어지지 않게).
    let srcSet = new Set(nodeIds)
    if (freeOnly) {
      const frees = nodeIds.filter(id => (degree.get(id) ?? 0) <= 1)
      if (frees.length > 0) srcSet = new Set(frees)
      else out.warnings.push(`그룹 ${groupIndex + 1}: 자유단(Free) 노드가 없어 모든 노드를 후보로 봅니다.`)
    }

    // 후보 수집 — tAlong = 타깃 노드의 축방향 위치(스테이션 클러스터링 기준), sAlong = 소그룹 노드 자신(동률 타이브레이크)
    const candidates = []
    const candidateSrc = new Set()
    for (const { id, p } of pts) {
      if (!srcSet.has(id)) { out.skipped.push({ groupId: g.id, srcNode: id, reason: 'not-free-node' }); continue }
      if (rbeNodeSet.has(id)) { out.skipped.push({ groupId: g.id, srcNode: id, reason: 'in-rbe' }); continue }
      const near = structNear(p)
      if (near.length === 0) { out.skipped.push({ groupId: g.id, srcNode: id, reason: 'no-structure-in-radius' }); continue }
      const sAlong = along(p)
      for (const c of near) candidates.push({ srcNode: id, tgtNode: c.tgtNode, dist: c.dist, tAlong: along(nodeMap.get(c.tgtNode)), sAlong })
      candidateSrc.add(id)
    }

    // 타깃 해석 — 기존 RBE 종속이면 그 RBE 의 독립노드로 대체, 체인이면 사용 불가(null)
    const resolveTarget = (c) => {
      let tgtNode = c.tgtNode, dist = c.dist, replacedFrom = null
      if (dependentSet.has(tgtNode)) {
        if (chainBlocked.has(tgtNode)) return null
        const alt = indepOf.get(tgtNode)
        if (alt == null || !nodeMap.has(alt)) return null
        if (!structNode.has(alt)) return null   // 대체 독립노드가 주 구조 Structure 노드가 아니면 쓰지 않는다
        replacedFrom = tgtNode
        tgtNode = alt
        dist = dist3(nodeMap.get(c.srcNode), nodeMap.get(alt))
      }
      return { tgtNode, dist, replacedFrom }
    }

    const chosenSrc = new Set()
    let stationCount = 0
    const emit = (c, r) => {
      const info = structNode.get(r.tgtNode)
      out.proposals.push({
        srcNode: c.srcNode, tgtNode: r.tgtNode, distMm: r.dist, alongMm: c.tAlong,
        groupId: g.id, groupIndex,
        tgtKind: info?.kind ?? '?', tgtElemId: info?.elemId ?? null, replacedFrom: r.replacedFrom,
      })
      chosenSrc.add(c.srcNode)
      stationCount++
    }

    const sawSuccessfulCluster = new Set()
    if (perNode) {
      // ── 기본: 연결 가능한 소그룹 노드마다 최근접 타깃 1개 ──
      // 같은 주 구조 노드가 여러 제안의 타깃이 되는 것은 안전하다 — 타깃은 RBE2 의 **독립**노드이고,
      // FATAL 이 나는 것은 한 노드가 두 RBE 의 **종속**이 될 때다. 종속(소그룹 노드)은 1건뿐이다.
      const bySrc = new Map()
      for (const c of candidates) {
        let list = bySrc.get(c.srcNode)
        if (!list) { list = []; bySrc.set(c.srcNode, list) }
        list.push(c)
      }
      const srcOrder = [...bySrc.keys()].sort((a, b) => bySrc.get(a)[0].sAlong - bySrc.get(b)[0].sAlong || a - b)
      for (const srcId of srcOrder) {
        const list = bySrc.get(srcId).sort((x, y) => x.dist - y.dist || x.tgtNode - y.tgtNode)
        for (const c of list) {
          const r = resolveTarget(c)
          if (r) { emit(c, r); break }
        }
      }
    } else {
      // ── 요약 모드: 스테이션 클러스터링 — 타깃의 축방향 위치 기준(간격 > stationGapMm 이면 새 프레임) ──
      candidates.sort((a, b) => a.tAlong - b.tAlong || a.dist - b.dist)
      const clusters = []
      for (const c of candidates) {
        const last = clusters[clusters.length - 1]
        if (!last || c.tAlong - last[last.length - 1].tAlong > stationGapMm) clusters.push([c])
        else last.push(c)
      }
      // 프레임마다 가장 가까운 1쌍
      for (const cluster of clusters) {
        cluster.sort((a, b) => a.dist - b.dist || a.sAlong - b.sAlong)
        let clusterSucceeded = false
        for (const c of cluster) {
          if (chosenSrc.has(c.srcNode)) continue   // 같은 소그룹 노드는 1건만
          const r = resolveTarget(c)
          if (!r) continue
          emit(c, r)
          clusterSucceeded = true
          break
        }
        if (clusterSucceeded) for (const c of cluster) sawSuccessfulCluster.add(c.srcNode)
      }
    }

    for (const id of candidateSrc) {
      if (chosenSrc.has(id)) continue
      out.skipped.push({ groupId: g.id, srcNode: id, reason: sawSuccessfulCluster.has(id) ? 'station-covered' : 'no-usable-target' })
    }
    out.groups.push({ id: g.id, index: groupIndex, nodeCount: nodeIds.length, elementCount: g.elementIds.length, stationCount })
  })

  out.proposals.sort((a, b) => a.groupIndex - b.groupIndex || a.alongMm - b.alongMm || a.srcNode - b.srcNode)
  out.skipped.sort((a, b) => a.groupId - b.groupId || a.srcNode - b.srcNode)
  return out
}
