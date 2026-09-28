import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEditStore, getHoistMaxGroups, getHoistDefaultWireLengthM, buildPostureStabilityPayload, buildHoistPartitionInput, resolveModelCog } from './useEditStore.js'
import { useStageStore } from './useStageStore.js'
import { useStabilityStore } from './useStabilityStore.js'
import { StageData } from '../data/StageData.js'
import { useUnitStructuralStore } from './useUnitStructuralStore.js'
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

describe('buildPostureStabilityPayload — 배관 유체 비움 시 무게중심', () => {
  // pointMass 만으로 fallback CoG = (100,0,0) 이 되는 최소 stage.
  const makePmStage = () => ({
    nodeMap: new Map([[1, { id: 1, x: 100, y: 0, z: 0 }]]),
    pointMasses: [{ nodeId: 1, mass: 2 }],
    elements: [],
    meta: {},
  })
  const hoisting = { mode: 'single', groupCount: 0, wireLengthM: null, groups: [] }

  afterEach(() => {
    useStageStore.setState({ stageSummary: null, pipeFluidEmptied: false })
  })

  it('pipeFluidEmptied=false 면 stageSummary(유체 포함) CoG 를 그대로 사용', () => {
    const stage = makePmStage()
    useStageStore.setState({
      stageSummary: { massProperties: { totalMassTon: 99, centerOfGravityMm: { x: 9999, y: 0, z: 0 } } },
      pipeFluidEmptied: false,
    })
    const payload = buildPostureStabilityPayload({}, hoisting, stage, null)
    expect(payload.model.centerOfGravityMm.x).toBe(9999)
    expect(payload.model.massSource).toBe('stageSummary')
  })

  it('pipeFluidEmptied=true 면 stale stageSummary 무시하고 비워진 stage 로 재계산', () => {
    const stage = makePmStage()
    useStageStore.setState({
      stageSummary: { massProperties: { totalMassTon: 99, centerOfGravityMm: { x: 9999, y: 0, z: 0 } } },
      pipeFluidEmptied: true,
    })
    const payload = buildPostureStabilityPayload({}, hoisting, stage, null)
    expect(payload.model.centerOfGravityMm.x).toBe(100)        // fallback(=비워진 stage) 결과
    expect(payload.model.massSource).toMatch(/^computed/)       // stageSummary 가 아님
  })
})

describe('buildPostureStabilityPayload — 4점 형상 선호(shapePreference) 직렬화', () => {
  const stage = { nodeMap: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }]]), pointMasses: [], elements: [], meta: {} }
  const hoisting = { mode: 'single', groupCount: 0, wireLengthM: null, groups: [] }
  afterEach(() => { useStageStore.setState({ stageSummary: null, pipeFluidEmptied: false, modelRotated: false }) })

  it('line/quad 지정 시 그대로 전달', () => {
    const pL = buildPostureStabilityPayload({ hoistOptimization: { regions: [], shapePreference: 'line' } }, hoisting, stage, null)
    expect(pL.hoistOptimization.shapePreference).toBe('line')
    const pQ = buildPostureStabilityPayload({ hoistOptimization: { regions: [], shapePreference: 'quad' } }, hoisting, stage, null)
    expect(pQ.hoistOptimization.shapePreference).toBe('quad')
  })

  it('미지정/알 수 없는 값이면 auto 로 폴백', () => {
    const pNone = buildPostureStabilityPayload({ hoistOptimization: { regions: [] } }, hoisting, stage, null)
    expect(pNone.hoistOptimization.shapePreference).toBe('auto')
    const pBad = buildPostureStabilityPayload({ hoistOptimization: { regions: [], shapePreference: 'weird' } }, hoisting, stage, null)
    expect(pBad.hoistOptimization.shapePreference).toBe('auto')
  })

  it('구역별 shape 를 region 마다 보존(quad/line 유효, 그 외 auto) — 사용자 규칙 2026-07-03', () => {
    const regions = [
      { id: 'zone-0-0', groupId: 1, requestedPointCount: 4, shape: 'quad', nodeIds: [1] },
      { id: 'zone-0-1', groupId: 2, requestedPointCount: 4, shape: 'line', nodeIds: [1] },
      { id: 'zone-1-0', groupId: 3, requestedPointCount: -1, shape: 'auto', nodeIds: [1] },
      { id: 'zone-1-1', groupId: 4, requestedPointCount: 2, shape: 'weird', nodeIds: [1] },
    ]
    const p = buildPostureStabilityPayload({ hoistOptimization: { regions } }, hoisting, stage, null)
    const out = p.hoistOptimization.regions
    expect(out.map(r => r.shape)).toEqual(['quad', 'line', 'auto', 'auto'])
    expect(out[0]).toMatchObject({ groupId: 1, requestedPointCount: 4, shape: 'quad' })
  })
})

