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
    if (isWorkbenchCogJson(json)) {
      this.meta = {
        schemaVersion: 'workbench-cog',
        unit: 'mm',
        purpose: 'massProperties',
        sourceFile: json?.BdfFilePath ?? '',
        resultFile: json?.ResultFilePath ?? '',
      }
      this.summary = {
        massProperties: {
          totalMassTon: json.TotalMass ?? 0,
          beamMassTon: json.TotalMass ?? 0,
          pointMassTon: 0,
          centerOfGravityMm: [json.CogX, json.CogY, json.CogZ],
        },
      }
      this.stages = []
      return
    }

    if (isPostureStabilityJson(json)) {
      this.meta = {
        schemaVersion: json?.schema ?? 'posture-stability/1.0',
        unit: json?.model?.unit ?? 'mm',
        purpose: 'massProperties',
        sourceFile: json?.sourceFile ?? '',
        massSource: json?.model?.massSource ?? '',
      }
      this.summary = {
        massProperties: {
          totalMassTon: json?.model?.totalMassTon ?? 0,
          beamMassTon: json?.model?.totalMassTon ?? 0,
          pointMassTon: 0,
          centerOfGravityMm: json?.model?.centerOfGravityMm ?? null,
        },
      }
      this.stages = []
      return
    }

    if (isModuleStabilityJson(json)) {
      this.meta = {
        schemaVersion: json?.meta?.schema ?? 'module-analysis-stability',
        unit: json?.meta?.unit ?? 'mm',
        purpose: 'massProperties',
        sourceFile: json?.meta?.sourceFiles?.posture ?? '',
        massSource: json?.input?.massSource ?? '',
      }
      this.summary = {
        massProperties: {
          totalMassTon: json?.input?.totalMassTon ?? 0,
          beamMassTon: json?.input?.totalMassTon ?? 0,
          pointMassTon: 0,
          centerOfGravityMm: json?.input?.centerOfGravityMm ?? null,
        },
      }
      this.stages = []
      return
    }

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
    const cog = normalizeCog(m.centerOfGravityMm)
    return {
      totalMassTon:  m.totalMassTon ?? 0,
      beamMassTon:   m.beamMassTon  ?? 0,
      pointMassTon:  m.pointMassTon ?? 0,
      centerOfGravityMm: cog,
    }
  }
}

/**
 * fileLoader 가 phase JSON 과 구분하기 위한 판별 헬퍼.
 * stages[] + summary.massProperties 가 함께 있어야 StageSummary.
 * (phase JSON 은 nodes/elements 배열을 가지지만 stages[] 는 갖지 않는다.)
 */
export function isStageSummaryJson(json) {
  return (
    Array.isArray(json?.stages)
      && json?.summary != null
      && json?.summary?.massProperties != null
  ) || isWorkbenchCogJson(json)
    || isPostureStabilityJson(json)
    || isModuleStabilityJson(json)
}

/**
 * WorkBench backend COG result JSON:
 * {
 *   BdfFilePath, TotalMass, CogX, CogY, CogZ, ResultFilePath
 * }
 */
export function isWorkbenchCogJson(json) {
  return json != null
      && Number.isFinite(json.TotalMass)
      && Number.isFinite(json.CogX)
      && Number.isFinite(json.CogY)
      && Number.isFinite(json.CogZ)
}

export function isPostureStabilityJson(json) {
  const cog = json?.model?.centerOfGravityMm
  return json?.schema === 'posture-stability/1.0'
      && Number.isFinite(json?.model?.totalMassTon)
      && isFiniteCog(cog)
}

export function isModuleStabilityJson(json) {
  const cog = json?.input?.centerOfGravityMm
  return typeof json?.meta?.schema === 'string'
      && json.meta.schema.startsWith('module-analysis-stability/')
      && Number.isFinite(json?.input?.totalMassTon)
      && isFiniteCog(cog)
}

function normalizeCog(cog) {
  if (Array.isArray(cog) && cog.length >= 3) {
    const [x, y, z] = cog
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x, y, z }
      : null
  }
  if (cog && typeof cog === 'object') {
    const { x, y, z } = cog
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x, y, z }
      : null
  }
  return null
}

function isFiniteCog(cog) {
  return normalizeCog(cog) != null
}
