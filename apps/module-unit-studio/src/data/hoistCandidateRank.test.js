import { describe, it, expect } from 'vitest'
import {
  normalizeCandidate,
  candidateSignature,
  compareCandidates,
  rankHoistCandidates,
  toNodeGroups,
  isSimilarShape,
  dedupeSimilarCandidates,
} from './hoistCandidateRank.js'

const mk = (over = {}) => ({
  label: 'L', score: 1000, overallStatus: 'warn', groupCount: 2,
  groups: [{ nodeIds: [3, 1] }, { nodeIds: [2] }],
  metrics: { stage6Status: 'warn', stage6MarginMm: 10, minSlingAngleDeg: 65, wireConflictCount: 0, failedStages: [] },
  ...over,
})

describe('hoistCandidateRank', () => {
  it('candidateSignature 는 노드 순서/그룹 순서에 불변', () => {
    const a = candidateSignature(normalizeCandidate(mk()))
    const b = candidateSignature(normalizeCandidate(mk({ groups: [{ nodeIds: [2] }, { nodeIds: [1, 3] }] })))
    expect(a).toBe(b)
  })

  it('normalizeCandidate 는 누락 metric 을 null/0 으로 채운다', () => {
    const c = normalizeCandidate({ groups: [{ nodeIds: [1] }] })
    expect(c.metrics.stage6MarginMm).toBeNull()
    expect(c.metrics.wireConflictCount).toBe(0)
    expect(c.overallStatus).toBe('unknown')
    expect(c.metrics.supportSpanFraction).toBeNull()
    expect(c.metrics.supportSpanNarrow).toBe(false)
  })

  it('normalizeCandidate: supportSpanFraction/Narrow 를 camel/Pascal 모두 읽는다', () => {
    const camel = normalizeCandidate({ groups: [{ nodeIds: [1] }], metrics: { supportSpanFraction: 0.62, supportSpanNarrow: false } })
    expect(camel.metrics.supportSpanFraction).toBe(0.62)
    expect(camel.metrics.supportSpanNarrow).toBe(false)
    const pascal = normalizeCandidate({ Groups: [{ NodeIds: [1] }], Metrics: { SupportSpanFraction: 0.2, SupportSpanNarrow: true } })
    expect(pascal.metrics.supportSpanFraction).toBe(0.2)
    expect(pascal.metrics.supportSpanNarrow).toBe(true)
  })

  it('compareCandidates: PASS 가 WARN 보다 앞', () => {
    const pass = normalizeCandidate(mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 1 } }))
    const warn = normalizeCandidate(mk({ overallStatus: 'warn', metrics: { stage6MarginMm: 999 } }))
    expect(compareCandidates(pass, warn)).toBeLessThan(0)
  })

  it('compareCandidates: 같은 상태면 Stage6 여유 큰 쪽이 앞', () => {
    const big = normalizeCandidate(mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 500 } }))
    const small = normalizeCandidate(mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 100 } }))
    expect(compareCandidates(big, small)).toBeLessThan(0)
  })

  it('compareCandidates: 같은 상태면 면적 큰 쪽이 앞 (여유가 작아도)', () => {
    const sq = (s) => ({ nodes: [{ x: 0, y: 0, z: 0 }, { x: s, y: 0, z: 0 }, { x: s, y: s, z: 0 }, { x: 0, y: s, z: 0 }] })
    const big = normalizeCandidate(mk({ overallStatus: 'pass', groups: [sq(2000)], metrics: { stage6MarginMm: 100 } }))
    const small = normalizeCandidate(mk({ overallStatus: 'pass', groups: [sq(1000)], metrics: { stage6MarginMm: 900 } }))
    expect(compareCandidates(big, small)).toBeLessThan(0)  // 면적이 우선 → 여유 900 인 small 을 앞선다
  })

  it('compareCandidates: 같은 상태면 엔진 score 큰 쪽이 최우선 (면적이 작아도)', () => {
    // 엔진 score 가 반듯함(축평행 직사각형·긴 축평행 직선)·지지폭을 이미 합산하므로 studio 는 이를 신뢰한다.
    const sq = (s) => ({ nodes: [{ x: 0, y: 0, z: 0 }, { x: s, y: 0, z: 0 }, { x: s, y: s, z: 0 }, { x: 0, y: s, z: 0 }] })
    const neat = normalizeCandidate(mk({ overallStatus: 'pass', score: 1_200_000, groups: [sq(1000)] }))
    const messyBig = normalizeCandidate(mk({ overallStatus: 'pass', score: 1_050_000, groups: [sq(3000)] }))
    expect(compareCandidates(neat, messyBig)).toBeLessThan(0)
  })

  it('normalizeCandidate: groupSpanFraction/Narrow 를 읽는다', () => {
    const c = normalizeCandidate({ groups: [{ nodeIds: [1] }], metrics: { groupSpanFraction: 0.12, groupSpanNarrow: true } })
    expect(c.metrics.groupSpanFraction).toBe(0.12)
    expect(c.metrics.groupSpanNarrow).toBe(true)
    const d = normalizeCandidate({ groups: [{ nodeIds: [1] }] })
    expect(d.metrics.groupSpanFraction).toBeNull()
    expect(d.metrics.groupSpanNarrow).toBe(false)
  })

  it('compareCandidates: 여유 같으면 그룹 수 적은 쪽이 앞', () => {
    const few = normalizeCandidate(mk({ overallStatus: 'pass', groupCount: 2, metrics: { stage6MarginMm: 100 } }))
    const many = normalizeCandidate(mk({ overallStatus: 'pass', groupCount: 4, metrics: { stage6MarginMm: 100 } }))
    expect(compareCandidates(few, many)).toBeLessThan(0)
  })

  it('rankHoistCandidates: 여러 report 병합 + 중복제거 + id 부여', () => {
    const rep1 = { best: mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 300 } }), candidates: [mk({ groups: [{ nodeIds: [4, 5] }, { nodeIds: [6] }] })] }
    const rep2 = { best: mk({ overallStatus: 'pass', metrics: { stage6MarginMm: 300 } }), candidates: [] } // rep1.best 와 동일 시그니처
    const ranked = rankHoistCandidates([rep1, rep2, null])
    expect(ranked.length).toBe(2)               // pass(중복1) + warn(mk 기본) = 2
    expect(ranked[0].overallStatus).toBe('pass')
    expect(ranked[0].id).toBeTruthy()
  })

  it('toNodeGroups: 그룹별 nodeIds 배열, 빈 그룹 제외', () => {
    const ng = toNodeGroups(normalizeCandidate(mk({ groups: [{ nodeIds: [1, 2] }, { nodeIds: [] }] })))
    expect(ng).toEqual([[1, 2]])
  })

  it('빈 입력은 빈 배열', () => {
    expect(rankHoistCandidates([])).toEqual([])
    expect(rankHoistCandidates(null)).toEqual([])
  })

  it('좌표 없는 그룹은 형태 dedupe 되지 않는다(안전)', () => {
    // mk 기본 그룹은 nodes 좌표가 없어 centroid 계산 불가 → 형태 dedupe 대상에서 제외.
    const rep = { candidates: [mk({ overallStatus: 'pass' }), mk({ overallStatus: 'pass', groups: [{ nodeIds: [7, 8] }, { nodeIds: [9] }] })] }
    expect(rankHoistCandidates([rep])).toHaveLength(2)
  })

  it('rankHoistCandidates: 엔진의 PascalCase 리포트도 읽는다', () => {
    const pascalReport = {
      Best: {
        Label: 'Hook-3g', Score: 1000500, OverallStatus: 'pass', GroupCount: 3,
        Groups: [{ NodeIds: [1, 2, 3] }, { NodeIds: [4, 5, 6] }, { NodeIds: [7, 8, 9] }],
        Metrics: { Stage6Status: 'pass', Stage6MarginMm: 500, MinSlingAngleDeg: 70, WireConflictCount: 0, FailedStages: [] },
      },
      Candidates: [],
    }
    const ranked = rankHoistCandidates([pascalReport])
    expect(ranked.length).toBe(1)
    expect(ranked[0].overallStatus).toBe('pass')
    expect(ranked[0].groupCount).toBe(3)
    expect(ranked[0].metrics.stage6MarginMm).toBe(500)
    expect(toNodeGroups(ranked[0])).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
  })
})

