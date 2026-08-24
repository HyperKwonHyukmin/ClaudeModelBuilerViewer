import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStageStore } from './useStageStore.js'
import { useEditStore } from './useEditStore.js'

// loadStages 는 파일 IO(loadFiles)를 거치므로, 실제 파싱 대신 fileLoader 를 목킹해
// "새 stage 로드 시 편집 스토어 불변식(intents/권상 그룹/회전 provenance 초기화)"만 검증한다.
// vi.mock 은 import 위로 호이스팅되므로 위 static import 도 목킹된 loadFiles 를 사용한다.
const fakeStage = { sourceFileName: 'C.json', meta: { phase: 'C', stageName: 'C' }, nodeMap: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }]]) }
vi.mock('../data/fileLoader.js', () => ({
  emptyLoadSummary: () => ({ loaded: 0, json: 0, failed: 0, skipped: 0 }),
  loadFiles: vi.fn(async () => ({
    stages: [fakeStage],
    inputAudit: null,
    stageSummary: null,
    summary: { loaded: 1, json: 1, failed: 0, skipped: 0 },
  })),
}))

describe('useStageStore.loadStages — cross-store 불변식', () => {
  beforeEach(() => {
    useStageStore.getState().reset()
    useEditStore.getState().reset()
  })

  it('새 stage 로드 시 편집 스토어(intents/권상 그룹)를 초기화한다', async () => {
    // 옛 모델의 편집·권상 상태를 오염시켜 둔다.
    const ed = useEditStore.getState()
    ed.setHoistMode('hydro')
    ed.setHoistGroupCount(2)
    useEditStore.setState({
      intents: [{ id: 'x', kind: 'deleteElement', batchId: null, params: { elementId: 999 }, validation: { status: 'ok' } }],
    })
    expect(useEditStore.getState().intents.length).toBe(1)

    await useStageStore.getState().loadStages([{ name: 'C.json' }])

    // 새 stage 로드 후 편집 스토어가 완전히 초기화됐는지
    const s = useEditStore.getState()
    expect(s.intents).toEqual([])
    expect(s.hoistGroups).toEqual({ 1: [], 2: [], 3: [], 4: [] })
    expect(useStageStore.getState().stages.length).toBe(1)
    expect(useStageStore.getState().rotationStack).toEqual([])
    expect(useStageStore.getState().modelRotated).toBe(false)
  })
})
