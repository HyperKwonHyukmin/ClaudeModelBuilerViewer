/**
 * 권상 후보 '추천 사유' 설명 생성 — 왜 이 위치가 뽑혔고 다른 형태는 왜 밀렸는지를
 * 후보의 실제 지표(자세안정성·권상폭·형상 반듯함·여유·간섭)에서 사람이 읽을 문장으로 만든다.
 * (네트워크/스토어 의존 없는 순수 함수 → 단위테스트 용이. 엔진 랭킹과 정직하게 일치.)
 *
 * 엔진 랭킹(HoistPositionOptimizer)의 실제 순위 근거:
 *   score = 계층(PASS 100만/WARN 50만/FAIL 0)
 *         + LayoutFootprintScore(반듯함·권상폭·2구역 축정렬, ±24만으로 계층 내에서만 순위 가름)
 *         + 여유(margin)×10 + 슬링각×10 (동률 tie-break 수준)
 *   → 계층 안에서는 '반듯함(축평행 직사각형·긴 축평행 직선)·넓은 권상폭'이 순위를 지배한다.
 *   간섭(Stage5)은 경고만 — 점수에 넣지 않는다(사용자 규칙 2026-07-03).
 */

// UI 배지와 동일한 '좋음' 임계값 — 설명이 배지 색과 어긋나지 않게 공유한다.
const SQUARE_GOOD = 0.55   // 정사각형도
const SIDEEQ_GOOD = 0.85   // 대변비(마주보는 변 길이 비율)
const AXISDEV_GOOD = 20    // 축정렬 편차(도)
const LINE_AXIS_GOOD = 12  // 직선이 '축평행'이라 부를 편차 상한(도)

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`
const fmtMm = (v) => (v == null ? '–' : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(2)}m` : `${Math.round(v)}mm`)
const fmtM2 = (mm2) => `${((mm2 ?? 0) / 1e6).toFixed(1)}㎡`
const statusScore = (s) => (s === 'pass' ? 2 : s === 'warn' ? 1 : 0)

/**
 * 후보의 '반듯함' 종합 척도 ∈ [0,1] — 비교(어느 후보가 더 반듯한가)에 쓴다.
 * 사각형이 있으면 정사각형도·대변비·축정렬 평균, 없으면(직선/삼각형) 축정렬만.
 */
export function neatness(c) {
  const fp = c?.footprint ?? {}
  const axisAlign = 1 - Math.min(45, fp.maxAxisDevDeg ?? 0) / 45
  if (fp.minSideEquality != null) {
    return ((fp.minSquareness ?? 0) + fp.minSideEquality + axisAlign) / 3
  }
  return axisAlign
}

/** footprint 그룹 하나를 한국어 한 조각으로 — "Y축 평행 10.9m 직선", "반듯한 14×18m 사각형". */
export function describeGroupShape(gp) {
  const pts = gp?.ptsXY ?? []
  const n = pts.length
  if (n === 2) {
    const len = (gp.lineLenMm ?? 0) / 1000
    const dx = Math.abs(pts[1].x - pts[0].x)
    const dy = Math.abs(pts[1].y - pts[0].y)
    const dev = gp.axisDevDeg ?? 0
    let dir
    if (dev <= LINE_AXIS_GOOD) dir = dy >= dx ? 'Y축 평행 ' : 'X축 평행 '
    else if (dev >= 33) dir = '대각 '
    else dir = '비스듬한 '
    return `${dir}${len.toFixed(1)}m 직선`
  }
  if (n === 3) {
    return (gp.axisDevDeg ?? 0) <= AXISDEV_GOOD ? '축평행 삼각형' : '삼각형'
  }
  if (n === 4) {
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    const ex = (Math.max(...xs) - Math.min(...xs)) / 1000
    const ey = (Math.max(...ys) - Math.min(...ys)) / 1000
    const neat = (gp.squareness ?? 0) >= SQUARE_GOOD && (gp.sideEquality ?? 0) >= SIDEEQ_GOOD && (gp.axisDevDeg ?? 99) <= AXISDEV_GOOD
    const prefix = neat ? '반듯한 ' : (gp.axisDevDeg ?? 0) > AXISDEV_GOOD ? '다소 기운 ' : ''
    return `${prefix}${ex.toFixed(0)}×${ey.toFixed(0)}m 사각형`
  }
  return `${n}점 그룹`
}

/** 후보 한 줄 요약 — "자세안정성 PASS · 반듯한 14×18m 사각형 + Y축 평행 10.9m 직선". */
export function buildHeadline(c) {
  const status = c?.overallStatus
  const statusText = status === 'pass' ? '자세안정성 PASS' : status === 'warn' ? '자세안정성 WARN' : '자세안정성 FAIL'
  const shapes = (c?.footprint?.groups ?? []).map(describeGroupShape)
  return shapes.length ? `${statusText} · ${shapes.join(' + ')}` : statusText
}

