import { describe, it, expect, afterEach } from 'vitest'
import { buildPostureStabilityPayload, suggestCogToleranceMm } from './useEditStore.js'
import { useStageStore } from './useStageStore.js'

/**
 * 정밀 검토 옵션 — _posture.json 직렬화 (2026-08 신규).
 *
 *  · liftAnalysis      → 엔진 Stage 7(슬링 장력·SWL·DAF)
 *  · cogToleranceMm    → 엔진 Stage 6 무게중심 포락선
 *
 * 가장 중요한 고정: <b>둘 다 꺼져 있으면 페이로드가 예전과 똑같아야 한다.</b>
 * 켜지 않은 사용자의 평가 결과가 조용히 달라지면 안 된다.
 */

// pointMass 하나로 COG 가 잡히는 최소 stage.
const makeStage = () => ({
  nodeMap: new Map([[1, { id: 1, x: 100, y: 0, z: 0 }]]),
  pointMasses: [{ nodeId: 1, mass: 2 }],
  elements: [],
  meta: {},
})

const hoisting = { mode: 'single', groupCount: 0, wireLengthM: 8, groups: [] }

const build = (state) => buildPostureStabilityPayload(state, hoisting, makeStage(), null)

afterEach(() => {
  useStageStore.setState({ stageSummary: null, pipeFluidEmptied: false, modelRotated: false })
})

describe('liftAnalysis 직렬화', () => {
  it('꺼져 있으면 페이로드에 아예 없다 (Stage 7 skip = 기존 동작)', () => {
    expect(build({}).liftAnalysis).toBeUndefined()
    expect(build({ liftAnalysis: { enabled: false, daf: 1.15 } }).liftAnalysis).toBeUndefined()
  })

  it('켜면 문자열 입력이 숫자로 정규화된다', () => {
    const la = build({
      liftAnalysis: {
        enabled: true, daf: '1.2', weightContingencyPct: '5',
        wireSwlTon: '12', shackleSwlTon: '17', lugSwlTon: '15',
      },
    }).liftAnalysis

    expect(la).toMatchObject({ enabled: true, daf: 1.2, weightContingencyPct: 5 })
    expect(la.allowables).toEqual({ wireSwlTon: 12, shackleSwlTon: 17, lugSwlTon: 15 })
  })

  it('빈 SWL 은 null 로 실린다 — 엔진이 그 검사만 생략한다', () => {
    const la = build({
      liftAnalysis: { enabled: true, daf: 1.15, weightContingencyPct: 10, wireSwlTon: '12', shackleSwlTon: '', lugSwlTon: null },
    }).liftAnalysis

    expect(la.allowables).toEqual({ wireSwlTon: 12, shackleSwlTon: null, lugSwlTon: null })
  })

  it('0 이하 SWL 도 null 로 떨어진다 — 0 을 "허용하중 0" 으로 오해하면 안 된다', () => {
    const la = build({
      liftAnalysis: { enabled: true, wireSwlTon: '0', shackleSwlTon: '-5', lugSwlTon: '15' },
    }).liftAnalysis

    expect(la.allowables).toEqual({ wireSwlTon: null, shackleSwlTon: null, lugSwlTon: 15 })
  })

  it('daf 가 비었거나 0 이하면 1.0 (하중 증폭 없음) 으로 떨어진다', () => {
    expect(build({ liftAnalysis: { enabled: true, daf: '' } }).liftAnalysis.daf).toBe(1.0)
    expect(build({ liftAnalysis: { enabled: true, daf: '0' } }).liftAnalysis.daf).toBe(1.0)
  })
})

describe('cogToleranceMm 직렬화', () => {
  it('꺼져 있으면 model 에 필드가 없다 (포락선 없음 = 기존 동작)', () => {
    expect(build({}).model.cogToleranceMm).toBeUndefined()
    expect(build({ cogTolerance: { enabled: false, x: 300 } }).model.cogToleranceMm).toBeUndefined()
  })

  it('켜면 model.cogToleranceMm 로 실린다', () => {
    const m = build({ cogTolerance: { enabled: true, x: '300', y: '200', z: '100' } }).model
    expect(m.cogToleranceMm).toEqual({ x: 300, y: 200, z: 100 })
  })

  it('켜도 값이 전부 0/빈값이면 싣지 않는다 — 후보를 늘릴 이유가 없다', () => {
    expect(build({ cogTolerance: { enabled: true, x: '', y: '', z: '' } }).model.cogToleranceMm).toBeUndefined()
    expect(build({ cogTolerance: { enabled: true, x: 0, y: 0, z: 0 } }).model.cogToleranceMm).toBeUndefined()
  })

  it('음수는 절댓값으로 보낸다 (± 공차라 부호가 의미 없다)', () => {
    const m = build({ cogTolerance: { enabled: true, x: '-300', y: 200, z: 0 } }).model
    expect(m.cogToleranceMm).toEqual({ x: 300, y: 200, z: 0 })
  })

  it('한 축만 지정해도 실린다', () => {
    const m = build({ cogTolerance: { enabled: true, x: '', y: '250', z: '' } }).model
    expect(m.cogToleranceMm).toEqual({ x: 0, y: 250, z: 0 })
  })
})

describe('두 옵션 모두 꺼진 기본 상태', () => {
  it('페이로드에 새 키가 하나도 추가되지 않는다', () => {
    const payload = build({})
    expect(payload).not.toHaveProperty('liftAnalysis')
    expect(payload.model).not.toHaveProperty('cogToleranceMm')
    // 기존 계약은 그대로
    expect(payload.schema).toBe('posture-stability/1.0')
    expect(payload).toHaveProperty('strictEvaluation')
  })
})

describe('suggestCogToleranceMm', () => {
  const bbox = { minX: 0, maxX: 20000, minY: 0, maxY: 10000, minZ: 0, maxZ: 6000 }

  it('평면 치수의 2%, Z 는 높이의 1% 를 제안한다', () => {
    expect(suggestCogToleranceMm(bbox)).toEqual({ x: 400, y: 200, z: 60 })
  })

  it('비율을 바꿀 수 있다', () => {
    expect(suggestCogToleranceMm(bbox, 0.05)).toEqual({ x: 1000, y: 500, z: 150 })
  })

  it('bbox 가 없거나 평면 치수가 0 이면 null', () => {
    expect(suggestCogToleranceMm(null)).toBeNull()
    expect(suggestCogToleranceMm({ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 100 })).toBeNull()
  })
})
