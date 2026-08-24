/**
 * ModuleAnalysis.Cli --optimize 가 돌려준 자세안정성 평가 후보들을
 * 병합·중복제거·랭킹하는 순수 함수 모음. (네트워크/스토어 의존 없음 → 단위테스트 용이)
 *
 * 랭킹 우선순위(사용자 규칙 2026-07-03): PASS > WARN > FAIL
 *   → 엔진 score 큰 순(지지폭·면적·반듯함(축평행 직사각형/긴 축평행 직선)·2구역 축정렬을 엔진이 합산)
 *   → 면적 큰 순 → 정사각형도 높은 순 → Stage6 여유 큰 순 → 그룹 수 적은 순.
 */

import { candidateFootprint } from './hoistCandidateShape.js'

function numOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pick(obj, ...keys) {
  if (!obj) return undefined
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key]
    const cap = key.charAt(0).toUpperCase() + key.slice(1)
    if (obj[cap] !== undefined) return obj[cap]
  }
  return undefined
}

/** report 의 한 평가 객체를 안전한 표준 형태로 정규화한다. */
export function normalizeCandidate(c) {
  const m = pick(c, 'metrics') ?? {}
  const rawGroups = pick(c, 'groups') ?? []
  // 노드 좌표(x,y,z)를 보존한다 — 썸네일·형상 지표(면적/정사각형도/축정렬) 계산에 필요.
  const groups = rawGroups.map(g => ({
    nodeIds: [...(pick(g, 'nodeIds') ?? [])],
    nodes: (pick(g, 'nodes') ?? []).map(n => ({
      id: pick(n, 'id'),
      x: numOrNull(pick(n, 'x')),
      y: numOrNull(pick(n, 'y')),
      z: numOrNull(pick(n, 'z')),
    })),
  }))
  const rawGroupCount = pick(c, 'groupCount')
  return {
    label: pick(c, 'label') ?? '',
    score: numOrNull(pick(c, 'score')) ?? 0,
    overallStatus: pick(c, 'overallStatus') ?? 'unknown',
    groupCount: Number.isFinite(Number(rawGroupCount)) ? Number(rawGroupCount) : groups.length,
    groups,
    footprint: candidateFootprint({ groups }),
    metrics: {
      stage6Status: pick(m, 'stage6Status') ?? null,
      evaluationMode: pick(m, 'evaluationMode') ?? null,
      stage6MarginMm: numOrNull(pick(m, 'stage6MarginMm')),
      stage6DeviationMm: numOrNull(pick(m, 'stage6DeviationMm')),
      minSlingAngleDeg: numOrNull(pick(m, 'minSlingAngleDeg')),
      wireConflictCount: Number.isFinite(Number(pick(m, 'wireConflictCount'))) ? Number(pick(m, 'wireConflictCount')) : 0,
      failedStages: Array.isArray(pick(m, 'failedStages')) ? pick(m, 'failedStages') : [],
      // 전체 지지기반 폭(모델 대비 min(양축) 분율) + '좁음' 플래그 — 좁은 권상 배치 경고/필터용.
      supportSpanFraction: numOrNull(pick(m, 'supportSpanFraction')),
      supportSpanNarrow: pick(m, 'supportSpanNarrow') === true,
      // 그룹 단위 좁음(가장 좁은 그룹의 구역 대비 폭 분율) — 점 같은 2점 직선/작은 사각형 필터용.
      groupSpanFraction: numOrNull(pick(m, 'groupSpanFraction')),
      groupSpanNarrow: pick(m, 'groupSpanNarrow') === true,
    },
  }
}

/** 노드/그룹 순서에 불변인 시그니처 (중복제거 키). */
export function candidateSignature(c) {
  return (c?.groups ?? [])
    .map(g => [...(g?.nodeIds ?? [])].map(Number).sort((a, b) => a - b).join('-'))
    .sort()
    .join('|')
}

// ── 형태 근접(near-duplicate) 후보 제거 ─────────────────────────────────────
// 노드 몇 개만 다르고 위치·형상이 사실상 같은 후보가 여러 개 나오면 목록이 단조로워진다.
// 사용자가 "다양한 형태" 중에서 고르도록, 위치(그룹 centroid)와 형상(면적/정사각형도/축편차)이
// 모두 근접한 후보는 하나(랭킹 최상)만 남긴다. 일직선 vs 사각형, 회전/크기/위치가 다르면 유지된다.

/** 각 그룹의 XY centroid 목록(면적>0 무관). 좌표 없는 그룹은 제외. */
function groupCentroids(c) {
  return (c?.groups ?? []).map(g => {
    const pts = (g?.nodes ?? []).filter(n => Number.isFinite(n.x) && Number.isFinite(n.y))
    if (pts.length === 0) return null
    return { x: pts.reduce((s, n) => s + n.x, 0) / pts.length, y: pts.reduce((s, n) => s + n.y, 0) / pts.length }
  }).filter(Boolean)
}