describe('resolveModelCog — 뷰어 노란 COG 마커와 동일 우선순위', () => {
  // pointMass 만 있는 stage → point-mass 질량중심 = (500,200,0)
  const stageWithPm = () => ({ nodeMap: new Map([[1, { id: 1, x: 500, y: 200, z: 0 }]]), pointMasses: [{ nodeId: 1, mass: 5 }], elements: [], meta: {} })
  beforeEach(() => {
    useStageStore.setState({ stageSummary: null, pipeFluidEmptied: false, modelRotated: false })
    useStabilityStore.setState({ report: null })
  })
  afterEach(() => {
    useStageStore.setState({ stageSummary: null, pipeFluidEmptied: false, modelRotated: false })
    useStabilityStore.setState({ report: null })
  })

  it('stageSummary 있으면 그 COG 사용', () => {
    useStageStore.setState({ stageSummary: { massProperties: { centerOfGravityMm: { x: 11, y: 22, z: 33 } } } })
    expect(resolveModelCog(stageWithPm())).toEqual({ x: 11, y: 22, z: 33 })
  })

  it('stageSummary 없고 stabilityReport.input 있으면 그 COG(★버그 수정 핵심)', () => {
    useStabilityStore.setState({ report: { input: { centerOfGravityMm: { x: 7, y: 8, z: 9 } } } })
    expect(resolveModelCog(stageWithPm())).toEqual({ x: 7, y: 8, z: 9 })
  })

  it('stabilityReport.model 도 소스로 사용', () => {
    useStabilityStore.setState({ report: { model: { centerOfGravityMm: { x: 1, y: 2, z: 3 } } } })
    expect(resolveModelCog(stageWithPm())).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('summary/stability 모두 없으면 포인트질량 질량중심으로 폴백(≠ 기하 중심)', () => {
    expect(resolveModelCog(stageWithPm())).toEqual({ x: 500, y: 200, z: 0 })
  })

  it('회전 시 stale summary 무시하고 mutated stage 재계산', () => {
    useStageStore.setState({ modelRotated: true, stageSummary: { massProperties: { centerOfGravityMm: { x: 999, y: 999, z: 999 } } } })
    const cog = resolveModelCog(stageWithPm())
    expect(cog.x).toBeCloseTo(500)
    expect(cog.y).toBeCloseTo(200)
  })
})

describe('useEditStore', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
    setHost(null) // 다음 getHost() 시 환경 재감지 — 기본은 WebHost
  })

  afterEach(() => {
    useStageStore.setState({ stages: [] })
    useStabilityStore.getState().reset()
    setHost(null)
  })

  it('기본 상태는 비활성·빈 목록', () => {
    const s = useEditStore.getState()
    expect(s.enabled).toBe(false)
    expect(s.intents).toEqual([])
    expect(s.selectedIntentId).toBeNull()
  })

  it('reset() — 모든 권상/표시 상태 필드를 기본값으로 복원한다 (showHoistPlate 포함 회귀 가드)', () => {
    // 여러 필드를 비기본값으로 오염시킨 뒤 reset() 이 전부 되돌리는지 검증.
    // (과거 reset() 이 showHoistPlate 를 빠뜨려, 가상판을 끈 뒤 초기화해도 꺼진 상태가 잔류했다.)
    useEditStore.setState({
      showHoistPlate: false,
      circleGuideEnabled: true,
      hoistCircleTolMm: 123,
      hoistToleranceMm: 50,
      pipeDiameterThreshold: 99,
      wireLengthM: 3,
      hoistGroupCount: 3,
      activeHoistGroupId: 2,
      hoistGroups: { 1: [1, 2], 2: [3], 3: [], 4: [] },
      hoistGuide: { id: 5, message: 'x', kind: 'info' },
    })
    useEditStore.getState().reset()
    const s = useEditStore.getState()
    expect(s.showHoistPlate).toBe(true)
    expect(s.circleGuideEnabled).toBe(false)
    expect(s.hoistCircleTolMm).toBeNull()
    expect(s.hoistToleranceMm).toBeNull()
    expect(s.pipeDiameterThreshold).toBeNull()
    expect(s.wireLengthM).toBe(getHoistDefaultWireLengthM('hydro'))
    expect(s.hoistGroupCount).toBe(1)
    expect(s.activeHoistGroupId).toBe(1)
    expect(s.hoistGroups).toEqual({ 1: [], 2: [], 3: [], 4: [] })
    expect(s.hoistGuide).toBeNull()
  })

  it('exportEditedBdf — host.exportUnitBdf 없으면 안내 반환', async () => {
    // beforeEach 에서 setHost(null) → WebHost(exportUnitBdf 없음)
    const r = await useEditStore.getState().exportEditedBdf()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/WorkBench 앱/)
  })

  it('exportEditedBdf — host.exportUnitBdf 에 편집 반영 JSON+파일명 전달', async () => {
    let captured = null
    setHost({ name: 'electron', exportUnitBdf: async (a) => { captured = a; return { ok: true, savedPath: 'C:/x.bdf' } } })
    const r = await useEditStore.getState().exportEditedBdf()
    expect(r.ok).toBe(true)
    expect(captured.fileName).toMatch(/\.json$/)
    const parsed = JSON.parse(captured.content)
    expect(Array.isArray(parsed.nodes)).toBe(true)
    expect(Array.isArray(parsed.elements)).toBe(true)
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

  it('권상 방식과 그룹 노드를 export payload 에 담는다', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode, buildExportPayload } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(2)
    setActiveHoistGroup(1)
    addHoistNode(1)
    addHoistNode(2)
    setActiveHoistGroup(2)
    addHoistNode(3)
    addHoistNode(4)

    const payload = buildExportPayload()
    expect(payload.hoisting.mode).toMatchObject({ id: 'hydro', equipment: 'Hook' })
    expect(payload.hoisting.groupCount).toBe(2)
    expect(payload.hoisting.groups).toEqual([
      { id: 1, nodeIds: [1, 2] },
      { id: 2, nodeIds: [3, 4] },
    ])
  })

  it('권상 그룹은 그룹당 최대 4개이며 노드는 한 그룹에만 속한다', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode } = useEditStore.getState()
    setHoistMode('goliat')
    setHoistGroupCount(2)
    setActiveHoistGroup(1)
    addHoistNode(1); addHoistNode(2); addHoistNode(3); addHoistNode(4)
    addHoistNode(999)
    expect(useEditStore.getState().hoistGroups[1]).toEqual([1, 2, 3, 4])

    setActiveHoistGroup(2)
    addHoistNode(2)
    expect(useEditStore.getState().hoistGroups[1]).toEqual([1, 3, 4])
    expect(useEditStore.getState().hoistGroups[2]).toEqual([2])
  })

  it('applyAutoHoistGroups 는 자동 선정 결과를 실제 권상 그룹에 적용한다', () => {
    const { setHoistMode, applyAutoHoistGroups } = useEditStore.getState()
    setHoistMode('hydro')
    const r = applyAutoHoistGroups([[1, 2], [3, 4]])
    expect(r.ok).toBe(true)
    expect(r.appliedGroupCount).toBe(2)
    const s = useEditStore.getState()
    expect(s.hoistGroupCount).toBe(2)
    expect(s.activeHoistGroupId).toBe(1)
    expect(s.hoistGroups[1]).toEqual([1, 2])
    expect(s.hoistGroups[2]).toEqual([3, 4])
  })

  it('applyAutoHoistGroups 는 모드별 제한과 유효 노드만 반영한다', () => {
    const { setHoistMode, applyAutoHoistGroups } = useEditStore.getState()
    setHoistMode('ceiling')
    const r = applyAutoHoistGroups([[1, 2], [1, 2, 3, 4, 999]])
    expect(r.ok).toBe(true)
    expect(r.appliedGroupCount).toBe(1)
    expect(r.skippedGroupCount).toBe(1)
    expect(useEditStore.getState().hoistGroupCount).toBe(1)
    expect(useEditStore.getState().hoistGroups[1]).toEqual([1, 2, 3, 4])
    expect(useEditStore.getState().hoistGroups[2]).toEqual([])
  })

  it('권상 그룹 개수를 줄이면 비활성 그룹을 비운다', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(3)
    setActiveHoistGroup(3)
    addHoistNode(1)
    addHoistNode(2)
    setHoistGroupCount(1)
    expect(useEditStore.getState().activeHoistGroupId).toBe(1)
    expect(useEditStore.getState().hoistGroups[3]).toEqual([])
  })

  it('setHoistGroupCount 가 그룹을 추가하면 새 그룹을 자동 활성화', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(1)
    setActiveHoistGroup(1)
    expect(useEditStore.getState().activeHoistGroupId).toBe(1)

    setHoistGroupCount(2)
    expect(useEditStore.getState().hoistGroupCount).toBe(2)
    expect(useEditStore.getState().activeHoistGroupId).toBe(2)   // 새로 추가된 그룹 활성

    setHoistGroupCount(4)
    expect(useEditStore.getState().activeHoistGroupId).toBe(4)   // 이번에도 새 그룹 활성

    // 줄이는 경우는 nextCount 로 클램프 (기존 정책 유지)
    setHoistGroupCount(2)
    expect(useEditStore.getState().activeHoistGroupId).toBe(2)
  })

  it('Hydro 는 최대 4그룹, Goliat 은 최대 3그룹, 천장 Crane 은 1그룹 고정', () => {
    expect(getHoistMaxGroups('hydro')).toBe(4)
    expect(getHoistMaxGroups('goliat')).toBe(3)
    expect(getHoistMaxGroups('ceiling')).toBe(1)
    expect(getHoistMaxGroups(null)).toBe(4)
  })

  it('Hydro 에서 setHoistGroupCount(5) 는 4 로 클램프된다', () => {
    const { setHoistMode, setHoistGroupCount } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(5)
    expect(useEditStore.getState().hoistGroupCount).toBe(4)
  })

  it('Goliat 에서 setHoistGroupCount(4) 는 3 으로 클램프된다', () => {
    const { setHoistMode, setHoistGroupCount } = useEditStore.getState()
    setHoistMode('goliat')
    setHoistGroupCount(4)
    expect(useEditStore.getState().hoistGroupCount).toBe(3)
  })

  it('Hydro 에서 4그룹까지 채운 뒤 Goliat 으로 전환하면 그룹 4 가 비워지고 카운트가 3으로 클램프', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(4)
    setActiveHoistGroup(4)
    addHoistNode(1); addHoistNode(2)
    expect(useEditStore.getState().hoistGroups[4]).toEqual([1, 2])

    setHoistMode('goliat')
    const s = useEditStore.getState()
    expect(s.hoistGroupCount).toBe(3)
    expect(s.activeHoistGroupId).toBe(3)
    expect(s.hoistGroups[4]).toEqual([])
  })

  it('Hydro→Goliat→Hydro 왕복 시 그룹 1·2 데이터와 카운트가 모두 보존된다', () => {
    // 사용자 보고 시나리오: 모드 왕복으로 그룹 2 가 panel 에서 사라지고
    // viewer 에는 도형만 남는 mismatch 가 발생하면 안 된다.
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(2)
    setActiveHoistGroup(1); addHoistNode(1); addHoistNode(2)
    setActiveHoistGroup(2); addHoistNode(3); addHoistNode(4)

    setHoistMode('goliat')
    setHoistMode('hydro')
    const s = useEditStore.getState()
    expect(s.hoistGroupCount).toBe(2)
    expect(s.hoistGroups[1]).toEqual([1, 2])
    expect(s.hoistGroups[2]).toEqual([3, 4])
  })

  it('setHoistMode 호출 시 데이터를 가진 max 그룹 ID 까지 hoistGroupCount 가 자동 보정된다', () => {
    // 어떤 경로로든 hoistGroupCount < lastFilledGroupId 인 mismatch 가 만들어졌을 때,
    // 다음 setHoistMode 가 자동으로 카운트를 끌어올려 panel ↔ viewer 동기화를 회복.
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(2)
    setActiveHoistGroup(2); addHoistNode(3); addHoistNode(4)

    // 인위적 mismatch — hoistGroupCount 만 1 로 떨어뜨리고 hoistGroups[2] 데이터는 유지.
    useEditStore.setState({ hoistGroupCount: 1 })
    expect(useEditStore.getState().hoistGroups[2]).toEqual([3, 4])

    setHoistMode('hydro')   // 같은 모드로 재호출 → invariant 자동 보정
    const s = useEditStore.getState()
    expect(s.hoistGroupCount).toBe(2)
    expect(s.hoistGroups[2]).toEqual([3, 4])
  })

  it('removeHoistGroup 은 가운데 그룹 삭제 시 뒷 그룹을 한 칸씩 당겨온다', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode, removeHoistGroup } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(4)
    setActiveHoistGroup(1); addHoistNode(1)
    setActiveHoistGroup(2); addHoistNode(2)
    setActiveHoistGroup(3); addHoistNode(3)
    setActiveHoistGroup(4); addHoistNode(4)

    removeHoistGroup(2)   // 그룹 2 삭제 → 그룹 3 → 2, 그룹 4 → 3
    const s = useEditStore.getState()
    expect(s.hoistGroupCount).toBe(3)
    expect(s.hoistGroups[1]).toEqual([1])
    expect(s.hoistGroups[2]).toEqual([3])   // 옛 그룹 3
    expect(s.hoistGroups[3]).toEqual([4])   // 옛 그룹 4
    expect(s.hoistGroups[4]).toEqual([])
    // 활성이 4였다 → 한 칸 당겨와 3
    expect(s.activeHoistGroupId).toBe(3)
  })

  it('removeHoistGroup 은 활성 그룹 삭제 시 같은 자리(또는 마지막)로 활성 이동', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, removeHoistGroup } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(3)
    setActiveHoistGroup(2)
    removeHoistGroup(2)
    expect(useEditStore.getState().activeHoistGroupId).toBe(2)   // 옛 그룹 3 이 새 그룹 2 로 이동, 활성도 2 유지

    setHoistGroupCount(2)
    setActiveHoistGroup(2)
    removeHoistGroup(2)   // 마지막 그룹 삭제 + 활성도 그것
    expect(useEditStore.getState().hoistGroupCount).toBe(1)
    expect(useEditStore.getState().activeHoistGroupId).toBe(1)
  })

  it('removeHoistGroup 은 마지막 1개 그룹은 삭제하지 않는다', () => {
    const { setHoistMode, setHoistGroupCount, removeHoistGroup } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(1)
    removeHoistGroup(1)
    expect(useEditStore.getState().hoistGroupCount).toBe(1)
  })

  it('resetHoistPoints: 모든 그룹 노드 비우기 + 그룹수/활성 1, 방식·Wire 길이 유지', () => {
    useEditStore.setState({
      hoistMode: 'goliat',
      hoistGroupCount: 3,
      activeHoistGroupId: 3,
      hoistGroups: { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [] },
      wireLengthM: 24,
    })
    useEditStore.getState().resetHoistPoints()
    const s = useEditStore.getState()
    expect(s.hoistGroups).toEqual({ 1: [], 2: [], 3: [], 4: [] })
    expect(s.hoistGroupCount).toBe(1)
    expect(s.activeHoistGroupId).toBe(1)
    expect(s.hoistMode).toBe('goliat')   // 권상 방식 유지
    expect(s.wireLengthM).toBe(24)       // Wire 길이 유지
  })

  it('Goliat 에서 setActiveHoistGroup(4) 는 무시된다', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup } = useEditStore.getState()
    setHoistMode('goliat')
    setHoistGroupCount(3)   // 새 정책상 active=3 으로 자동 활성화됨
    setActiveHoistGroup(4)  // 상한 초과 — 무시 (active 그대로 3)
    expect(useEditStore.getState().activeHoistGroupId).toBe(3)
  })

  it('flashHoistGuide 는 메시지를 set 하고 dismissHoistGuide 가 비운다', () => {
    const { flashHoistGuide, dismissHoistGuide } = useEditStore.getState()
    expect(useEditStore.getState().hoistGuide).toBeNull()
    flashHoistGuide('권상 방식을 선택하세요', 'noMode')
    const g = useEditStore.getState().hoistGuide
    expect(g?.message).toBe('권상 방식을 선택하세요')
    expect(g?.kind).toBe('noMode')
    expect(g?.id).toBe(1)

    flashHoistGuide('다시', 'info')
    expect(useEditStore.getState().hoistGuide?.id).toBe(2)   // 재발생 시 id 증가

    dismissHoistGuide()
    expect(useEditStore.getState().hoistGuide).toBeNull()
  })

  it('flashHoistGuide 는 빈 메시지는 무시', () => {
    const { flashHoistGuide } = useEditStore.getState()
    flashHoistGuide('')
    flashHoistGuide(null)
    expect(useEditStore.getState().hoistGuide).toBeNull()
  })

  it('exportPostureStabilityToFile: 권상 설정이 없으면 ok=false', async () => {
    const { exportPostureStabilityToFile } = useEditStore.getState()
    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(false)
  })

  it('exportPostureStabilityToFile: 1 노드만 있는 그룹은 거절(최소 2개)', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    setHoistMode('hydro')
    addHoistNode(1)
    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('최소 2개')
  })

  it('exportPostureStabilityToFile: 편집 intents 없으면 1개 파일(_posture.json)만 저장', async () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    setHoistGroupCount(1)
    setActiveHoistGroup(1); addHoistNode(1); addHoistNode(2)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({
      name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy,
    })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    expect(r.results).toHaveLength(1)
    expect(r.results[0]).toMatchObject({ kind: 'posture', ok: true, fileName: '06_Validation_posture.json', location: 'folder' })

    const payload = JSON.parse(writeFileSpy.mock.calls[0][2])
    expect(payload.stageRef.editedFile).toBeNull()

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportPostureStabilityToFile: 편집 intents 있으면 _edited.json 먼저, _posture.json 두번째로 저장', async () => {
    const { setHoistMode, addHoistNode, addIntent, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)
    addIntent({ kind: 'addRigid', params: { independentNode: 3, dependentNodes: [4] } })

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({
      name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy,
    })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    expect(r.results).toHaveLength(2)
    expect(r.results[0]).toMatchObject({ kind: 'edited',  ok: true, fileName: '06_Validation_edited.json' })
    expect(r.results[1]).toMatchObject({ kind: 'posture', ok: true, fileName: '06_Validation_posture.json' })
    expect(writeFileSpy).toHaveBeenCalledTimes(2)

    // _edited.json: 추가 RBE 가 들어가 있어야
    const editedJson = JSON.parse(writeFileSpy.mock.calls[0][2])
    expect(editedJson.meta.edited).toBe(true)
    expect(editedJson.rigids.some(r => r.independentNode === 3 && r.dependentNodes.includes(4))).toBe(true)
    expect(editedJson.connectivity).toBeTruthy()
    expect(editedJson.healthMetrics).toBeTruthy()

    // _posture.json: stageRef.editedFile 로 _edited.json 가리킴
    const postureJson = JSON.parse(writeFileSpy.mock.calls[1][2])
    expect(postureJson.stageRef.editedFile).toBe('06_Validation_edited.json')

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportPostureStabilityToFile: 1단계 _edited.json 저장 실패하면 _posture 는 시도하지 않음', async () => {
    const { setHoistMode, addHoistNode, addIntent, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)
    addIntent({ kind: 'addRigid', params: { independentNode: 3, dependentNodes: [4] } })

    const writeFileSpy = vi.fn(async () => ({ ok: false, error: '디스크 가득' }))
    setHost({
      name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy,
    })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('편집 모델 저장 실패')
    expect(r.results).toHaveLength(1)
    expect(writeFileSpy).toHaveBeenCalledTimes(1)   // 폴백(picker/download) 가 없는 환경이라 한 번에 끝

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportPostureStabilityToFile: stageSummary 가 없으면 PointMass 합산으로 totalMassTon 폴백 (massSource = computed:pointMassOnly)', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'
    // 픽스처 stage 에는 PointMass 가 없으니 직접 주입 — node 1 (0,0,0) / node 3 (2000,0,0) 에 0.05 t / 0.10 t
    stage.pointMasses = [
      { id: 1, nodeId: 1, mass: 0.05, sourceName: 'pmA' },
      { id: 2, nodeId: 3, mass: 0.10, sourceName: 'pmB' },
    ]

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy })
    useStageStore.setState({ sourceFolderRef: '/some/folder', stageSummary: null })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    const payload = JSON.parse(writeFileSpy.mock.calls[0][2])
    expect(payload.model.totalMassTon).toBeCloseTo(0.15, 6)
    // 가중 평균: (0.05*0 + 0.10*2000) / 0.15 = 1333.33
    expect(payload.model.centerOfGravityMm.x).toBeCloseTo(1333.333, 2)
    expect(payload.model.massSource).toBe('computed:pointMassOnly')

    useStageStore.setState({ sourceFolderRef: null })
    stage.pointMasses = []
  })

  it('exportPostureStabilityToFile: stageSummary 가 있으면 우선 사용 (massSource = stageSummary)', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy })
    useStageStore.setState({
      sourceFolderRef: '/some/folder',
      stageSummary: { massProperties: { totalMassTon: 102.5, centerOfGravityMm: { x: 100, y: 200, z: 300 } } },
    })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    const payload = JSON.parse(writeFileSpy.mock.calls[0][2])
    expect(payload.model.totalMassTon).toBe(102.5)
    expect(payload.model.centerOfGravityMm).toEqual({ x: 100, y: 200, z: 300 })
    expect(payload.model.massSource).toBe('stageSummary')

    useStageStore.setState({ sourceFolderRef: null, stageSummary: null })
  })

  it('exportPostureStabilityToFile: PointMass 도 없고 stageSummary 도 없으면 massSource=unavailable', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'
    stage.pointMasses = []
    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy })
    useStageStore.setState({ sourceFolderRef: '/some/folder', stageSummary: null })

    const r = await exportPostureStabilityToFile()
    const payload = JSON.parse(writeFileSpy.mock.calls[0][2])
    expect(payload.model.totalMassTon).toBeNull()
    expect(payload.model.centerOfGravityMm).toBeNull()
    expect(payload.model.massSource).toBe('unavailable')

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportPostureStabilityToFile: host.uploadEvaluationArtifact 가 있으면 두 파일 모두 백엔드로 업로드', async () => {
    const { setHoistMode, addHoistNode, addIntent, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)
    addIntent({ kind: 'addRigid', params: { independentNode: 3, dependentNodes: [4] } })

    const uploadSpy = vi.fn(async (name) => ({ ok: true, location: 'backend', remotePath: `/uc/u1/${name}` }))
    const writeFileSpy = vi.fn()
    setHost({
      name: 'electron',
      pickFolder: vi.fn(), getInitialFolder: vi.fn(),
      writeFile: writeFileSpy,
      uploadEvaluationArtifact: uploadSpy,
    })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    expect(r.results).toHaveLength(2)
    expect(r.results.every(x => x.location === 'backend')).toBe(true)
    expect(uploadSpy).toHaveBeenCalledTimes(2)
    expect(writeFileSpy).not.toHaveBeenCalled()

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('와이어 길이 기본값은 Hydro 8m / Goliat 24m / 천장 Crane 5m / null 모드는 null', () => {
    expect(getHoistDefaultWireLengthM('hydro')).toBe(8)
    expect(getHoistDefaultWireLengthM('goliat')).toBe(24)
    expect(getHoistDefaultWireLengthM('ceiling')).toBe(5)
    expect(getHoistDefaultWireLengthM(null)).toBeNull()
  })

  // ── 천장 Crane (ceiling) 모드 전용 규칙 ────────────────────────────
  it('ceiling 모드는 그룹 1개 고정 — setHoistGroupCount(3) 시 1로 클램프', () => {
    const { setHoistMode, setHoistGroupCount } = useEditStore.getState()
    setHoistMode('ceiling')
    setHoistGroupCount(3)
    expect(useEditStore.getState().hoistGroupCount).toBe(1)
    expect(useEditStore.getState().activeHoistGroupId).toBe(1)
  })

  it('ceiling 으로 전환 시 와이어 길이가 5m 로 자동 설정', () => {
    const { setHoistMode } = useEditStore.getState()
    setHoistMode('ceiling')
    expect(useEditStore.getState().hoistMode).toBe('ceiling')
    expect(useEditStore.getState().wireLengthM).toBe(5)
  })

  it('Hydro 다중 그룹에서 ceiling 으로 전환 시 그룹 2/3/4 가 비워지고 그룹 1만 남는다', () => {
    const { setHoistMode, setHoistGroupCount, setActiveHoistGroup, addHoistNode } = useEditStore.getState()
    setHoistMode('hydro')
    setHoistGroupCount(3)
    // 노드는 한 그룹에만 속하므로(addHoistNode 정책) 서로 다른 노드를 분배.
    setActiveHoistGroup(1); addHoistNode(1); addHoistNode(2)
    setActiveHoistGroup(2); addHoistNode(3)
    setActiveHoistGroup(3); addHoistNode(4)

    setHoistMode('ceiling')
    const s = useEditStore.getState()
    expect(s.hoistMode).toBe('ceiling')
    expect(s.hoistGroupCount).toBe(1)
    expect(s.activeHoistGroupId).toBe(1)
    expect(s.hoistGroups[1]).toEqual([1, 2])   // 그룹 1 노드는 보존
    expect(s.hoistGroups[2]).toEqual([])
    expect(s.hoistGroups[3]).toEqual([])
    expect(s.hoistGroups[4]).toEqual([])
  })

  it('exportPostureStabilityToFile: ceiling 모드는 그룹당 노드 2개를 거절(최소 3개)', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    setHoistMode('ceiling')
    addHoistNode(1); addHoistNode(2)
    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('최소 3개')
  })

  it('exportPostureStabilityToFile: ceiling 모드는 노드 3개부터 정상 저장', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('ceiling')
    addHoistNode(1); addHoistNode(2); addHoistNode(3)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)

    const payload = JSON.parse(writeFileSpy.mock.calls[0][2])
    expect(payload.hoisting.mode).toMatchObject({ id: 'ceiling', equipment: 'Crane' })
    expect(payload.hoisting.groupCount).toBe(1)
    expect(payload.hoisting.wireLengthM).toBe(5)
    expect(payload.hoisting.groups).toHaveLength(1)
    // posture.json 그룹 스키마: { id, nodeCount, nodes:[{id,x,y,z}], centroidMm }
    expect(payload.hoisting.groups[0]).toMatchObject({ id: 1, nodeCount: 3 })
    expect(payload.hoisting.groups[0].nodes.map(n => n.id)).toEqual([1, 2, 3])
    expect(payload.hoisting.groups[0].centroidMm).toEqual({ x: 1000, y: 0, z: 0 })

    useStageStore.setState({ sourceFolderRef: null })
  })

  // ── ModuleAnalysis.Cli 자동 실행 (host.runStabilityAnalysis) ───────
  it('exportPostureStabilityToFile: host.runStabilityAnalysis 가용 + folderRef 가 절대경로면 실행 후 결과를 stabilityStore 에 저장', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)

    const fakeReport = {
      meta: { schema: 'module-analysis-stability/0.1' },
      stages: [
        { id: 0, displayPolicy: 'internal', displayLabel: 'InputParser', status: 'pass', summary: {} },
        { id: 1, displayPolicy: 'user',     displayLabel: '입력 검증',   status: 'pass', summary: { groups: 1 } },
        { id: 2, displayPolicy: 'user',     displayLabel: '자세 결정',   status: 'warn', summary: { tilt: 1.2 } },
      ],
    }
    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    const runSpy = vi.fn(async (path) => ({ ok: true, report: fakeReport, stabilityPath: path.replace('_posture.json', '_stability.json'), exitCode: 0 }))
    setHost({
      name: 'electron',
      pickFolder: vi.fn(), getInitialFolder: vi.fn(),
      writeFile: writeFileSpy,
      runStabilityAnalysis: runSpy,
    })
    useStageStore.setState({ sourceFolderRef: 'C:\\data\\06_Validation' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    expect(r.stability?.ok).toBe(true)
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(runSpy).toHaveBeenCalledWith('C:\\data\\06_Validation\\06_Validation_posture.json')

    const sb = useStabilityStore.getState()
    expect(sb.report).toBe(fakeReport)
    expect(sb.overallStatus).toBe('warn')   // user-displayed 중 warn 이 있어 전체 warn
    expect(sb.error).toBeNull()
    expect(sb.panelOpen).toBe(true)
    expect(sb.stabilityPath).toBe('C:\\data\\06_Validation\\06_Validation_stability.json')

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportPostureStabilityToFile: runStabilityAnalysis 실패 시 stabilityStore 에 error 저장 (저장은 ok)', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    const runSpy = vi.fn(async () => ({ ok: false, error: '입력 파일 검증 실패', exitCode: 1, stderr: 'schema mismatch' }))
    setHost({
      name: 'electron',
      pickFolder: vi.fn(), getInitialFolder: vi.fn(),
      writeFile: writeFileSpy,
      runStabilityAnalysis: runSpy,
    })
    useStageStore.setState({ sourceFolderRef: '/srv/data/06_Validation' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)            // 저장 자체는 성공
    expect(r.stability?.ok).toBe(false)
    expect(r.stability?.exitCode).toBe(1)

    const sb = useStabilityStore.getState()
    expect(sb.report).toBeNull()
    expect(sb.error?.message).toBe('입력 파일 검증 실패')
    expect(sb.error?.exitCode).toBe(1)
    expect(sb.error?.stderr).toBe('schema mismatch')

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportPostureStabilityToFile: host.runStabilityAnalysis 미정의면 stability 자동 실행 건너뜀', async () => {
    const { setHoistMode, addHoistNode, exportPostureStabilityToFile } = useEditStore.getState()
    const stage = useStageStore.getState().stages[0]
    stage.sourceFileName = '06_Validation.json'

    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)

    const writeFileSpy = vi.fn(async () => ({ ok: true, location: 'folder' }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: writeFileSpy })
    useStageStore.setState({ sourceFolderRef: '/srv/data/06_Validation' })

    const r = await exportPostureStabilityToFile()
    expect(r.ok).toBe(true)
    expect(r.stability).toBeNull()      // 자동 실행 시도되지 않음
    expect(useStabilityStore.getState().report).toBeNull()
    expect(useStabilityStore.getState().error).toBeNull()

    useStageStore.setState({ sourceFolderRef: null })
  })

  it('importFromJson: ceiling 모드 round-trip (mode/groupCount/wire)', () => {
    const { setHoistMode, addHoistNode, buildExportPayload, importFromJson, reset } = useEditStore.getState()
    setHoistMode('ceiling')
    addHoistNode(1); addHoistNode(2); addHoistNode(3); addHoistNode(4)
    const payload = buildExportPayload()
    expect(payload.hoisting.mode.id).toBe('ceiling')
    expect(payload.hoisting.wireLengthM).toBe(5)

    reset()
    importFromJson(payload)
    const s = useEditStore.getState()
    expect(s.hoistMode).toBe('ceiling')
    expect(s.hoistGroupCount).toBe(1)
    expect(s.hoistGroups[1]).toEqual([1, 2, 3, 4])
    expect(s.wireLengthM).toBe(5)
  })

  it('setHoistMode 가 와이어 길이를 그 모드의 기본값으로 자동 리셋', () => {
    const { setHoistMode, setWireLength } = useEditStore.getState()
    setHoistMode('hydro')
    expect(useEditStore.getState().wireLengthM).toBe(8)

    setWireLength(12.5)
    expect(useEditStore.getState().wireLengthM).toBe(12.5)

    setHoistMode('goliat')
    expect(useEditStore.getState().wireLengthM).toBe(24)   // 모드 전환 시 폐기, 기본값으로

    setHoistMode(null)
    expect(useEditStore.getState().wireLengthM).toBeNull()
  })

  it('setWireLength 는 양수만 받고 0/음수/빈 문자열은 null', () => {
    const { setWireLength } = useEditStore.getState()
    setWireLength(8)
    expect(useEditStore.getState().wireLengthM).toBe(8)
    setWireLength('15.5')
    expect(useEditStore.getState().wireLengthM).toBeCloseTo(15.5)
    setWireLength(0)
    expect(useEditStore.getState().wireLengthM).toBeNull()
    setWireLength(-1)
    expect(useEditStore.getState().wireLengthM).toBeNull()
    setWireLength('')
    expect(useEditStore.getState().wireLengthM).toBeNull()
    setWireLength('abc')
    expect(useEditStore.getState().wireLengthM).toBeNull()
  })

  it('buildExportPayload 가 wireLengthM 을 hoisting 에 담는다 (Hydro 기본 8m)', () => {
    const { setHoistMode, addHoistNode, buildExportPayload } = useEditStore.getState()
    setHoistMode('hydro')
    addHoistNode(1); addHoistNode(2)
    const payload = buildExportPayload()
    expect(payload.hoisting.wireLengthM).toBe(8)
  })

  it('buildExportPayload 가 사용자 변경 wire 값을 우선 사용', () => {
    const { setHoistMode, setWireLength, addHoistNode, buildExportPayload } = useEditStore.getState()
    setHoistMode('goliat')
    setWireLength(30)
    addHoistNode(1); addHoistNode(2)
    const payload = buildExportPayload()
    expect(payload.hoisting.wireLengthM).toBe(30)
  })

  it('importFromJson 으로 와이어 길이 round-trip', () => {
    const { setHoistMode, setWireLength, addIntent, buildExportPayload, importFromJson, clearIntents } = useEditStore.getState()
    setHoistMode('hydro')
    setWireLength(11.5)
    addIntent({ kind: 'addRigid', params: { independentNode: 3, dependentNodes: [4] } })
    const payload = buildExportPayload()

    clearIntents()
    importFromJson(payload)
    expect(useEditStore.getState().wireLengthM).toBe(11.5)
  })

  it('setPipeDiameterThreshold 는 양수만 받고 0/음수/빈 문자열은 null', () => {
    const { setPipeDiameterThreshold } = useEditStore.getState()
    setPipeDiameterThreshold(80)
    expect(useEditStore.getState().pipeDiameterThreshold).toBe(80)
    setPipeDiameterThreshold('150.5')
    expect(useEditStore.getState().pipeDiameterThreshold).toBeCloseTo(150.5)
    setPipeDiameterThreshold(0)
    expect(useEditStore.getState().pipeDiameterThreshold).toBeNull()
    setPipeDiameterThreshold(-10)
    expect(useEditStore.getState().pipeDiameterThreshold).toBeNull()
    setPipeDiameterThreshold('')
    expect(useEditStore.getState().pipeDiameterThreshold).toBeNull()
    setPipeDiameterThreshold('abc')
    expect(useEditStore.getState().pipeDiameterThreshold).toBeNull()
  })

  it('exportToFile 빈 목록과 권상 설정 없음이면 ok=false', async () => {
    const { exportToFile } = useEditStore.getState()
    const r = await exportToFile()
    expect(r.ok).toBe(false)
  })

  it('exportToFile 은 Node 1개짜리 권상 그룹을 거절한다', async () => {
    const { setHoistMode, addHoistNode, exportToFile } = useEditStore.getState()
    setHoistMode('hydro')
    addHoistNode(1)
    const r = await exportToFile()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('최소 2개')
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

describe('autoSelectHoistPositions (Approach B 스윕)', () => {
  const richStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C_Final', timestamp: '20260429_120000', unit: 'mm', schemaVersion: '1.1' },
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, x: i * 100, y: (i % 3) * 100, z: 1000, tags: [] })),
    elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
    connectivity: { groupCount: 1, largestGroupNodeCount: 12, isolatedNodeCount: 0,
      groups: [{ id: 0, nodeIds: Array.from({ length: 12 }, (_, i) => i + 1), elementIds: [] }] },
    healthMetrics: { totals: { nodeCount: 12, elementCount: 0, rigidCount: 0, pointMassCount: 0,
      bbox: { minX: 0, maxX: 1100, minY: 0, maxY: 200, minZ: 1000, maxZ: 1000 } }, issues: {} },
  })

  const passReport = {
    best: {
      label: 'Hook-3g', score: 1000500, overallStatus: 'pass', groupCount: 3,
      groups: [{ nodeIds: [1, 2, 3] }, { nodeIds: [4, 5, 6] }, { nodeIds: [7, 8, 9] }],
      metrics: { stage6Status: 'pass', stage6MarginMm: 500, minSlingAngleDeg: 70, wireConflictCount: 0, failedStages: [] },
    },
    candidates: [],
  }

  const makeOptHost = (report = passReport) => ({
    name: 'electron',
    uploadEvaluationArtifact: vi.fn(async (name) => ({ ok: true, remotePath: `C:/srv/${name}` })),
    optimizeHoistPositions: vi.fn(async () => ({ ok: true, report })),
  })

  beforeEach(() => {
    useStageStore.setState({ stages: [richStage()], stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 500, y: 100, z: 1000 } } } })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
  })

  it('방식 미선택이면 실패', async () => {
    setHost(makeOptHost())
    useEditStore.getState().setHoistMode(null)   // reset() 가 hydro 로 기본 설정하므로 명시적으로 해제
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/권상 방식/)
  })

  it('옵티마이저 채널 없으면 실패(아무것도 적용 안 함)', async () => {
    setHost({ name: 'web', uploadEvaluationArtifact: vi.fn(async () => ({ ok: true, remotePath: 'C:/srv/x' })) })
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/최적화 채널/)
  })

  it('hydro: 그룹수 4..1 스윕 → 4회 호출, PASS 후보 반환', async () => {
    const host = makeOptHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(true)
    expect(host.optimizeHoistPositions).toHaveBeenCalledTimes(4)
    expect(r.hasPass).toBe(true)
    expect(r.candidates[0].overallStatus).toBe('pass')
  })

  it('ceiling: 그룹 1개 시드로 1회만 호출', async () => {
    const host = makeOptHost()
    setHost(host)
    useEditStore.getState().setHoistMode('ceiling')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(true)
    expect(host.optimizeHoistPositions).toHaveBeenCalledTimes(1)
  })

  it('반환 후보를 applyAutoHoistGroups 로 커밋하면 hoistGroups 에 반영', async () => {
    setHost(makeOptHost())
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    const { toNodeGroups } = await import('../data/hoistCandidateRank.js')
    const applied = useEditStore.getState().applyAutoHoistGroups(toNodeGroups(r.candidates[0]))
    expect(applied.ok).toBe(true)
    expect(useEditStore.getState().hoistGroups[1]).toEqual([1, 2, 3])
  })

  it('모든 호출 실패면 ok:false + 마지막 에러', async () => {
    const host = { name: 'electron',
      uploadEvaluationArtifact: vi.fn(async (name) => ({ ok: true, remotePath: `C:/srv/${name}` })),
      optimizeHoistPositions: vi.fn(async () => ({ ok: false, error: '엔진 실패' })) }
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().autoSelectHoistPositions()
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/엔진 실패/)
  })
})