// ── 형태 근접 후보 제거 ─────────────────────────────────────────────────
// 중심 (cx,cy) 의 2×2 사각형(변 2000mm) / X축 4점 일직선 그룹 헬퍼.
const quad = (cx, cy, ids) => ({
  nodeIds: ids,
  nodes: [
    { id: ids[0], x: cx - 1000, y: cy - 1000, z: 0 },
    { id: ids[1], x: cx + 1000, y: cy - 1000, z: 0 },
    { id: ids[2], x: cx + 1000, y: cy + 1000, z: 0 },
    { id: ids[3], x: cx - 1000, y: cy + 1000, z: 0 },
  ],
})
const line = (cx, cy, ids) => ({
  nodeIds: ids,
  nodes: [
    { id: ids[0], x: cx - 1500, y: cy, z: 0 },
    { id: ids[1], x: cx - 500, y: cy, z: 0 },
    { id: ids[2], x: cx + 500, y: cy, z: 0 },
    { id: ids[3], x: cx + 1500, y: cy, z: 0 },
  ],
})
const shapeCand = (score, groups) => ({ overallStatus: 'pass', score, groupCount: 1, groups })

describe('isSimilarShape', () => {
  const tol = 1140
  it('같은 위치·같은 형상(사각형)은 유사', () => {
    const a = normalizeCandidate(shapeCand(100, [quad(1000, 1000, [1, 2, 3, 4])]))
    const b = normalizeCandidate(shapeCand(90, [quad(1100, 1000, [5, 6, 7, 8])])) // 100mm 이동
    expect(isSimilarShape(a, b, tol)).toBe(true)
  })
  it('위치가 멀면 유사 아님', () => {
    const a = normalizeCandidate(shapeCand(100, [quad(1000, 1000, [1, 2, 3, 4])]))
    const b = normalizeCandidate(shapeCand(90, [quad(20000, 1000, [5, 6, 7, 8])]))
    expect(isSimilarShape(a, b, tol)).toBe(false)
  })
  it('같은 위치라도 일직선 vs 사각형은 유사 아님(형태 보존)', () => {
    const a = normalizeCandidate(shapeCand(100, [quad(1000, 1000, [1, 2, 3, 4])]))
    const b = normalizeCandidate(shapeCand(90, [line(1000, 1000, [5, 6, 7, 8])]))
    expect(isSimilarShape(a, b, tol)).toBe(false)
  })
})