/** 두 후보의 그룹 배치가 tolMm 이내로 일대일(greedy) 매칭되는지. */
function centroidsMatch(a, b, tolMm) {
  const A = groupCentroids(a), B = groupCentroids(b)
  if (A.length === 0 || A.length !== B.length) return false
  const used = new Array(B.length).fill(false)
  for (const pa of A) {
    let bi = -1, bd = Infinity
    for (let j = 0; j < B.length; j++) {
      if (used[j]) continue
      const d = Math.hypot(pa.x - B[j].x, pa.y - B[j].y)
      if (d < bd) { bd = d; bi = j }
    }
    if (bi < 0 || bd > tolMm) return false
    used[bi] = true
  }
  return true
}

/** 두 후보가 위치·형태가 거의 같은가 — centroid 근접 + 면적/정사각형도/축편차 근접. */
export function isSimilarShape(a, b, tolMm) {
  if (a.groupCount !== b.groupCount) return false
  if (!centroidsMatch(a, b, tolMm)) return false
  const fa = a.footprint ?? {}, fb = b.footprint ?? {}
  const areaMax = Math.max(fa.areaMm2 ?? 0, fb.areaMm2 ?? 0, 1)
  if (Math.abs((fa.areaMm2 ?? 0) - (fb.areaMm2 ?? 0)) / areaMax > 0.15) return false   // 면적 15% 이내
  if (Math.abs((fa.minSquareness ?? 0) - (fb.minSquareness ?? 0)) > 0.15) return false // 일직선↔사각형 구분 보존
  if (Math.abs((fa.maxAxisDevDeg ?? 0) - (fb.maxAxisDevDeg ?? 0)) > 12) return false    // 회전(축정렬) 구분 보존
  return true
}

/** 후보 centroid 분포의 대각선 × 6%(최소 300mm) — 위치 근접 허용오차. */
export function shapeToleranceMm(cands) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of cands ?? []) for (const g of groupCentroids(c)) {
    if (g.x < minX) minX = g.x; if (g.x > maxX) maxX = g.x
    if (g.y < minY) minY = g.y; if (g.y > maxY) maxY = g.y
  }
  if (!Number.isFinite(minX)) return 300
  return Math.max(300, Math.hypot(maxX - minX, maxY - minY) * 0.06)
}

/** 정렬된(랭킹 순) 후보에서 형태 근접 후보를 제거한다. 각 형태군의 최상위만 남긴다. */
export function dedupeSimilarCandidates(sorted, tolMm) {
  const kept = []
  for (const c of sorted ?? []) {
    if (kept.some(k => isSimilarShape(k, c, tolMm))) continue
    kept.push(c)
  }
  return kept
}

function statusRank(s) { return s === 'pass' ? 0 : s === 'warn' ? 1 : 2 }

/** 정렬 비교자 — 음수면 a 가 앞. 사용자 규칙(2026-07-03): 반듯·넓음을 합산한 엔진 score 우선. */
export function compareCandidates(a, b) {
  const sr = statusRank(a.overallStatus) - statusRank(b.overallStatus)
  if (sr !== 0) return sr
  // 엔진 score 큰 순 (최우선) — 지지폭·면적·반듯함(축평행 직사각형/긴 축평행 직선)·축정렬 합산치.
  const as = a.score ?? 0, bs = b.score ?? 0
  if (bs !== as) return bs - as
  // 면적 큰 순
  const aa = a.footprint?.areaMm2 ?? 0, ba = b.footprint?.areaMm2 ?? 0
  if (ba !== aa) return ba - aa
  // 정사각형도 높은 순
  const asq = a.footprint?.minSquareness ?? 0, bsq = b.footprint?.minSquareness ?? 0
  if (bsq !== asq) return bsq - asq
  // Stage6 여유 큰 순
  const ma = a.metrics.stage6MarginMm ?? -Infinity
  const mb = b.metrics.stage6MarginMm ?? -Infinity
  if (mb !== ma) return mb - ma
  // 그룹 수 적은 순
  return a.groupCount - b.groupCount
}

/** 여러 report 의 best+candidates 를 병합·중복제거·정렬하고 안정적인 id 를 부여한다. */
export function rankHoistCandidates(reports) {
  const all = []
  for (const rep of reports ?? []) {
    if (!rep) continue
    const best = pick(rep, 'best')
    if (best) all.push(normalizeCandidate(best))
    for (const c of pick(rep, 'candidates') ?? []) all.push(normalizeCandidate(c))
  }
  const bySig = new Map()
  for (const c of all) {
    if (c.groups.length === 0) continue
    const sig = candidateSignature(c)
    const prev = bySig.get(sig)
    if (!prev || compareCandidates(c, prev) < 0) bySig.set(sig, c)
  }
  const sorted = [...bySig.values()].sort(compareCandidates)
  // 형태 근접 후보 제거 — 위치·형상이 사실상 같은 후보는 최상위 하나만 남겨 목록을 다양화한다.
  const deduped = dedupeSimilarCandidates(sorted, shapeToleranceMm(sorted))
  return deduped.map((c, i) => ({ ...c, id: `${i}-${candidateSignature(c)}` }))
}

/** 후보 → applyAutoHoistGroups 가 받는 nodeGroups (빈 그룹 제외). */
export function toNodeGroups(candidate) {
  return (candidate?.groups ?? [])
    .map(g => [...(g.nodeIds ?? [])])
    .filter(ids => ids.length > 0)
}