describe('buildPostureStabilityPayload — 모델 회전 시 stageSummary 무시', () => {
  it('modelRotated=true 면 stageSummary 무시하고 재계산 CoG 사용', () => {
    const stage = new StageData({
      meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
      nodes: [{ id: 1, x: 100, y: 0, z: 0, tags: [] }],
      elements: [], rigids: [], properties: [], materials: [],
      pointMasses: [{ id: 1, nodeId: 1, mass: 2 }],
    })
    useStageStore.setState({
      stages: [stage], pipeFluidEmptied: false, modelRotated: true,
      stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 9999, y: 9999, z: 9999 } } },
    })
    const hoisting = { mode: 'wire', groupCount: 0, groups: [] }
    const payload = buildPostureStabilityPayload({}, hoisting, stage, null)
    expect(payload.model.centerOfGravityMm.x).toBe(100) // pointMass 위치 = 재계산 CoG
    expect(payload.model.massSource).not.toBe('stageSummary')
  })

  it('modelRotated=false 면 stageSummary CoG 사용(기존)', () => {
    const stage = new StageData({
      meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
      nodes: [{ id: 1, x: 100, y: 0, z: 0, tags: [] }],
      elements: [], rigids: [], properties: [], materials: [],
      pointMasses: [{ id: 1, nodeId: 1, mass: 2 }],
    })
    useStageStore.setState({
      stages: [stage], pipeFluidEmptied: false, modelRotated: false,
      stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 9999, y: 9999, z: 9999 } } },
    })
    const hoisting = { mode: 'wire', groupCount: 0, groups: [] }
    const payload = buildPostureStabilityPayload({}, hoisting, stage, null)
    expect(payload.model.centerOfGravityMm.x).toBe(9999)
    expect(payload.model.massSource).toBe('stageSummary')
  })
})

