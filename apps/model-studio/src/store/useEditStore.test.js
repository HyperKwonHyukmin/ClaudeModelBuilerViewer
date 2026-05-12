import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEditStore } from './useEditStore.js'
import { useStageStore } from './useStageStore.js'
import { StageData } from '../data/StageData.js'
import { setHost } from '../host/host.js'

const makeStageData = () => new StageData({
  meta: { phase: 'C', stageName: 'C_Final', timestamp: '20260429_120000', unit: 'mm', schemaVersion: '1.1' },
  nodes: [
    { id: 1, x: 0,    y: 0, z: 0, tags: [] },
    { id: 2, x: 1000, y: 0, z: 0, tags: [] },
    { id: 3, x: 2000, y: 0, z: 0, tags: [] },
    { id: 4, x: 3000, y: 0, z: 0, tags: [] },
  ],
  elements: [],
  rigids: [],
  properties: [], materials: [], pointMasses: [],
  connectivity: { groupCount: 1, largestGroupNodeCount: 4, isolatedNodeCount: 0,
    groups: [{ id: 0, nodeIds: [1, 2, 3, 4], elementIds: [101] }] },
  healthMetrics: { totals: { nodeCount: 4, elementCount: 0, rigidCount: 0, pointMassCount: 0,
    bbox: { minX: 0, maxX: 3000, minY: 0, maxY: 0, minZ: 0, maxZ: 0 } }, issues: {} },
})