/** 채택 근거(강점) / 감점·주의(약점) 사유 목록을 지표에서 생성한다. */
function buildFactors(c) {
  const fp = c?.footprint ?? {}
  const m = c?.metrics ?? {}
  const strengths = []
  const cautions = []

  // ① 자세안정성 계층 — 순위의 최상위 기준.
  if (c?.overallStatus === 'pass') {
    strengths.push(m.stage6MarginMm != null
      ? `자세안정성 PASS — 무게중심이 권상점 다각형 안에 있고, 경계까지 여유 ${fmtMm(m.stage6MarginMm)}.`
      : '자세안정성 PASS — 무게중심이 권상점이 이루는 다각형 안에 있습니다.')
  } else if (c?.overallStatus === 'warn') {
    cautions.push('자세안정성 WARN — 통과하지만 여유가 작거나 참고 경고가 있어 PASS 후보보다 아래입니다.')
  } else {
    cautions.push('자세안정성 FAIL — 무게중심이 권상점 다각형을 벗어나 추천 대상이 아닙니다.')
  }

  // ② 권상폭(넓이) — 모델 대비 지지 기반 폭.
  if (m.supportSpanFraction != null) {
    if (m.supportSpanNarrow || m.groupSpanNarrow) {
      cautions.push(`권상폭 ${pct(m.supportSpanFraction)} — 모델 대비 좁게 몰려 있어 순위가 낮아졌습니다.`)
    } else {
      strengths.push(`권상폭 ${pct(m.supportSpanFraction)} — 권상점이 모델 전반에 넓게 퍼져 자세가 안정적입니다.`)
    }
  }

  // ③ 형상 반듯함 — 그룹별로 사각형/직선/삼각형을 구체적으로 설명.
  const groups = fp.groups ?? []
  groups.forEach((gp, i) => {
    const n = gp?.ptsXY?.length ?? 0
    const gl = groups.length > 1 ? `그룹 ${i + 1} ` : ''
    if (n === 4) {
      const sq = gp.squareness ?? 0
      const eq = gp.sideEquality ?? 1
      const dev = gp.axisDevDeg ?? 0
      if (sq >= SQUARE_GOOD && eq >= SIDEEQ_GOOD && dev <= AXISDEV_GOOD) {
        strengths.push(`${gl}반듯한 사각형 — 정사각형도 ${sq.toFixed(2)}, 대변비 ${eq.toFixed(2)}, 축정렬 ${Math.round(dev)}° (X/Y축 평행·직각에 가까움).`)
      } else {
        const issues = []
        if (eq < SIDEEQ_GOOD) issues.push(`마주보는 변 길이가 달라(대변비 ${eq.toFixed(2)})`)
        if (dev > AXISDEV_GOOD) issues.push(`축에서 ${Math.round(dev)}° 기울고`)
        if (sq < SQUARE_GOOD) issues.push(`정사각형도 ${sq.toFixed(2)}로 납작해`)
        cautions.push(`${gl}사각형이 완전히 반듯하진 않음 — ${issues.join(', ')} 반듯한 직사각형보다 약간 감점.`)
      }
    } else if (n === 2) {
      const dev = gp.axisDevDeg ?? 0
      const len = (gp.lineLenMm ?? 0) / 1000
      if (dev <= LINE_AXIS_GOOD) {
        strengths.push(`${gl}${describeGroupShape(gp)} — 축에서 ${Math.round(dev)}°로 X/Y축에 평행하고 충분히 깁니다.`)
      } else {
        cautions.push(`${gl}직선이 축에서 ${Math.round(dev)}° 기울어(${len.toFixed(1)}m) 대각에 가깝습니다 — 축평행 직선보다 감점.`)
      }
    } else if (n === 3) {
      strengths.push(`${gl}삼각형 3점 지지.`)
    }
  })

  // ④ 간섭 — 경고만, 순위 점수 미반영(사용자 규칙).
  if ((m.wireConflictCount ?? 0) > 0) {
    cautions.push(`와이어 간섭 ${m.wireConflictCount}건 — 참고 경고일 뿐 순위 점수에는 넣지 않았습니다(설치 시 확인 권장).`)
  }

  return { strengths, cautions }
}