describe('useEditStore — 가서포트', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useUnitStructuralStore.setState({ status: null })
  })

  it('pickSupportNode 2개 → addSupportBeam intent 생성 + 선택 비움 + 구조store reset', () => {
    const s = useEditStore.getState()
    useUnitStructuralStore.setState({ status: 'Success' })  // 잠금 상태 가정
    s.toggleSupportPick()
    expect(useEditStore.getState().supportPickActive).toBe(true)
    s.pickSupportNode(1)
    expect(useEditStore.getState().supportPickNodes).toEqual([1])
    s.pickSupportNode(4)
    const st = useEditStore.getState()
    expect(st.supportPickNodes).toEqual([])
    expect(st.intents.filter(i => i.kind === 'addSupportBeam')).toHaveLength(1)
    expect(useUnitStructuralStore.getState().status).toBe(null)  // reset 됨
  })

  it('같은 노드 재클릭 → 선택 해제', () => {
    const s = useEditStore.getState()
    s.toggleSupportPick()
    s.pickSupportNode(1)
    s.pickSupportNode(1)
    expect(useEditStore.getState().supportPickNodes).toEqual([])
    expect(useEditStore.getState().intents).toHaveLength(0)
  })

  it('removeSupportBeam → intent 제거 + 구조store reset', () => {
    const s = useEditStore.getState()
    s.toggleSupportPick()
    s.pickSupportNode(1); s.pickSupportNode(4)
    const id = useEditStore.getState().intents.find(i => i.kind === 'addSupportBeam').id
    useUnitStructuralStore.setState({ status: 'Success' })
    useEditStore.getState().removeSupportBeam(id)
    expect(useEditStore.getState().intents).toHaveLength(0)
    expect(useUnitStructuralStore.getState().status).toBe(null)
  })

  it('기본 단면은 L100×100×10t (0.0.150 이전과 동일)', () => {
    expect(useEditStore.getState().supportSectionId).toBe('ANG_100x100x10')
    useEditStore.getState().addSupportBeam(1, 4)
    const p = useEditStore.getState().intents[0].params
    expect(p.sectionId).toBe('ANG_100x100x10')
    expect(p.dims).toEqual([100, 100, 10, 10])
  })

  it('setSupportSectionId 후 설치하면 그 단면의 dims 가 intent 에 박힌다', () => {
    useEditStore.getState().setSupportSectionId('ANG_130x130x12')
    const s = useEditStore.getState()
    s.toggleSupportPick()
    s.pickSupportNode(1); s.pickSupportNode(4)
    const p = useEditStore.getState().intents[0].params
    expect(p.sectionId).toBe('ANG_130x130x12')
    expect(p.dims).toEqual([130, 130, 12, 12])
  })

  // 단면 변경은 "다음에 설치할 것" 에만 걸린다 — 이미 설치한 부재를 소급해 바꾸면
  // 사용자가 의도한 규격 혼용(예: 일부만 두껍게)이 사라진다.
  it('단면을 바꿔도 이미 설치된 가서포트는 그대로다 (규격 혼용 가능)', () => {
    const s = useEditStore.getState()
    s.addSupportBeam(1, 4)                       // 기본 100×100×10t
    s.setSupportSectionId('ANG_100x100x13')
    useEditStore.getState().addSupportBeam(2, 3) // 100×100×13t
    const ids = useEditStore.getState().intents.map(i => i.params.sectionId)
    expect(ids).toEqual(['ANG_100x100x10', 'ANG_100x100x13'])
  })

  it('알 수 없는 단면 id 는 기본 단면으로 눕는다', () => {
    useEditStore.getState().setSupportSectionId('ANG_999x999x99')
    expect(useEditStore.getState().supportSectionId).toBe('ANG_100x100x10')
  })

  // ⚠ CSV 는 사용자가 CAD 로 가져가는 산출물이라 **모델 폴더에 조용히 쓰지 않는다** —
  // 저장 위치를 묻는 창(showSaveFilePicker / Electron 저장 대화상자)을 반드시 거쳐야 한다.
  it('exportSupportCsv → folderRef 가 있어도 폴더에 쓰지 않고 저장 위치를 묻는다', async () => {
    const writeFile = vi.fn(async () => ({ ok: true }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })

    let picked = null
    const chunks = []
    // 테스트 환경은 node 라 window 가 없다 — saveTextFile 의 `typeof window` 분기를 타도록 심어 준다.
    globalThis.window = { showSaveFilePicker: vi.fn(async (opts) => {
      picked = opts
      return {
        name: opts.suggestedName,
        createWritable: async () => ({ write: async (t) => chunks.push(t), close: async () => {} }),
      }
    }) }

    const s = useEditStore.getState()
    s.addSupportBeam(1, 4)
    s.setSupportSectionId('ANG_130x130x12')
    useEditStore.getState().addSupportBeam(2, 3)

    const r = await useEditStore.getState().exportSupportCsv()
    expect(r.ok).toBe(true)
    expect(r.rowCount).toBe(2)
    expect(r.location).toBe('picker')
    expect(writeFile).not.toHaveBeenCalled()                 // 폴더 무단 저장 없음
    expect(picked.suggestedName).toMatch(/^support_C_.*\.csv$/)
    const sizes = chunks[0].trim().split('\r\n').slice(1).map(l => l.split(',')[5])
    expect(sizes).toEqual(['ANG_100x100x10', 'ANG_130x130x12'])

    delete globalThis.window
    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportSupportCsv → 저장 대화상자를 취소하면 실패로 보고한다', async () => {
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: vi.fn() })
    globalThis.window = { showSaveFilePicker: vi.fn(async () => {
      const e = new Error('abort'); e.name = 'AbortError'; throw e
    }) }
    useEditStore.getState().addSupportBeam(1, 4)
    const r = await useEditStore.getState().exportSupportCsv()
    expect(r.ok).toBe(false)
    expect(r.error).toBe('취소되었습니다')
    delete globalThis.window
  })

  // Electron 에서 showSaveFilePicker 를 먼저 띄우면 0 KB 파일 + 저장창 2번이 된다(0.0.156 수정).
  it('exportSupportCsv → Electron 에서는 showSaveFilePicker 없이 다운로드 저장창 한 번만', async () => {
    setHost({ name: 'electron', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile: vi.fn() })
    const picker = vi.fn()
    globalThis.window = { showSaveFilePicker: picker }
    const click = vi.fn()
    globalThis.document = {
      createElement: () => ({ click, remove: () => {} }),
      body: { appendChild: () => {} },
    }
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:x'
    URL.revokeObjectURL = () => {}

    useEditStore.getState().addSupportBeam(1, 4)
    const r = await useEditStore.getState().exportSupportCsv()
    expect(r.ok).toBe(true)
    expect(r.location).toBe('download')
    expect(picker).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledTimes(1)

    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
    delete globalThis.window
    delete globalThis.document
  })

  // 편집 의도 JSON 은 해석 파이프라인이 다시 읽어 가는 중간 산출물이라 예전처럼 폴더에 바로 쓴다.
  it('exportToFile 은 반대로 folderRef 에 조용히 쓴다 (CSV 와 정책이 다름)', async () => {
    const writeFile = vi.fn(async () => ({ ok: true }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })
    useEditStore.getState().addSupportBeam(1, 4)
    const r = await useEditStore.getState().exportToFile()
    expect(r.ok).toBe(true)
    expect(r.location).toBe('folder')
    expect(writeFile).toHaveBeenCalledTimes(1)
    useStageStore.setState({ sourceFolderRef: null })
  })

  it('exportSupportCsv → 가서포트가 없으면 파일을 쓰지 않는다', async () => {
    const writeFile = vi.fn(async () => ({ ok: true }))
    setHost({ name: 'mock', pickFolder: vi.fn(), getInitialFolder: vi.fn(), writeFile })
    useStageStore.setState({ sourceFolderRef: '/some/folder' })
    const r = await useEditStore.getState().exportSupportCsv()
    expect(r.ok).toBe(false)
    expect(writeFile).not.toHaveBeenCalled()
    useStageStore.setState({ sourceFolderRef: null })
  })
})