describe('useEditStore', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    setHost(null) // 다음 getHost() 시 환경 재감지 — 기본은 WebHost
  })

  afterEach(() => {
    useStageStore.setState({ stages: [] })
    setHost(null)
  })

  it('기본 상태는 비활성·빈 목록', () => {
    const s = useEditStore.getState()
    expect(s.enabled).toBe(false)
    expect(s.intents).toEqual([])
    expect(s.selectedIntentId).toBeNull()
  })

  it('toggleEnabled 가 ON/OFF 를 전환한다', () => {
    const { toggleEnabled } = useEditStore.getState()
    toggleEnabled()
    expect(useEditStore.getState().enabled).toBe(true)
    toggleEnabled()
    expect(useEditStore.getState().enabled).toBe(false)
  })

  it('addIntent 가 정상 입력을 저장한다', () => {
    const { addIntent } = useEditStore.getState()
    const result = addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })
    expect(result.ok).toBe(true)
    expect(useEditStore.getState().intents).toHaveLength(1)
  })

  it('addIntent 가 error 상태인 경우 거절한다', () => {
    const { addIntent } = useEditStore.getState()
    const result = addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [1] } })
    expect(result.ok).toBe(false)
    expect(useEditStore.getState().intents).toHaveLength(0)
  })

  it('removeIntent 가 ID 로 삭제한다', () => {
    const { addIntent, removeIntent } = useEditStore.getState()
    const r = addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })
    removeIntent(r.intent.id)
    expect(useEditStore.getState().intents).toHaveLength(0)
  })

  it('clearIntents 가 모두 비운다', () => {
    const { addIntent, clearIntents } = useEditStore.getState()
    addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })
    addIntent({ kind: 'deleteGroup', params: { groupId: 0 } })
    clearIntents()
    expect(useEditStore.getState().intents).toHaveLength(0)
  })

  it('buildExportPayload 가 stageRef 와 intents 를 함께 담는다', () => {
    const { addIntent, buildExportPayload } = useEditStore.getState()
    addIntent({ kind: 'addRigid', params: { independentNode: 3, dependentNodes: [4] } })
    const payload = buildExportPayload()
    expect(payload.intents).toHaveLength(1)
    expect(payload.stageRef?.phase).toBe('C')
  })

  it('exportToFile 빈 목록이면 ok=false', async () => {
    const { exportToFile } = useEditStore.getState()
    const r = await exportToFile()
    expect(r.ok).toBe(false)
  })

  it('exportToFile 이 download 클릭을 트리거한다 (sourceFileName 기반 파일명)', async () => {
    const { addIntent, exportToFile } = useEditStore.getState()
    // sourceFileName 을 부여 — fileLoader 가 실제 파이프라인에서 set 하는 형태
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })

    // 노드 환경에는 document/URL.createObjectURL 가 없으므로 가짜로 주입
    const clickSpy = vi.fn()
    const fakeAnchor = { href: '', download: '', click: clickSpy, remove: vi.fn() }
    const fakeBody = { appendChild: vi.fn() }
    const origDocument = globalThis.document
    const origUrlCtor = globalThis.URL?.createObjectURL
    const origUrlRev  = globalThis.URL?.revokeObjectURL

    globalThis.document = {
      createElement: vi.fn(() => fakeAnchor),
      body: fakeBody,
    }
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
    globalThis.URL.revokeObjectURL = vi.fn()

    try {
      const r = await exportToFile()
      expect(r.ok).toBe(true)
      expect(r.fileName).toBe('06_Validation_edit.json')
      expect(r.location).toBe('download')
      expect(clickSpy).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.document = origDocument
      if (origUrlCtor) globalThis.URL.createObjectURL = origUrlCtor
      else delete globalThis.URL.createObjectURL
      if (origUrlRev) globalThis.URL.revokeObjectURL = origUrlRev
      else delete globalThis.URL.revokeObjectURL
    }
  })

  it('exportToFile 가 sourceFolderRef 가 있으면 host.writeFile 로 폴더에 직접 쓴다', async () => {
    const { addIntent, exportToFile } = useEditStore.getState()
    addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })

    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    // host 를 mock 으로 교체 — folderRef 는 호스트에 그대로 전달되는 불투명 객체
    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({
      name: 'mock',
      pickFolder: vi.fn(),
      getInitialFolder: vi.fn(),
      writeFile: writeFileSpy,
    })

    const fakeFolderRef = { __mock: true }
    useStageStore.setState({ sourceFolderRef: fakeFolderRef })

    const r = await exportToFile()
    expect(r.ok).toBe(true)
    expect(r.location).toBe('folder')
    expect(r.fileName).toBe('06_Validation_edit.json')
    expect(writeFileSpy).toHaveBeenCalledTimes(1)
    expect(writeFileSpy).toHaveBeenCalledWith(
      fakeFolderRef,
      '06_Validation_edit.json',
      expect.any(String),
    )
    // payload 가 JSON 문자열로 직렬화되었는지 확인
    const passedJson = writeFileSpy.mock.calls[0][2]
    expect(JSON.parse(passedJson).intents).toHaveLength(1)

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportToFile: host.writeFile 실패 시 download 폴백으로 떨어진다', async () => {
    const { addIntent, exportToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'
    addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })

    setHost({
      name: 'mock',
      pickFolder: vi.fn(),
      getInitialFolder: vi.fn(),
      writeFile: vi.fn(async () => ({ ok: false, error: '권한 거절' })),
    })
    useStageStore.setState({ sourceFolderRef: { __mock: true } })

    const clickSpy = vi.fn()
    const fakeAnchor = { href: '', download: '', click: clickSpy, remove: vi.fn() }
    const origDocument = globalThis.document
    const origUrlCtor = globalThis.URL?.createObjectURL
    const origUrlRev  = globalThis.URL?.revokeObjectURL
    globalThis.document = { createElement: vi.fn(() => fakeAnchor), body: { appendChild: vi.fn() } }
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
    globalThis.URL.revokeObjectURL = vi.fn()

    try {
      const r = await exportToFile()
      expect(r.ok).toBe(true)
      expect(r.location).toBe('download')
      expect(clickSpy).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.document = origDocument
      if (origUrlCtor) globalThis.URL.createObjectURL = origUrlCtor
      else delete globalThis.URL.createObjectURL
      if (origUrlRev) globalThis.URL.revokeObjectURL = origUrlRev
      else delete globalThis.URL.revokeObjectURL
      useStageStore.setState({ sourceFolderRef: null })
    }
  })

  it('importFromJson 으로 export → import round-trip', () => {
    const { addIntent, buildExportPayload, importFromJson, clearIntents } = useEditStore.getState()
    addIntent({ kind: 'addRigid', params: { independentNode: 3, dependentNodes: [4], remark: 'UBOLT' } })
    addIntent({ kind: 'deleteGroup', params: { groupId: 0, memberNodeCount: 4 } })
    const payload = buildExportPayload()

    clearIntents()
    expect(useEditStore.getState().intents).toHaveLength(0)

    const r = importFromJson(payload)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(2)
    const restored = useEditStore.getState().intents
    expect(restored).toHaveLength(2)
    expect(restored[0].params.independentNode).toBe(3)
    expect(restored[1].params.groupId).toBe(0)
  })

  it('importFromJson 이 잘못된 JSON 을 거절한다', () => {
    const { importFromJson } = useEditStore.getState()
    const r = importFromJson('not-json{')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('JSON')
  })

  // ── Phase 3: 다중 노드 선택 ──────────────────────────────────────
  it('toggleNodeSelection 이 노드를 추가/제거한다', () => {
    const { toggleNodeSelection } = useEditStore.getState()
    toggleNodeSelection(1)
    toggleNodeSelection(2)
    toggleNodeSelection(3)
    expect(useEditStore.getState().pendingNodeSelection).toEqual([1, 2, 3])
    toggleNodeSelection(2)   // 토글 → 제거
    expect(useEditStore.getState().pendingNodeSelection).toEqual([1, 3])
  })

  it('clearNodeSelection 이 모두 비운다', () => {
    const { toggleNodeSelection, clearNodeSelection } = useEditStore.getState()
    toggleNodeSelection(1); toggleNodeSelection(2)
    clearNodeSelection()
    expect(useEditStore.getState().pendingNodeSelection).toEqual([])
  })

  it('편집 모드 OFF 시 다중 선택이 자동으로 비워진다', () => {
    const { toggleEnabled, toggleNodeSelection } = useEditStore.getState()
    toggleEnabled()                  // 켜기
    toggleNodeSelection(1)
    toggleNodeSelection(2)
    expect(useEditStore.getState().pendingNodeSelection).toHaveLength(2)
    toggleEnabled()                  // 끄기 → 자동 clear
    expect(useEditStore.getState().pendingNodeSelection).toEqual([])
  })
})
