import { describe, it, expect } from 'vitest'
import { adaptStabilityReportToCandidate } from './hoistStabilityAdapter.js'

const report = {
  overall: { status: 'pass' },
  stages: [
    { id: 4, status: 'pass', summary: { minAngleDeg: 68 } },
    { id: 5, status: 'pass', summary: { conflictCount: 0, minClearanceMm: 120 } },
    { id: 6, status: 'pass', summary: { isStable: true, deviationMm: 30, thresholdMm: 100, marginMm: 70, evaluationMode: 'ConvexPolygon' } },
  ],
}

describe('adaptStabilityReportToCandidate', () => {
  it('stages.summary 를 후보 metrics 로 매핑', () => {
    const c = adaptStabilityReportToCandidate(report, { groups: [[1, 2, 3], [4, 5, 6]], pointsPerGroup: 3 })
    expect(c.overallStatus).toBe('pass')
    expect(c.groupCount).toBe(2)
    expect(c.groups).toEqual([{ nodeIds: [1, 2, 3] }, { nodeIds: [4, 5, 6] }])
    expect(c.metrics.stage6MarginMm).toBe(70)
    expect(c.metrics.stage6DeviationMm).toBe(30)
    expect(c.metrics.minSlingAngleDeg).toBe(68)
    expect(c.metrics.wireConflictCount).toBe(0)
    expect(c.metrics.evaluationMode).toBe('ConvexPolygon')
  })

  it('PascalCase 리포트도 동일 결과', () => {
    const pascal = {
      Overall: { Status: 'pass' },
      Stages: [
        { Id: 4, Status: 'pass', Summary: { MinAngleDeg: 68 } },
        { Id: 6, Status: 'pass', Summary: { MarginMm: 70, DeviationMm: 30 } },
      ],
    }
    const c = adaptStabilityReportToCandidate(pascal, { groups: [[1, 2]], pointsPerGroup: 2 })
    expect(c.metrics.stage6MarginMm).toBe(70)
    expect(c.metrics.minSlingAngleDeg).toBe(68)
    expect(c.overallStatus).toBe('pass')
  })

  it('overall 없으면 stages 최악으로 산출, 누락 stage 는 안전 기본값', () => {
    const r = { stages: [{ id: 6, status: 'fail', summary: { marginMm: -10 } }] }
    const c = adaptStabilityReportToCandidate(r, { groups: [[1, 2, 3]], pointsPerGroup: 3 })
    expect(c.overallStatus).toBe('fail')
    expect(c.metrics.minSlingAngleDeg).toBeNull()
    expect(c.metrics.wireConflictCount).toBe(0)
    expect(c.metrics.failedStages).toContain(6)
  })

  it('id 없는 stage 2개가 NaN 키로 서로 덮어쓰지 않고, 유효 id 조회는 정상 동작', () => {
    // id 누락 stage 2개 + 유효 id=6. 가드 없으면 두 id-less 가 같은 NaN 키로 충돌하며
    // byId.get(6) 이 오염될 수 있다. 가드 후엔 id-less 는 무시되고 s6 조회는 정상.
    const r = {
      stages: [
        { status: 'warn', summary: { minAngleDeg: 10 } },            // id 없음
        { status: 'pass', summary: { conflictCount: 7 } },           // id 없음
        { id: 6, status: 'pass', summary: { marginMm: 55, deviationMm: 20, evaluationMode: 'ConvexPolygon' } },
      ],
    }
    const c = adaptStabilityReportToCandidate(r, { groups: [[1, 2, 3]], pointsPerGroup: 3 })
    // s6(유효 id) 값이 id-less stage 에 의해 오염되지 않음
    expect(c.metrics.stage6MarginMm).toBe(55)
    expect(c.metrics.stage6DeviationMm).toBe(20)
    expect(c.metrics.evaluationMode).toBe('ConvexPolygon')
    // s4/s5(id 4·5)는 존재하지 않으므로 안전 기본값 (id-less 가 s4/s5 로 잘못 매핑되지 않음)
    expect(c.metrics.minSlingAngleDeg).toBeNull()
    expect(c.metrics.wireConflictCount).toBe(0)
  })
})
