import { describe, it, expect } from 'vitest'
import {
  normalizeCandidate,
  candidateSignature,
  compareCandidates,
  rankHoistCandidates,
  toNodeGroups,
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