describe('useEditStore — F1: 권상 재선정/재평가 시 이전 구조해석 결과 무효화', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })

  it('resetHoistPoints() 는 구조해석 결과(Success)가 있으면 무효화해 재해석 잠금(isFinished)을 푼다', () => {
    // 구조해석이 한 번 완료(Success)되면 Run 버튼이 isFinished 로 잠긴다. 권상점을 다시 잡으면
    // 그 결과는 무효이므로 resetHoistPoints 가 구조 store 를 reset 해 재해석을 허용해야 한다.
    useUnitStructuralStore.setState({ status: 'Success', result: { members: [] } })
    useEditStore.getState().resetHoistPoints()
    expect(useUnitStructuralStore.getState().status).toBe(null)   // isFinished 해제
    expect(useUnitStructuralStore.getState().result).toBe(null)
  })

  it('resetHoistPoints() 는 구조 결과가 없으면 구조 store 를 건드리지 않는다(불필요 리셋 없음)', () => {
    useUnitStructuralStore.setState({ message: 'stale' })   // status/result 없음 → 가드로 no-op
    useEditStore.getState().resetHoistPoints()
    expect(useUnitStructuralStore.getState().message).toBe('stale')
  })
})

describe('exportPostureStabilityToFile — 이중 실행 가드', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
  })

  it('자세안정성 해석이 이미 running 이면 즉시 거절 반환한다', async () => {
    useStabilityStore.setState({ running: true })
    const r = await useEditStore.getState().exportPostureStabilityToFile()
    expect(r.ok).toBe(false)
    expect(r.error).toBe('이미 실행 중입니다')
  })

  it('running=false 면 running-guard 로 거절되지 않는다 (가드 통과)', async () => {
    useStabilityStore.setState({ running: false })
    const r = await useEditStore.getState().exportPostureStabilityToFile()
    // 결과(성공/다른 사유 실패)와 무관하게 running 가드 메시지는 아니어야 한다.
    expect(r.error).not.toBe('이미 실행 중입니다')
  })
})