/** 후보 a 가 기준 후보 ref 보다 나은/못한 차원 목록(명사구). */
function compareDims(a, ref) {
  const fa = a?.footprint ?? {}
  const fr = ref?.footprint ?? {}
  const ma = a?.metrics ?? {}
  const mr = ref?.metrics ?? {}
  const out = []

  const ds = statusScore(a?.overallStatus) - statusScore(ref?.overallStatus)
  if (ds !== 0) out.push({ better: ds > 0, nounBetter: '더 높은 자세안정성 계층', nounWorse: '더 낮은 자세안정성 계층' })

  const spa = ma.supportSpanFraction ?? 0
  const spr = mr.supportSpanFraction ?? 0
  if (Math.abs(spa - spr) >= 0.05) {
    out.push({ better: spa > spr, nounBetter: `더 넓은 권상폭(${pct(spa)}↔${pct(spr)})`, nounWorse: `더 좁은 권상폭(${pct(spa)}↔${pct(spr)})` })
  }

  const na = neatness(a)
  const nr = neatness(ref)
  if (Math.abs(na - nr) >= 0.05) out.push({ better: na > nr, nounBetter: '더 반듯한 형상', nounWorse: '덜 반듯한 형상' })

  const aa = fa.areaMm2 ?? 0
  const ar = fr.areaMm2 ?? 0
  if (Math.max(aa, ar, 1) > 0 && Math.abs(aa - ar) / Math.max(aa, ar, 1) >= 0.1) {
    out.push({ better: aa > ar, nounBetter: `더 큰 면적(${fmtM2(aa)}↔${fmtM2(ar)})`, nounWorse: `더 작은 면적(${fmtM2(aa)}↔${fmtM2(ar)})` })
  }

  const ga = ma.stage6MarginMm
  const gr = mr.stage6MarginMm
  if (ga != null && gr != null && Math.abs(ga - gr) >= 5) {
    out.push({ better: ga > gr, nounBetter: `더 큰 자세 여유(${fmtMm(ga)}↔${fmtMm(gr)})`, nounWorse: `더 작은 자세 여유(${fmtMm(ga)}↔${fmtMm(gr)})` })
  }
  return out
}

/**
 * 다른 형태 대비 왜 이 순위인가 — 1위는 차선 대비 우위를, 그 외는 1위 대비 열위(+있으면 우위)를 설명.
 * ranked = 추천(엔진 score) 순 후보 배열, index = 이 후보의 추천 순위(0-based).
 */
export function buildComparison(candidate, ranked, index) {
  if (!Array.isArray(ranked) || ranked.length < 2) return null
  const ref = index === 0 ? ranked[1] : ranked[0]
  if (!ref || ref === candidate) return null
  const dims = compareDims(candidate, ref)
  const better = dims.filter(d => d.better).map(d => d.nounBetter)
  const worse = dims.filter(d => !d.better).map(d => d.nounWorse)

  // '추천 순위' 기준 문구 — 표시 정렬을 바꿔도(면적순 등) 설명이 추천 순위를 가리킴을 분명히 한다.
  if (index === 0) {
    if (better.length === 0) return '추천 차선(2위)과 지표가 비슷하지만 미세한 종합 우위로 추천 최상위입니다.'
    return `추천 차선(2위)보다 ${better.slice(0, 2).join(', ')} 덕분에 추천 최상위입니다.`
  }
  let s = worse.length
    ? `추천 1위 대비 ${worse.slice(0, 2).join(', ')} 때문에 후순위입니다.`
    : '추천 1위와 근소한 차이로 후순위입니다.'
  if (better.length) s += ` (대신 ${better.slice(0, 1).join(', ')} 우위)`
  return s
}

/** 후보 하나의 전체 설명 { headline, strengths[], cautions[], comparison }. */
export function explainCandidate(candidate, ranked = [], index = 0) {
  const { strengths, cautions } = buildFactors(candidate)
  return {
    headline: buildHeadline(candidate),
    strengths,
    cautions,
    comparison: buildComparison(candidate, ranked, index),
  }
}

/** 목록 상단에 한 번 보여줄 '추천 기준' 안내(정적). */
export function rankingCriteria() {
  return [
    '① 자세안정성 우선 — 무게중심이 권상점 다각형 안에 있고(PASS) 경계까지 여유가 클수록 상위.',
    '② plan 뷰 반듯함 — X/Y축에 평행·직각인 사각형, 마주보는 변 길이가 같은(대변비↑) 사각형, 길고 축평행한 직선을 우대.',
    '③ 넓은 권상폭 — 권상점이 모델 전반에 퍼질수록 상위, 한쪽에 몰리면 후순위.',
    '제외 — 극단적 마름모·평행사변형·매우 납작한 사각형, 점에 가까운 직선은 후보에서 아예 걸러집니다.',
    '간섭(와이어) — 경고로만 표시하며 순위 점수에는 넣지 않습니다.',
  ]
}
