import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useEditStore, buildPostureStabilityPayload } from './useEditStore.js'
import { useStabilityStore, isShapeGateRelaxed, failingStageLabels } from './useStabilityStore.js'

// 스토어 모듈이 import 되는 시점(= localStorage 미설치 상태)의 초기값을 캡처해 둔다.
// 다른 테스트가 스토어를 변경한 뒤에도 "기본값" 을 정확히 검증하기 위함.
const INITIAL_STRICT = useEditStore.getState().strictEvaluation

// vitest 환경이 node 라 localStorage 가 없다(jsdom 미설치). 영속 동작을 검증하려면 최소 스텁이 필요하다.
// 실제 앱(브라우저/Electron)에는 항상 존재하며, 없는 환경에서는 스토어가 try/catch 로 기본값을 쓴다.
function installLocalStorageStub() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: k => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

/**
 * 'Strict 평가' 토글(Hoist 패널) 검증.
 *
 * 사용자 결정(2026-07-27): 기본 OFF, 세션 간 유지, 형상만 완화.
 *   OFF → _posture.json 에 strictEvaluation:false → 엔진이 Stage 1·2(형상·Z단차) FAIL 을 warn 으로
 *         강등하고 옵티마이저 후보 게이트의 형상 검증을 우회한다.
 *   전도(Stage 6)·Wire 길이(Stage 3)는 완화 대상이 아니라 그대로 FAIL 이다(엔진 측 테스트로 검증).
 */

const minimalHoisting = () => ({
  mode: 'hydro',
  groupCount: 1,
  wireLengthM: 8,
  groups: [{ id: 1, nodeIds: [1] }],
})

const minimalStage = () => ({
  nodeMap: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }]]),
  pointMasses: [{ nodeId: 1, mass: 1 }],
  elements: [],
  sourceFileName: 'test.json',
  meta: { phase: 'C', stageName: 'C_Final' },
  bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
  center: { x: 0, y: 0, z: 0 },
})

describe('strictEvaluation — 기본값과 영속', () => {
  beforeEach(() => {
    installLocalStorageStub()
    useEditStore.setState({ strictEvaluation: false })
    useStabilityStore.setState({ report: null, overallStatus: null })
  })
  afterEach(() => { delete globalThis.localStorage })

  it('기본값은 OFF(false) — 사용자 지시', () => {
    // 저장값이 없는 최초 로드에서 완화 모드가 기본이다.
    expect(INITIAL_STRICT).toBe(false)
  })

  it('setStrictEvaluation 이 localStorage 에 영속화한다', () => {
    useEditStore.getState().setStrictEvaluation(true)
    expect(useEditStore.getState().strictEvaluation).toBe(true)
    expect(localStorage.getItem('mu.hoist.strictEvaluation.v1')).toBe('true')

    useEditStore.getState().setStrictEvaluation(false)
    expect(useEditStore.getState().strictEvaluation).toBe(false)
    expect(localStorage.getItem('mu.hoist.strictEvaluation.v1')).toBe('false')
  })

  it('토글을 바꾸면 이전 엄격도로 평가된 자세안정성 결과를 무효화한다', () => {
    // 기존 결과가 남아 있으면 "표시된 판정"과 "현재 기준"이 어긋난다 → 리셋해 재실행을 유도.
    useStabilityStore.setState({
      report: { stages: [{ stage: 1, status: 'warn', displayPolicy: 'user', summary: {} }] },
      overallStatus: 'warn',
    })
    useEditStore.getState().setStrictEvaluation(true)

    expect(useStabilityStore.getState().report).toBeNull()
    expect(useStabilityStore.getState().overallStatus).toBeNull()
  })

  it('같은 값으로 다시 세팅하면 결과를 건드리지 않는다(불필요한 리셋 방지)', () => {
    useEditStore.setState({ strictEvaluation: false })
    const report = { stages: [{ stage: 1, status: 'pass', displayPolicy: 'user', summary: {} }] }
    useStabilityStore.setState({ report, overallStatus: 'pass' })

    useEditStore.getState().setStrictEvaluation(false)

    expect(useStabilityStore.getState().report).toBe(report)
  })
})