describe('useEditStore — P7: 일반 편집이 stale 해석 결과를 무효화', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useUnitStructuralStore.getState().reset()
    useStabilityStore.getState().reset()
  })

  // 해석 완료(Success) + 자세안정성 PASS 상태를 세팅하는 헬퍼
  const seedResults = () => {
    useUnitStructuralStore.setState({ status: 'Success', result: { members: [] } })
    useStabilityStore.setState({ report: { stages: [] }, overallStatus: 'pass' })
  }

  it('addIntent(addRigid) 는 구조해석 + 자세안정성 결과를 모두 무효화하고 stale 배너를 켠다', () => {
    seedResults()
    const res = useEditStore.getState().addIntent({
      kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] },
    })
    expect(res.ok).toBe(true)
    expect(useUnitStructuralStore.getState().status).toBe(null)     // 구조 무효화
    expect(useStabilityStore.getState().overallStatus).toBe(null)   // 자세안정성 무효화
    expect(useEditStore.getState().editStaleNotice).toBe(true)
  })

  it('addSupportBeam 은 구조해석만 무효화하고 자세안정성은 유지한다(Analysis 단계 보강)', () => {
    seedResults()
    const res = useEditStore.getState().addSupportBeam(1, 4)
    expect(res.ok).toBe(true)
    expect(useUnitStructuralStore.getState().status).toBe(null)      // 구조 무효화
    expect(useStabilityStore.getState().overallStatus).toBe('pass')  // 자세안정성 유지
  })

  it('removeIntent(모델 편집 되돌리기) 도 결과를 무효화한다', () => {
    const add = useEditStore.getState().addIntent({ kind: 'deleteGroup', params: { groupId: 0 } })
    seedResults()
    useEditStore.getState().removeIntent(add.intent.id)
    expect(useUnitStructuralStore.getState().status).toBe(null)
    expect(useStabilityStore.getState().overallStatus).toBe(null)
    expect(useEditStore.getState().editStaleNotice).toBe(true)
  })

  it('clearIntents 는 원본 복귀이므로 결과를 모두 무효화한다', () => {
    useEditStore.getState().addIntent({ kind: 'deleteGroup', params: { groupId: 0 } })
    seedResults()
    useEditStore.getState().clearIntents()
    expect(useUnitStructuralStore.getState().status).toBe(null)
    expect(useStabilityStore.getState().overallStatus).toBe(null)
    expect(useEditStore.getState().editStaleNotice).toBe(true)
  })

  it('해석 결과가 없으면 편집해도 stale 배너를 켜지 않는다(초기 편집 단계 churn 없음)', () => {
    const res = useEditStore.getState().addIntent({
      kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] },
    })
    expect(res.ok).toBe(true)
    expect(useEditStore.getState().editStaleNotice).toBe(false)
  })

  it('검증 실패(자기참조) intent 는 추가도 무효화도 하지 않는다', () => {
    seedResults()
    const res = useEditStore.getState().addIntent({
      kind: 'addRigid', params: { independentNode: 1, dependentNodes: [1] },  // 동일 노드 → error
    })
    expect(res.ok).toBe(false)
    expect(useUnitStructuralStore.getState().status).toBe('Success')  // 그대로 유지
    expect(useEditStore.getState().editStaleNotice).toBe(false)
  })

  it('clearEditStaleNotice() 와 reset() 이 stale 배너를 내린다', () => {
    useUnitStructuralStore.setState({ status: 'Success' })
    useEditStore.getState().addIntent({ kind: 'addRigid', params: { independentNode: 1, dependentNodes: [2] } })
    expect(useEditStore.getState().editStaleNotice).toBe(true)
    useEditStore.getState().clearEditStaleNotice()
    expect(useEditStore.getState().editStaleNotice).toBe(false)
    // reset 도 배너를 내린다
    useUnitStructuralStore.setState({ status: 'Success' })
    useEditStore.getState().addIntent({ kind: 'addRigid', params: { independentNode: 2, dependentNodes: [3] } })
    expect(useEditStore.getState().editStaleNotice).toBe(true)
    useEditStore.getState().reset()
    expect(useEditStore.getState().editStaleNotice).toBe(false)
  })
})

