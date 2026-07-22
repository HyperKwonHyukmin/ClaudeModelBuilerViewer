import { describe, it, expect } from 'vitest'
import {
  StageSummaryData,
  isStageSummaryJson,
  isWorkbenchCogJson,
  isPostureStabilityJson,
  isModuleStabilityJson,
} from './StageSummaryData.js'

// ── 포맷 스니퍼 ──────────────────────────────────────────────────────────

describe('isWorkbenchCogJson', () => {
  const good = { BdfFilePath: 'C:\\m.bdf', TotalMass: 12.3, CogX: 1, CogY: 2, CogZ: 3, ResultFilePath: '' }

  it('TotalMass + CogX/Y/Z 가 모두 유한하면 true', () => {
    expect(isWorkbenchCogJson(good)).toBe(true)
  })
  it('CogZ 누락(비유한)이면 false', () => {
    expect(isWorkbenchCogJson({ ...good, CogZ: undefined })).toBe(false)
  })
  it('TotalMass 누락이면 false', () => {
    expect(isWorkbenchCogJson({ ...good, TotalMass: undefined })).toBe(false)
  })
  it('null/문자열 좌표는 false', () => {
    expect(isWorkbenchCogJson(null)).toBe(false)
    expect(isWorkbenchCogJson({ ...good, CogX: '1' })).toBe(false)
  })
})

describe('isPostureStabilityJson', () => {
  const good = {
    schema: 'posture-stability/1.0',
    model: { totalMassTon: 31.8, centerOfGravityMm: { x: 1, y: 2, z: 3 } },
  }

  it('schema + totalMassTon + 유효 cog 면 true', () => {
    expect(isPostureStabilityJson(good)).toBe(true)
  })
  it('schema 불일치면 false', () => {
    expect(isPostureStabilityJson({ ...good, schema: 'posture-stability/2.0' })).toBe(false)
  })
  it('totalMassTon 누락이면 false', () => {
    expect(isPostureStabilityJson({ schema: 'posture-stability/1.0', model: { centerOfGravityMm: { x: 1, y: 2, z: 3 } } })).toBe(false)
  })
  it('cog 필드 누락(z 없음)이면 false', () => {
    expect(isPostureStabilityJson({ schema: 'posture-stability/1.0', model: { totalMassTon: 1, centerOfGravityMm: { x: 1, y: 2 } } })).toBe(false)
  })
})

describe('isModuleStabilityJson', () => {
  const good = {
    meta: { schema: 'module-analysis-stability/0.1' },
    input: { totalMassTon: 40, centerOfGravityMm: { x: 1, y: 2, z: 3 } },
  }

  it('meta.schema prefix + totalMassTon + 유효 cog 면 true', () => {
    expect(isModuleStabilityJson(good)).toBe(true)
  })
  it('schema prefix 불일치면 false', () => {
    expect(isModuleStabilityJson({ ...good, meta: { schema: 'other/0.1' } })).toBe(false)
  })
  it('meta.schema 가 문자열이 아니면 false', () => {
    expect(isModuleStabilityJson({ ...good, meta: { schema: 123 } })).toBe(false)
  })
  it('input.totalMassTon 누락이면 false', () => {
    expect(isModuleStabilityJson({ meta: { schema: 'module-analysis-stability/0.1' }, input: { centerOfGravityMm: { x: 1, y: 2, z: 3 } } })).toBe(false)
  })
})

describe('isStageSummaryJson (일반 StageSummary + 3개 변형 포함)', () => {
  it('stages[] + summary.massProperties 면 true (일반 StageSummary)', () => {
    const json = { meta: {}, summary: { massProperties: { totalMassTon: 1, centerOfGravityMm: { x: 1, y: 2, z: 3 } } }, stages: [] }
    expect(isStageSummaryJson(json)).toBe(true)
  })
  it('summary.massProperties 누락이면 false', () => {
    expect(isStageSummaryJson({ meta: {}, summary: {}, stages: [] })).toBe(false)
  })
  it('stages 배열이 없으면(그러나 특수 포맷도 아니면) false', () => {
    expect(isStageSummaryJson({ summary: { massProperties: {} } })).toBe(false)
  })
  it('3개 특수 포맷도 모두 StageSummary 로 인식', () => {
    expect(isStageSummaryJson({ TotalMass: 1, CogX: 1, CogY: 2, CogZ: 3 })).toBe(true)
    expect(isStageSummaryJson({ schema: 'posture-stability/1.0', model: { totalMassTon: 1, centerOfGravityMm: { x: 1, y: 2, z: 3 } } })).toBe(true)
    expect(isStageSummaryJson({ meta: { schema: 'module-analysis-stability/0.1' }, input: { totalMassTon: 1, centerOfGravityMm: { x: 1, y: 2, z: 3 } } })).toBe(true)
  })
})

// ── 생성자: 4개 경로의 massProperties 매핑 ────────────────────────────────