describe('buildPostureStabilityPayload — strictEvaluation 전달', () => {
  it('토글 OFF 면 strictEvaluation:false 를 페이로드에 싣는다', () => {
    const state = { ...useEditStore.getState(), strictEvaluation: false }
    const payload = buildPostureStabilityPayload(state, minimalHoisting(), minimalStage(), null)
    expect(payload.strictEvaluation).toBe(false)
  })

  it('토글 ON 이면 strictEvaluation:true 를 페이로드에 싣는다', () => {
    const state = { ...useEditStore.getState(), strictEvaluation: true }
    const payload = buildPostureStabilityPayload(state, minimalHoisting(), minimalStage(), null)
    expect(payload.strictEvaluation).toBe(true)
  })

  it('필드가 없으면 false(완화)로 보낸다 — 기본값 OFF 와 일관', () => {
    const state = { ...useEditStore.getState() }
    delete state.strictEvaluation
    const payload = buildPostureStabilityPayload(state, minimalHoisting(), minimalStage(), null)
    expect(payload.strictEvaluation).toBe(false)
  })
})

describe('isShapeGateRelaxed — 리포트가 완화로 통과했는지 판별', () => {
  it('Stage 1·2 의 shapeGateRelaxed 가 하나라도 true 면 true', () => {
    const report = {
      stages: [
        { stage: 1, status: 'warn', summary: { shapeGateRelaxed: true } },
        { stage: 2, status: 'pass', summary: { shapeGateRelaxed: false } },
      ],
    }
    expect(isShapeGateRelaxed(report)).toBe(true)
  })

  it('완화가 실제로 적용되지 않았으면 false — 토글이 꺼져 있어도 위반이 없으면 표식이 서지 않는다', () => {
    const report = {
      stages: [
        { stage: 1, status: 'pass', summary: { shapeGateRelaxed: false } },
        { stage: 2, status: 'pass', summary: { shapeGateRelaxed: false } },
      ],
    }
    expect(isShapeGateRelaxed(report)).toBe(false)
  })

  it('구버전 엔진 리포트(키 없음)는 false 로 폴백한다', () => {
    const report = { stages: [{ stage: 1, status: 'fail', summary: { rejected: 1 } }] }
    expect(isShapeGateRelaxed(report)).toBe(false)
  })

  it('리포트가 없으면 false', () => {
    expect(isShapeGateRelaxed(null)).toBe(false)
    expect(isShapeGateRelaxed(undefined)).toBe(false)
    expect(isShapeGateRelaxed({})).toBe(false)
  })
})

describe('failingStageLabels — 구조해석을 막는 항목 이름', () => {
  it('fail 인 사용자 표시 stage 의 라벨만 모은다', () => {
    const report = {
      stages: [
        { stage: 1, displayLabel: '권상 형상 분류', status: 'warn' },
        { stage: 3, displayLabel: 'Wire 길이', status: 'fail' },
        { stage: 6, displayLabel: '전도 안정성', status: 'fail' },
      ],
    }
    expect(failingStageLabels(report)).toEqual(['Wire 길이', '전도 안정성'])
  })

  it('internal stage 는 제외한다(사용자에게 안 보이는 항목이므로)', () => {
    const report = {
      stages: [
        { stage: 9, displayLabel: '내부 검사', displayPolicy: 'internal', status: 'fail' },
        { stage: 6, displayLabel: '전도 안정성', status: 'fail' },
      ],
    }
    expect(failingStageLabels(report)).toEqual(['전도 안정성'])
  })

  it('라벨이 없으면 Stage 번호로 대체한다', () => {
    expect(failingStageLabels({ stages: [{ stage: 7, status: 'fail' }] })).toEqual(['Stage 7'])
  })

  it('fail 이 없거나 리포트가 없으면 빈 배열', () => {
    expect(failingStageLabels({ stages: [{ stage: 1, status: 'warn' }] })).toEqual([])
    expect(failingStageLabels(null)).toEqual([])
    expect(failingStageLabels({})).toEqual([])
  })
})