describe('zoneSelectHoistPositions', () => {
  const richStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C_Final', unit: 'mm', schemaVersion: '1.1' },
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, x: (i % 6) * 100, y: i < 6 ? 0 : 100, z: 1000, tags: [] })),
    elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
    connectivity: { groupCount: 1, largestGroupNodeCount: 12, isolatedNodeCount: 0, groups: [{ id: 0, nodeIds: Array.from({ length: 12 }, (_, i) => i + 1), elementIds: [] }] },
    healthMetrics: { totals: { nodeCount: 12, elementCount: 0, rigidCount: 0, pointMassCount: 0, bbox: { minX: 0, maxX: 500, minY: 0, maxY: 100, minZ: 1000, maxZ: 1000 } }, issues: {} },
  })
  const sparseStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
    nodes: [{ id: 1, x: 0, y: 0, z: 1000, tags: [] }],
    elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
    connectivity: { groupCount: 1, largestGroupNodeCount: 1, isolatedNodeCount: 0, groups: [{ id: 0, nodeIds: [1], elementIds: [] }] },
    healthMetrics: { totals: { nodeCount: 1, elementCount: 0, rigidCount: 0, pointMassCount: 0, bbox: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 1000, maxZ: 1000 } }, issues: {} },
  })
  // 옵티마이저(--optimize) 형태의 리포트: report.best 에 집계 후보.
  const passReport = {
    best: {
      label: 'Hook-3g', score: 1000500, overallStatus: 'pass', groupCount: 3,
      groups: [{ nodeIds: [1, 2, 3] }, { nodeIds: [4, 5, 6] }, { nodeIds: [7, 8, 9] }],
      metrics: { stage6Status: 'pass', stage6MarginMm: 500, minSlingAngleDeg: 70, wireConflictCount: 0, failedStages: [] },
    },
    candidates: [],
  }
  const makeHost = (report = passReport) => ({
    name: 'electron',
    uploadEvaluationArtifact: vi.fn(async (name) => ({ ok: true, remotePath: `C:/srv/${name}` })),
    optimizeHoistPositions: vi.fn(async () => ({ ok: true, report })),
  })
  const config = { bandAxis: 'x', bands: [1, 1], pointsPerZone: [[3], [3]], includePipe: true }

  beforeEach(() => {
    useStageStore.setState({ stages: [richStage()], stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 250, y: 50, z: 1000 } } } })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
  })
  afterEach(() => setHost(null))

  it('방식 미선택이면 실패', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode(null)
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/권상 방식/)
  })

  it('옵티마이저 채널 없으면 실패', async () => {
    setHost({ name: 'web', uploadEvaluationArtifact: vi.fn(async () => ({ ok: true, remotePath: 'C:/x' })) })
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/최적화/)
  })

  it('groupCount(=Σbands) 가 maxGroups 초과면 실패', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode('goliat')
    const r = await useEditStore.getState().zoneSelectHoistPositions({ ...config, bands: [2, 2] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/그룹 수/)
  })

  it('구역을 region 으로 옵티마이저 1회 호출, PASS 후보 반환', async () => {
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(r.hasPass).toBe(true)
    expect(host.optimizeHoistPositions).toHaveBeenCalledTimes(1)
    expect(r.candidates.length).toBeGreaterThanOrEqual(1)
    expect(r.candidates[0].overallStatus).toBe('pass')
  })

  it('엔진으로 저장되는 payload 는 regions 만 담고 desiredGroupCount 는 보내지 않는다 (엔진이 desiredGroupCount 를 regions 보다 우선 체크하므로)', async () => {
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(host.uploadEvaluationArtifact).toHaveBeenCalled()
    // posture JSON 이 업로드된 호출을 찾아 실제로 엔진에 저장된 payload 를 검사한다.
    const postureCall = host.uploadEvaluationArtifact.mock.calls.find(([name]) => /posture/i.test(name))
    expect(postureCall).toBeTruthy()
    const savedPayload = JSON.parse(postureCall[1])
    expect(Array.isArray(savedPayload.hoistOptimization.regions)).toBe(true)
    expect(savedPayload.hoistOptimization.regions.length).toBeGreaterThanOrEqual(1)
    expect(savedPayload.hoistOptimization.desiredGroupCount == null || savedPayload.hoistOptimization.desiredGroupCount <= 0).toBe(true)
    // 자동 선정(사용자 허용오차 미지정): tolMm=null 로 보내 엔진이 '용인 Z단차'(MaxZDiffMm) 기본값으로
    // 넓은 Z밴드를 클러스터링 → 같은 데크 근소 Z편차 노드를 한 그룹으로(면적 극대화).
    expect(savedPayload.hoistOptimization.tolMm).toBeNull()
  })

  it('수동 후보 허용오차(hoistToleranceMm)는 자동 추천 Z 탐색과 분리한다', async () => {
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    useEditStore.setState({ hoistToleranceMm: 42 })
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    const postureCall = host.uploadEvaluationArtifact.mock.calls.find(([name]) => /posture/i.test(name))
    const savedPayload = JSON.parse(postureCall[1])
    expect(savedPayload.hoistOptimization.tolMm).toBeNull()
    useEditStore.setState({ hoistToleranceMm: null })
  })

  it('buildPostureStabilityPayload: regions+tolMm 만 넘기면 desiredGroupCount 는 null, regions/tolMm 은 그대로 직렬화', () => {
    const stage = makeStageData()
    const hoisting = { mode: { id: 'hydro', label: 'Hydro 방식', equipment: 'Hook' }, groupCount: 1, wireLengthM: 8, groups: [{ id: 1, nodeIds: [1, 2, 3] }] }
    const state = {
      hoistOptimization: {
        regions: [{ groupId: 1, requestedPointCount: 3, nodeIds: [1, 2, 3] }],
        tolMm: 5,
      },
    }
    const payload = buildPostureStabilityPayload(state, hoisting, stage, null)
    expect(payload.hoistOptimization.regions.length).toBe(1)
    expect(payload.hoistOptimization.tolMm).toBe(5)
    expect(payload.hoistOptimization.desiredGroupCount).toBeNull()
  })

  it('구역에 노드가 부족하면 ok:false (옵티마이저 호출 없음)', async () => {
    useStageStore.setState({ stages: [sparseStage()], stageSummary: { massProperties: { totalMassTon: 5, centerOfGravityMm: { x: 0, y: 0, z: 1000 } } } })
    const host = makeHost()
    setHost(host)
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(false)
    expect(host.optimizeHoistPositions).not.toHaveBeenCalled()
  })

  it('반환 후보를 applyAutoHoistGroups 로 커밋', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    const { toNodeGroups } = await import('../data/hoistCandidateRank.js')
    const applied = useEditStore.getState().applyAutoHoistGroups(toNodeGroups(r.candidates[0]))
    expect(applied.ok).toBe(true)
  })

  it('report.searchTrace(camelCase) 를 반환 객체에 그대로 담는다', async () => {
    const trace = {
      threadsUsed: 8, elapsedMs: 1234, totalCombosScanned: 5000,
      layoutsAssembled: 40, layoutsBracketed: 20, layoutsEvaluated: 12,
      passCount: 1, warnCount: 0, failCount: 11,
      stageFailHistogram: { 2: 340, 6: 12 }, note: null,
      zones: [{ groupId: 1, allowedNodeCount: 6, requestedPoints: 3, zLevels: 1, combosScanned: 20, shapeValidCount: 10, keptForAssembly: 4, note: null }],
    }
    setHost(makeHost({ ...passReport, searchTrace: trace }))
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(r.searchTrace).toEqual(trace)
  })

  it('report.SearchTrace(PascalCase) 도 방어적으로 반환한다', async () => {
    const trace = { ThreadsUsed: 4, TotalCombosScanned: 999, PassCount: 0, FailCount: 5 }
    setHost(makeHost({ ...passReport, SearchTrace: trace }))
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(r.searchTrace).toEqual(trace)
  })

  it('report 에 searchTrace 가 없으면 null 을 반환한다', async () => {
    setHost(makeHost())
    useEditStore.getState().setHoistMode('hydro')
    const r = await useEditStore.getState().zoneSelectHoistPositions(config)
    expect(r.ok).toBe(true)
    expect(r.searchTrace).toBeNull()
  })

  it('getZonePartitionInput: bbox/nodeEntries/pipeNodes/tolMm 반환', () => {
    const inp = useEditStore.getState().getZonePartitionInput()
    expect(inp).toBeTruthy()
    expect(inp.bbox).toMatchObject({ minX: 0, maxX: 500 })
    expect(Array.isArray(inp.nodeEntries)).toBe(true)
    expect(inp.nodeEntries.length).toBe(12)
    expect(inp.pipeNodes instanceof Set).toBe(true)
    expect(inp.tolMm).toBeGreaterThan(0)
  })

  it('buildHoistPartitionInput: 모델 없으면 null', () => {
    expect(buildHoistPartitionInput(null, null)).toBeNull()
  })

  it('buildHoistPartitionInput: 빈 nodeMap 면 null', () => {
    expect(buildHoistPartitionInput({ nodeMap: new Map(), bbox: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 0 }, elements: [] }, null)).toBeNull()
  })
})

