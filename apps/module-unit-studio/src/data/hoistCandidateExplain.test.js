import { describe, it, expect } from 'vitest'
import {
  describeGroupShape,
  buildHeadline,
  buildComparison,
  explainCandidate,
  neatness,
  rankingCriteria,
} from './hoistCandidateExplain.js'
import { normalizeCandidate } from './hoistCandidateRank.js'

// 원시 후보(raw) → 정규화(footprint 계산 포함)해서 실제 파이프라인과 동일한 입력으로 검증.
const mk = ({ status = 'pass', metrics = {}, groups = [] }) => normalizeCandidate({
  score: 1_000_000,
  overallStatus: status,
  groups: groups.map((pts, gi) => ({
    nodeIds: pts.map((_, i) => gi * 100 + i),
    nodes: pts.map(([x, y], i) => ({ id: gi * 100 + i, x, y, z: 5000 })),
  })),
  metrics,
})

const rect = (x0, y0, w, h) => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]
const line = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]]

describe('describeGroupShape', () => {
  it('축평행 직사각형은 "반듯한 W×Hm 사각형"', () => {
    const fp = mk({ groups: [rect(0, 0, 14000, 18000)] }).footprint
    expect(describeGroupShape(fp.groups[0])).toBe('반듯한 14×18m 사각형')
  })

  it('Y로 긴 축평행 직선은 "Y축 평행 …m 직선"', () => {
    const fp = mk({ groups: [line(5000, 0, 5000, 10900)] }).footprint
    expect(describeGroupShape(fp.groups[0])).toBe('Y축 평행 10.9m 직선')
  })

  it('45° 대각 직선은 "대각 …m 직선"', () => {
    const fp = mk({ groups: [line(0, 0, 5000, 5000)] }).footprint
    expect(describeGroupShape(fp.groups[0])).toMatch(/^대각 /)
  })

  it('기운 사각형은 "다소 기운 …사각형"', () => {
    // 전단 평행사변형 — 축정렬 편차가 커 "다소 기운" 접두.
    const fp = mk({ groups: [[[0, 0], [8000, 0], [12000, 6000], [4000, 6000]]] }).footprint
    expect(describeGroupShape(fp.groups[0])).toMatch(/다소 기운 .*사각형$/)
  })
})

describe('buildHeadline', () => {
  it('상태 + 그룹 형상 나열', () => {
    const c = mk({ status: 'pass', groups: [rect(0, 0, 14000, 18000), line(5000, 0, 5000, 10900)] })
    expect(buildHeadline(c)).toBe('자세안정성 PASS · 반듯한 14×18m 사각형 + Y축 평행 10.9m 직선')
  })
})

describe('explainCandidate — 강점/약점', () => {
  it('PASS·넓은폭·반듯한 사각형은 모두 강점으로 잡힌다', () => {
    const c = mk({
      status: 'pass',
      metrics: { stage6MarginMm: 334, supportSpanFraction: 0.78, supportSpanNarrow: false, wireConflictCount: 0 },
      groups: [rect(0, 0, 14000, 18000)],
    })
    const ex = explainCandidate(c, [c], 0)
    expect(ex.strengths.some(s => s.includes('PASS'))).toBe(true)
    expect(ex.strengths.some(s => s.includes('권상폭 78%'))).toBe(true)
    expect(ex.strengths.some(s => s.includes('반듯한 사각형'))).toBe(true)
    expect(ex.cautions.length).toBe(0)
  })

  it('좁은폭·부등변 사각형·간섭은 주의로 잡히고 간섭은 "점수 미반영" 문구', () => {
    const c = mk({
      status: 'pass',
      metrics: { stage6MarginMm: 120, supportSpanFraction: 0.3, supportSpanNarrow: true, wireConflictCount: 13 },
      groups: [[[0, 0], [12000, 0], [9000, 6000], [3000, 6000]]], // 부등변 사다리꼴(대변비 0.75)
    })
    const ex = explainCandidate(c, [c], 0)
    expect(ex.cautions.some(s => s.includes('권상폭 30%'))).toBe(true)
    expect(ex.cautions.some(s => s.includes('대변비'))).toBe(true)
    const conflict = ex.cautions.find(s => s.includes('간섭'))
    expect(conflict).toBeTruthy()
    expect(conflict).toContain('점수에는 넣지 않')
  })

  it('FAIL 은 강점 없이 추천 대상 아님 경고', () => {
    const c = mk({ status: 'fail', metrics: { supportSpanFraction: 0.6 }, groups: [rect(0, 0, 8000, 8000)] })
    const ex = explainCandidate(c, [c], 0)
    expect(ex.cautions.some(s => s.includes('FAIL'))).toBe(true)
  })
})

describe('neatness', () => {
  it('축평행 직사각형이 45° 다이아몬드보다 반듯함이 높다', () => {
    const good = mk({ groups: [rect(0, 0, 4000, 2000)] })
    const diamond = mk({ groups: [[[0, 0], [2000, 2000], [4000, 0], [2000, -2000]]] })
    expect(neatness(good)).toBeGreaterThan(neatness(diamond))
  })
})

describe('buildComparison', () => {
  it('1위는 차선 대비 우위를 설명한다', () => {
    const top = mk({ status: 'pass', metrics: { stage6MarginMm: 300, supportSpanFraction: 0.78 }, groups: [rect(0, 0, 14000, 18000)] })
    const second = mk({ status: 'pass', metrics: { stage6MarginMm: 280, supportSpanFraction: 0.5 }, groups: [[[0, 0], [12000, 0], [9000, 6000], [3000, 6000]]] })
    const ranked = [top, second]
    const s = buildComparison(top, ranked, 0)
    expect(s).toContain('추천 차선(2위)보다')
    expect(s).toContain('추천 최상위')
    // 권상폭·반듯함 우위 중 하나 이상이 명시돼야 한다.
    expect(/권상폭|반듯한 형상/.test(s)).toBe(true)
  })

  it('2위는 1위 대비 열위를 설명한다', () => {
    const top = mk({ status: 'pass', metrics: { stage6MarginMm: 300, supportSpanFraction: 0.78 }, groups: [rect(0, 0, 14000, 18000)] })
    const second = mk({ status: 'pass', metrics: { stage6MarginMm: 280, supportSpanFraction: 0.5 }, groups: [[[0, 0], [12000, 0], [9000, 6000], [3000, 6000]]] })
    const ranked = [top, second]
    const s = buildComparison(second, ranked, 1)
    expect(s).toContain('추천 1위 대비')
    expect(s).toContain('후순위')
  })

  it('후보가 하나뿐이면 비교 문구는 null', () => {
    const only = mk({ status: 'pass', groups: [rect(0, 0, 8000, 8000)] })
    expect(buildComparison(only, [only], 0)).toBeNull()
  })
})

describe('rankingCriteria', () => {
  it('핵심 기준(자세안정성·반듯함·권상폭·제외·간섭)을 모두 담는다', () => {
    const joined = rankingCriteria().join('\n')
    expect(joined).toContain('자세안정성')
    expect(joined).toContain('반듯')
    expect(joined).toContain('권상폭')
    expect(joined).toContain('제외')
    expect(joined).toContain('간섭')
  })
})
