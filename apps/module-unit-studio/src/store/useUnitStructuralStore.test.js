import { describe, it, expect, beforeEach } from 'vitest'
import { useUnitStructuralStore } from './useUnitStructuralStore.js'

describe('useUnitStructuralStore', () => {
  beforeEach(() => {
    useUnitStructuralStore.getState().reset()
    // 입력 옵션은 reset() 대상이 아니므로 명시적으로 기본값 복원
    useUnitStructuralStore.setState({ safetyFactor: 1.2, allowableMpa: 220, panelOpen: false })
  })

  it('기본 상태는 미실행(null)이다', () => {
    const s = useUnitStructuralStore.getState()
    expect(s.status).toBeNull()
    expect(s.progress).toBe(0)
    expect(s.result).toBeNull()
  })

  it('setProgress 는 누락 필드에 대해 이전 값을 유지한다', () => {
    const st = useUnitStructuralStore.getState()
    st.setProgress({ status: 'Running', progress: 40, message: '해석 중' })
    st.setProgress({ progress: 55 })   // status/message 누락
    let s = useUnitStructuralStore.getState()
    expect(s.status).toBe('Running')   // 유지
    expect(s.progress).toBe(55)        // 갱신
    expect(s.message).toBe('해석 중')  // 유지

    st.setProgress({ message: '거의 완료' })  // status/progress 누락
    s = useUnitStructuralStore.getState()
    expect(s.status).toBe('Running')   // 유지 (null 로 지워지지 않음 — 이중 제출 표면 방지)
    expect(s.progress).toBe(55)        // 유지
    expect(s.message).toBe('거의 완료')
  })

  it('setStarted → setSuccess 전이', () => {
    const st = useUnitStructuralStore.getState()
    st.setStarted()
    let s = useUnitStructuralStore.getState()
    expect(s.status).toBe('Pending')
    expect(s.progress).toBe(0)
    expect(s.result).toBeNull()

    st.setSuccess({ analysisId: 'A1', summary: { memberExceedCount: 0 }, warnings: ['w'], resultPath: '/r.json', result: { ok: 1 } })
    s = useUnitStructuralStore.getState()
    expect(s.status).toBe('Success')
    expect(s.progress).toBe(100)
    expect(s.analysisId).toBe('A1')
    expect(s.summary).toEqual({ memberExceedCount: 0 })
    expect(s.warnings).toEqual(['w'])
    expect(s.result).toEqual({ ok: 1 })
    expect(s.error).toBeNull()
    expect(s.ranAt).toBeTruthy()
  })

  it('setStarted → setFailure 전이 (문자열/객체 모두)', () => {
    const st = useUnitStructuralStore.getState()
    st.setStarted()
    st.setFailure('해석 실패')
    let s = useUnitStructuralStore.getState()
    expect(s.status).toBe('Failed')
    expect(s.error).toEqual({ message: '해석 실패' })
    expect(s.message).toBe('해석 실패')

    st.setFailure({ error: 'Nastran FATAL', stderr: 'xxx' })
    s = useUnitStructuralStore.getState()
    expect(s.status).toBe('Failed')
    expect(s.error).toEqual({ error: 'Nastran FATAL', stderr: 'xxx' })
    expect(s.message).toBe('Nastran FATAL')
  })

  it('reset() 은 실행/결과 필드를 초기화한다', () => {
    const st = useUnitStructuralStore.getState()
    st.setSuccess({ analysisId: 'A1', summary: {}, warnings: ['w'], resultPath: '/r', result: { ok: 1 } })
    st.reset()
    const s = useUnitStructuralStore.getState()
    expect(s.status).toBeNull()
    expect(s.progress).toBe(0)
    expect(s.message).toBe('')
    expect(s.result).toBeNull()
    expect(s.resultPath).toBeNull()
    expect(s.analysisId).toBeNull()
    expect(s.summary).toBeNull()
    expect(s.warnings).toEqual([])
    expect(s.error).toBeNull()
    expect(s.ranAt).toBeNull()
  })
})
