/**
 * Wraps a parsed 00_StageSummary.json — phase별 알고리즘 요약 인덱스.
 *
 * 입력 JSON 구조 (요약):
 *   meta                            { schemaVersion, timestamp, unit, purpose }
 *   summary                         { stageCount, firstStage, lastStage,
 *                                     finalNodeCount, finalElementCount, finalRigidCount, finalPointMassCount,
 *                                     totalErrors, totalWarnings, totalInfos,
 *                                     massProperties { totalMassTon, beamMassTon, pointMassTon, centerOfGravityMm[3] } }
 *   stages[]                        phase 별 counts/delta/connectivity/health/diagnostics
 *
 * 뷰어가 사용하는 핵심 필드는 summary.massProperties — 우하단 중량 표시와 무게중심 마커용.
 * stages[] 는 phase JSON 들이 이미 stages 로 들어와 있으므로 중복 데이터지만 유지(향후 사용).
 */
export class StageSummaryData {
  constructor(json) {
    this.meta    = json?.meta    ?? {}
    this.summary = json?.summary ?? {}
    this.stages  = json?.stages  ?? []
  }

  /**
   * 전체 모델의 질량 정보 (없으면 null).
   * @returns {{ totalMassTon: number, beamMassTon: number, pointMassTon: number,
   *            centerOfGravityMm: { x: number, y: number, z: number } } | null}
   */
  get massProperties() {
    const m = this.summary?.massProperties
    if (!m) return null
    const cog = Array.isArray(m.centerOfGravityMm) ? m.centerOfGravityMm : null
    return {
      totalMassTon:  m.totalMassTon ?? 0,
      beamMassTon:   m.beamMassTon  ?? 0,
      pointMassTon:  m.pointMassTon ?? 0,
      centerOfGravityMm: cog && cog.length >= 3
        ? { x: cog[0], y: cog[1], z: cog[2] }
        : null,
    }
  }
}

/**
 * fileLoader 가 phase JSON 과 구분하기 위한 판별 헬퍼.
 * stages[] + summary.massProperties 가 함께 있어야 StageSummary.
 * (phase JSON 은 nodes/elements 배열을 가지지만 stages[] 는 갖지 않는다.)
 */
export function isStageSummaryJson(json) {
  return Array.isArray(json?.stages)
      && json?.summary != null
      && json?.summary?.massProperties != null
}
