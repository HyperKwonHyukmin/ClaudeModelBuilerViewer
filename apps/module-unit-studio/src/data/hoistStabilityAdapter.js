/**
 * 단일 레이아웃 자세안정성 리포트(runStabilityAnalysis)를 hoistCandidateRank 가 소비하는
 * 후보 형태로 변환한다. 옵티마이저(--optimize) 리포트와 키 형태가 달라(스테이지별 summary vs
 * 집계 metrics) 별도 어댑터가 필요하다. camelCase/PascalCase 모두 대응.
 */

function pick(obj, ...keys) {
  if (!obj) return undefined
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k]
    const cap = k.charAt(0).toUpperCase() + k.slice(1)
    if (obj[cap] !== undefined) return obj[cap]
  }
  return undefined
}

function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null }
function statusRank(s) { return s === 'fail' ? 2 : s === 'warn' ? 1 : 0 }

/**
 * @param {object} report  runStabilityAnalysis 결과 객체
 * @param {{groups:number[][], label?:string, score?:number, pointsPerGroup?:number}} ctx
 * @returns {object}  normalizeCandidate 호환 후보
 */
export function adaptStabilityReportToCandidate(report, ctx) {
  const stages = pick(report, 'stages') ?? []
  const byId = new Map()
  for (const st of stages) byId.set(Number(pick(st, 'id')), st)
  const s4 = byId.get(4), s5 = byId.get(5), s6 = byId.get(6)
  const sum = (st) => pick(st, 'summary') ?? {}

  let overall = pick(pick(report, 'overall') ?? {}, 'status')
  if (!overall) {
    let worst = 'pass'
    for (const st of stages) {
      const s = pick(st, 'status')
      if (s && statusRank(s) > statusRank(worst)) worst = s
    }
    overall = stages.length > 0 ? worst : 'unknown'
  }

  const failedStages = []
  for (const st of stages) {
    if (pick(st, 'status') === 'fail') failedStages.push(Number(pick(st, 'id')))
  }

  return {
    label: ctx?.label ?? `구역 ${ctx?.groups?.length ?? 0}그룹 · ${ctx?.pointsPerGroup ?? (ctx?.groups?.reduce((n, g) => n + (g?.length ?? 0), 0) || '?')}점`,
    score: Number.isFinite(Number(ctx?.score)) ? Number(ctx.score) : 0,
    overallStatus: overall,
    groupCount: ctx?.groups?.length ?? 0,
    groups: (ctx?.groups ?? []).map(ids => ({ nodeIds: [...ids] })),
    metrics: {
      stage6Status: pick(s6, 'status') ?? null,
      evaluationMode: pick(sum(s6), 'evaluationMode') ?? null,
      stage6MarginMm: numOrNull(pick(sum(s6), 'marginMm')),
      stage6DeviationMm: numOrNull(pick(sum(s6), 'deviationMm')),
      minSlingAngleDeg: numOrNull(pick(sum(s4), 'minAngleDeg')),
      wireConflictCount: Number.isFinite(Number(pick(sum(s5), 'conflictCount'))) ? Number(pick(sum(s5), 'conflictCount')) : 0,
      failedStages,
    },
  }
}
