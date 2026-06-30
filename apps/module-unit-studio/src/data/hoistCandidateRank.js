/**
 * ModuleAnalysis.Cli --optimize 가 돌려준 자세안정성 평가 후보들을
 * 병합·중복제거·랭킹하는 순수 함수 모음. (네트워크/스토어 의존 없음 → 단위테스트 용이)
 *
 * 랭킹 우선순위: PASS > WARN > FAIL → Stage6 여유(margin) 큰 순 → 그룹 수 적은 순 → score 큰 순.
 */

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
  const groups = rawGroups.map(g => ({ nodeIds: [...(pick(g, 'nodeIds') ?? [])] }))
  const rawGroupCount = pick(c, 'groupCount')
  return {
    label: pick(c, 'label') ?? '',
    score: numOrNull(pick(c, 'score')) ?? 0,
    overallStatus: pick(c, 'overallStatus') ?? 'unknown',
    groupCount: Number.isFinite(Number(rawGroupCount)) ? Number(rawGroupCount) : groups.length,
    groups,
    metrics: {
      stage6Status: pick(m, 'stage6Status') ?? null,
      evaluationMode: pick(m, 'evaluationMode') ?? null,
      stage6MarginMm: numOrNull(pick(m, 'stage6MarginMm')),
      stage6DeviationMm: numOrNull(pick(m, 'stage6DeviationMm')),
      minSlingAngleDeg: numOrNull(pick(m, 'minSlingAngleDeg')),
      wireConflictCount: Number.isFinite(Number(pick(m, 'wireConflictCount'))) ? Number(pick(m, 'wireConflictCount')) : 0,
      failedStages: Array.isArray(pick(m, 'failedStages')) ? pick(m, 'failedStages') : [],
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

function statusRank(s) { return s === 'pass' ? 0 : s === 'warn' ? 1 : 2 }

/** 정렬 비교자 — 음수면 a 가 앞. */
export function compareCandidates(a, b) {
  const sr = statusRank(a.overallStatus) - statusRank(b.overallStatus)
  if (sr !== 0) return sr
  const ma = a.metrics.stage6MarginMm ?? -Infinity
  const mb = b.metrics.stage6MarginMm ?? -Infinity
  if (mb !== ma) return mb - ma
  if (a.groupCount !== b.groupCount) return a.groupCount - b.groupCount
  return (b.score ?? 0) - (a.score ?? 0)
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
  return [...bySig.values()]
    .sort(compareCandidates)
    .map((c, i) => ({ ...c, id: `${i}-${candidateSignature(c)}` }))
}

/** 후보 → applyAutoHoistGroups 가 받는 nodeGroups (빈 그룹 제외). */
export function toNodeGroups(candidate) {
  return (candidate?.groups ?? [])
    .map(g => [...(g.nodeIds ?? [])])
    .filter(ids => ids.length > 0)
}