// ── [1]/[4] rotateModel provenance 제외 + 액션(batch) 단위 Ctrl+Z ──────────────
describe('useEditStore — undoLastIntent / clearRotateModelIntents / clearIntents(rotateModel 보존)', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })
  afterEach(() => {
    useStageStore.setState({ stages: [] })
    useStabilityStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })

  const seed = (intents) => useEditStore.setState({ intents, selectedIntentId: null })
  const el = (id, batchId = null) => ({ id, kind: 'deleteElement', batchId, params: { elementId: id }, validation: { status: 'ok', warnings: [], errors: [] } })
  const rot = (id = 'r') => ({ id, kind: 'rotateModel', batchId: null, params: { axis: 'Z', angleDeg: 45 }, validation: { status: 'ok', warnings: [], errors: [] } })

  it('undoLastIntent: batchId 로 묶인 일괄 삭제 3건을 한 번에 되돌린다', () => {
    seed([el('a'), el('b', 'B1'), el('c', 'B1'), el('d', 'B1')])
    const r = useEditStore.getState().undoLastIntent()
    expect(r.removed).toBe(3)
    expect(useEditStore.getState().intents.map(i => i.id)).toEqual(['a'])
  })

  it('undoLastIntent: batchId 없는 단건은 1개만 되돌린다', () => {
    seed([el('a'), el('b')])
    useEditStore.getState().undoLastIntent()
    expect(useEditStore.getState().intents.map(i => i.id)).toEqual(['a'])
  })

  it('undoLastIntent: rotateModel 은 대상에서 제외한다', () => {
    seed([rot('r'), el('x')])
    useEditStore.getState().undoLastIntent()   // x 제거
    expect(useEditStore.getState().intents.map(i => i.kind)).toEqual(['rotateModel'])
    useEditStore.getState().undoLastIntent()   // 남은 건 rotateModel 뿐 → no-op
    expect(useEditStore.getState().intents.map(i => i.kind)).toEqual(['rotateModel'])
  })

  it('clearIntents 는 rotateModel provenance 를 남긴다(3D 착시 방지)', () => {
    seed([rot('r'), el('x'), el('y')])
    useEditStore.getState().clearIntents()
    expect(useEditStore.getState().intents.map(i => i.kind)).toEqual(['rotateModel'])
  })

  it('clearRotateModelIntents 는 rotateModel 만 제거하고 선택도 해제한다', () => {
    useEditStore.setState({ intents: [rot('r'), el('x')], selectedIntentId: 'r' })
    useEditStore.getState().clearRotateModelIntents()
    const s = useEditStore.getState()
    expect(s.intents.map(i => i.id)).toEqual(['x'])
    expect(s.selectedIntentId).toBeNull()
  })

  it('addIntent 는 opts.batchId 를 intent 에 부여한다', () => {
    const r = useEditStore.getState().addIntent(
      { kind: 'addSupportBeam', params: { startNode: 1, endNode: 2, sectionKind: 'L', dims: [100, 100, 10, 10] } },
      { batchId: 'BX' },
    )
    expect(r.ok).toBe(true)
    expect(r.intent.batchId).toBe('BX')
  })
})

// ── [2b] removeHoistGroup 이 stability wire 재정렬을 스토어에서 보장 ──────────────
describe('useEditStore — removeHoistGroup ↔ dropGroupWires 통합', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [makeStageData()] })
    useEditStore.getState().reset()
    useStabilityStore.getState().reset()
  })
  afterEach(() => {
    useStageStore.setState({ stages: [] })
    useStabilityStore.getState().reset()
  })

  it('그룹 삭제가 성공하면 stability wires 를 동일 규칙으로 재정렬한다', () => {
    const ed = useEditStore.getState()
    ed.setHoistMode('hydro')
    ed.setHoistGroupCount(3)
    useStabilityStore.setState({ report: { visualization: { wires: [
      { groupId: 1, endMm: { x: 100 } },
      { groupId: 2, endMm: { x: 200 } },
      { groupId: 3, endMm: { x: 300 } },
    ] } } })
    useEditStore.getState().removeHoistGroup(2)
    const wires = useStabilityStore.getState().report.visualization.wires
    expect(wires.map(w => w.groupId)).toEqual([1, 2])        // 그룹 2 제거, 3→2
    expect(wires.find(w => w.groupId === 2).endMm.x).toBe(300) // 옛 그룹 3
  })

  it('no-op(마지막 1그룹) 이면 wire 를 건드리지 않는다', () => {
    useEditStore.getState().setHoistMode('hydro')   // count=1
    useStabilityStore.setState({ report: { visualization: { wires: [{ groupId: 1, endMm: { x: 100 } }] } } })
    useEditStore.getState().removeHoistGroup(1)
    expect(useStabilityStore.getState().report.visualization.wires.map(w => w.groupId)).toEqual([1])
  })
})

// ── [3] importFromJson 그룹 간 노드 중복 제거 ──────────────────────────────────
describe('useEditStore — importFromJson 노드 중복 제거', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [] })
    useEditStore.getState().reset()
  })

  it('같은 nodeId 가 여러 그룹에 있으면 먼저 나온 그룹에만 남긴다', () => {
    const payload = {
      schemaVersion: '1.0',
      intents: [],
      hoisting: { mode: { id: 'hydro' }, groupCount: 2, groups: [
        { id: 1, nodeIds: [10, 11, 12] },
        { id: 2, nodeIds: [12, 13, 14] },
      ] },
    }
    const r = useEditStore.getState().importFromJson(payload)
    expect(r.ok).toBe(true)
    const s = useEditStore.getState()
    expect(s.hoistGroups[1]).toEqual([10, 11, 12])
    expect(s.hoistGroups[2]).toEqual([13, 14])   // 12 는 그룹 1 에만
  })
})

// ── 그룹 자동 연결 적용 (applyGroupConnectProposals) ───────────────────────
// 후보 계산은 data/groupAutoConnect.test.js 가 검증한다. 여기서는 "고른 후보를 intent 로
// 커밋할 때" 의 규칙만 본다 — 종속 중복 차단·batch 묶음·미리보기 정리.
describe('applyGroupConnectProposals', () => {
  const makeConnectStage = () => new StageData({
    meta: { phase: 'C', stageName: 'C_Final', timestamp: '20260911_100000', unit: 'mm', schemaVersion: '1.1' },
    nodes: [
      { id: 1, x: 0,   y: 0,    z: 0, tags: [] },
      { id: 2, x: 600, y: 0,    z: 0, tags: [] },
      { id: 3, x: 0,   y: -300, z: 0, tags: [] },
      { id: 4, x: 600, y: -300, z: 0, tags: [] },
    ],
    elements: [
      { id: 11, type: 'BEAM', startNode: 1, endNode: 2, propertyId: 2, category: 'Structure' },
      { id: 12, type: 'BEAM', startNode: 3, endNode: 4, propertyId: 2, category: 'Structure' },
    ],
    rigids: [],
    properties: [{ id: 2, kind: 'L', dims: [100, 100, 10, 10] }],
    materials: [], pointMasses: [],
    connectivity: { groupCount: 2, largestGroupNodeCount: 2, isolatedNodeCount: 0, groups: [
      { id: 0, nodeIds: [1, 2], elementIds: [11] },
      { id: 1, nodeIds: [3, 4], elementIds: [12] },
    ] },
    healthMetrics: { totals: { nodeCount: 4, elementCount: 2, rigidCount: 0, pointMassCount: 0,
      bbox: { minX: 0, maxX: 600, minY: -300, maxY: 0, minZ: 0, maxZ: 0 } }, issues: {} },
  })

  beforeEach(() => {
    useEditStore.getState().reset()
    useStageStore.setState({ stages: [makeConnectStage()] })
  })
  afterEach(() => {
    useEditStore.getState().reset()
    useStageStore.setState({ stages: [] })
  })

  it('고른 후보를 addRigid intent 로 만들고 미리보기를 비운다', () => {
    const store = useEditStore.getState()
    store.setGroupConnectProposals([{ srcNode: 3, tgtNode: 1 }, { srcNode: 4, tgtNode: 2 }])
    const res = store.applyGroupConnectProposals([{ srcNode: 3, tgtNode: 1 }, { srcNode: 4, tgtNode: 2 }])

    expect(res.applied).toBe(2)
    expect(res.failed).toHaveLength(0)
    const rigids = useEditStore.getState().intents.filter(i => i.kind === 'addRigid')
    expect(rigids).toHaveLength(2)
    // 독립 = 주 구조 노드, 종속 = 소그룹 노드
    expect(rigids[0].params.independentNode).toBe(1)
    expect(rigids[0].params.dependentNodes).toEqual([3])
    expect(rigids[0].params.remark).toBe('AUTOCONNECT')
    // 한 번의 적용은 같은 batch — Ctrl+Z 로 통째로 되돌아간다
    expect(new Set(rigids.map(i => i.batchId)).size).toBe(1)
    expect(useEditStore.getState().groupConnectProposals).toHaveLength(0)
  })

  it('이미 다른 RBE 의 종속인 노드는 커밋 직전에 막는다 (Nastran FATAL 방지)', () => {
    const store = useEditStore.getState()
    store.addIntent({ kind: 'addRigid', params: { independentNode: 2, dependentNodes: [3] } })
    const res = useEditStore.getState().applyGroupConnectProposals([{ srcNode: 3, tgtNode: 1 }])

    expect(res.applied).toBe(0)
    expect(res.failed).toHaveLength(1)
    expect(res.failed[0]).toMatchObject({ srcNode: 3, tgtNode: 1 })
    // 수동으로 넣은 1건만 남는다
    expect(useEditStore.getState().intents.filter(i => i.kind === 'addRigid')).toHaveLength(1)
  })

  it('빈 배열이면 아무것도 하지 않는다', () => {
    const res = useEditStore.getState().applyGroupConnectProposals([])
    expect(res).toEqual({ applied: 0, warned: 0, failed: [] })
    expect(useEditStore.getState().intents).toHaveLength(0)
  })

  it('전량 실패면 미리보기를 남겨 사유를 보며 재시도할 수 있게 한다', () => {
    const store = useEditStore.getState()
    store.addIntent({ kind: 'addRigid', params: { independentNode: 2, dependentNodes: [3] } })
    store.setGroupConnectProposals([{ srcNode: 3, tgtNode: 1 }])
    useEditStore.getState().applyGroupConnectProposals([{ srcNode: 3, tgtNode: 1 }])
    expect(useEditStore.getState().groupConnectProposals).toHaveLength(1)
  })
})