describe('rankHoistCandidates — 형태 근접 후보 제거', () => {
  it('위치·형상이 거의 같은 후보는 최상위만 남기고, 다른 형태/위치는 유지', () => {
    const report = {
      candidates: [
        shapeCand(100, [quad(1000, 1000, [1, 2, 3, 4])]),      // A 사각형(최상위)
        shapeCand(90, [quad(1100, 1000, [5, 6, 7, 8])]),       // A 사각형 근접(노드만 다름) → 제거
        shapeCand(80, [quad(20000, 1000, [9, 10, 11, 12])]),   // B 사각형(먼 위치) → 유지
        shapeCand(70, [line(1000, 1000, [13, 14, 15, 16])]),   // A 일직선(다른 형태) → 유지
      ],
    }
    const ranked = rankHoistCandidates([report])
    expect(ranked).toHaveLength(3)
    const allNodeIds = ranked.flatMap(c => c.groups.flatMap(g => g.nodeIds))
    expect(allNodeIds).toContain(1)      // A 사각형 최상위 유지
    expect(allNodeIds).not.toContain(5)  // A 사각형 근접본 제거
    expect(allNodeIds).toContain(9)      // 먼 위치 유지
    expect(allNodeIds).toContain(13)     // 일직선 유지
  })

  it('dedupeSimilarCandidates: 완전히 다른 위치는 제거되지 않는다', () => {
    const cands = [
      normalizeCandidate(shapeCand(100, [quad(0, 0, [1, 2, 3, 4])])),
      normalizeCandidate(shapeCand(90, [quad(50000, 50000, [5, 6, 7, 8])])),
    ]
    expect(dedupeSimilarCandidates(cands, 1000)).toHaveLength(2)
  })
})