describe('StageSummaryData 생성자 — WorkBench COG', () => {
  it('TotalMass → mass, [CogX,CogY,CogZ] → cog 객체', () => {
    const d = new StageSummaryData({ BdfFilePath: 'a.bdf', TotalMass: 102.5, CogX: 10, CogY: 20, CogZ: 30, ResultFilePath: 'r' })
    expect(d.meta.schemaVersion).toBe('workbench-cog')
    expect(d.stages).toEqual([])
    expect(d.massProperties).toEqual({
      totalMassTon: 102.5, beamMassTon: 102.5, pointMassTon: 0,
      centerOfGravityMm: { x: 10, y: 20, z: 30 },
    })
  })
})

describe('StageSummaryData 생성자 — posture-stability', () => {
  it('model.totalMassTon → mass, model.centerOfGravityMm → cog', () => {
    const d = new StageSummaryData({
      schema: 'posture-stability/1.0', sourceFile: 's.json',
      model: { unit: 'mm', totalMassTon: 31.8, centerOfGravityMm: { x: 1, y: 2, z: 3 }, massSource: 'computed' },
    })
    expect(d.meta.schemaVersion).toBe('posture-stability/1.0')
    expect(d.massProperties.totalMassTon).toBe(31.8)
    expect(d.massProperties.centerOfGravityMm).toEqual({ x: 1, y: 2, z: 3 })
  })
})

describe('StageSummaryData 생성자 — module-analysis-stability', () => {
  it('input.totalMassTon → mass, input.centerOfGravityMm → cog', () => {
    const d = new StageSummaryData({
      meta: { schema: 'module-analysis-stability/0.1', sourceFiles: { posture: 'p.json' } },
      input: { totalMassTon: 40, centerOfGravityMm: { x: 4, y: 5, z: 6 }, massSource: 'x' },
    })
    expect(d.meta.schemaVersion).toBe('module-analysis-stability/0.1')
    expect(d.massProperties.totalMassTon).toBe(40)
    expect(d.massProperties.centerOfGravityMm).toEqual({ x: 4, y: 5, z: 6 })
  })
})

describe('StageSummaryData 생성자 — 일반 StageSummary', () => {
  it('meta/summary/stages 를 그대로 보관', () => {
    const json = {
      meta: { schemaVersion: '1.0', unit: 'mm' },
      summary: { massProperties: { totalMassTon: 7, beamMassTon: 5, pointMassTon: 2, centerOfGravityMm: [1, 2, 3] } },
      stages: [{ index: 0 }, { index: 1 }],
    }
    const d = new StageSummaryData(json)
    expect(d.meta).toEqual({ schemaVersion: '1.0', unit: 'mm' })
    expect(d.stages).toHaveLength(2)
    expect(d.massProperties).toEqual({
      totalMassTon: 7, beamMassTon: 5, pointMassTon: 2,
      centerOfGravityMm: { x: 1, y: 2, z: 3 },   // 배열 cog 도 객체로 정규화
    })
  })

  it('massProperties 자체가 없으면 getter 는 null', () => {
    const d = new StageSummaryData({ meta: {}, summary: {}, stages: [] })
    expect(d.massProperties).toBeNull()
  })
})

// ── normalizeCog (massProperties getter 를 통해 간접 검증) ─────────────────

describe('normalizeCog — 배열/객체/null 처리', () => {
  const withCog = (cog) => new StageSummaryData({
    meta: {}, stages: [],
    summary: { massProperties: { totalMassTon: 1, centerOfGravityMm: cog } },
  })

  it('길이>=3 유한 배열 → {x,y,z}', () => {
    expect(withCog([1, 2, 3]).massProperties.centerOfGravityMm).toEqual({ x: 1, y: 2, z: 3 })
    // 4개 이상이어도 앞 3개 사용
    expect(withCog([1, 2, 3, 9]).massProperties.centerOfGravityMm).toEqual({ x: 1, y: 2, z: 3 })
  })
  it('유한 x/y/z 객체 → 그대로', () => {
    expect(withCog({ x: 4, y: 5, z: 6 }).massProperties.centerOfGravityMm).toEqual({ x: 4, y: 5, z: 6 })
  })
  it('비유한 성분이 섞인 배열 → null', () => {
    expect(withCog([1, 2, NaN]).massProperties.centerOfGravityMm).toBeNull()
    expect(withCog([1, 2, null]).massProperties.centerOfGravityMm).toBeNull()
  })
  it('길이<3 배열 → null', () => {
    expect(withCog([1, 2]).massProperties.centerOfGravityMm).toBeNull()
  })
  it('z 누락 객체 → null', () => {
    expect(withCog({ x: 1, y: 2 }).massProperties.centerOfGravityMm).toBeNull()
  })
  it('cog = null → null', () => {
    expect(withCog(null).massProperties.centerOfGravityMm).toBeNull()
  })
})
