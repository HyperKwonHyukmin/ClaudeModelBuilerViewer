import { describe, it, expect, beforeEach } from 'vitest'
import { useStageStore } from './useStageStore.js'
import { useStabilityStore } from './useStabilityStore.js'
import { useUnitStructuralStore } from './useUnitStructuralStore.js'
import { PIPE_STEEL_RHO } from '../data/pipeFluid.js'
import { StageData } from '../data/StageData.js'

function makeStage() {
  const materials = [
    { id: 1, name: 'Steel', rho: 7.85e-9 },
    { id: 2, name: 'Steel_Fluid_A', rho: 1.3e-8 },
  ]
  const properties = [{ id: 10, materialId: 1 }, { id: 20, materialId: 2 }]
  return {
    elements: [
      { id: 1, type: 'BEAM', category: 'Structure', propertyId: 10 },
      { id: 2, type: 'BEAM', category: 'Pipe', propertyId: 20 },
    ],
    propertyMap: new Map(properties.map(p => [p.id, p])),
    materialMap: new Map(materials.map(m => [m.id, m])),
    materials,
  }
}

describe('useStageStore.emptyPipeFluid', () => {
  beforeEach(() => {
    useStageStore.setState({ stages: [], pipeFluidEmptied: false })
    useStabilityStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })

  it('기본 pipeFluidEmptied 는 false', () => {
    expect(useStageStore.getState().pipeFluidEmptied).toBe(false)
  })

  it('pipe material rho 를 7.85e-9 로 바꾸고 플래그를 set, materialIds 반환', () => {
    const stage = makeStage()
    useStageStore.setState({ stages: [stage] })
    const { materialIds, changedCount } = useStageStore.getState().emptyPipeFluid()
    expect(materialIds).toEqual([2])
    expect(changedCount).toBe(1)
    expect(stage.materialMap.get(2).rho).toBe(PIPE_STEEL_RHO)
    expect(stage.materialMap.get(1).rho).toBe(7.85e-9)
    expect(useStageStore.getState().pipeFluidEmptied).toBe(true)
  })

  it('stages 가 비면 no-op', () => {
    const r = useStageStore.getState().emptyPipeFluid()
    expect(r.materialIds).toEqual([])
    expect(useStageStore.getState().pipeFluidEmptied).toBe(false)
  })

  it('유체를 비우면 기존 자세안정성/구조해석 결과를 무효화한다', () => {
    const stage = makeStage()
    useStageStore.setState({ stages: [stage] })
    // 사전: 평가/해석 결과가 이미 있다고 가정
    useStabilityStore.setState({ report: { stages: [] }, stabilityPath: '/x/_stability.json', overallStatus: 'pass' })
    useUnitStructuralStore.setState({ status: 'Success', result: { ok: 1 } })

    const r = useStageStore.getState().emptyPipeFluid()

    expect(r.invalidatedStability).toBe(true)
    expect(useStabilityStore.getState().report).toBe(null)
    expect(useStabilityStore.getState().stabilityPath).toBe(null)
    expect(useStabilityStore.getState().overallStatus).toBe(null)
    expect(useUnitStructuralStore.getState().status).toBe(null)
    expect(useUnitStructuralStore.getState().result).toBe(null)
  })

  it('배관 없는 stage 에서 emptyPipeFluid → changedCount=0 이면 pipeFluidEmptied 그대로 false', () => {
    // Pipe 요소가 없으면 collectPipeMaterialIds=∅ → changedCount=0.
    // 이 경우 pipeFluidEmptied 를 true 로 올리면 payload 가 근사 fallback 으로 강등되므로 false 유지.
    const materials = [{ id: 1, name: 'Steel', rho: 7.85e-9 }]
    const properties = [{ id: 10, materialId: 1 }]
    const stage = {
      elements: [{ id: 1, type: 'BEAM', category: 'Structure', propertyId: 10 }],
      propertyMap: new Map(properties.map(p => [p.id, p])),
      materialMap: new Map(materials.map(m => [m.id, m])),
      materials,
    }
    useStageStore.setState({ stages: [stage], pipeFluidEmptied: false })
    const { materialIds, changedCount } = useStageStore.getState().emptyPipeFluid()
    expect(materialIds).toEqual([])
    expect(changedCount).toBe(0)
    expect(useStageStore.getState().pipeFluidEmptied).toBe(false)
  })

  it('바뀐 게 없으면(이미 비워짐) 무효화하지 않는다', () => {
    const stage = makeStage()
    stage.materialMap.get(2).rho = PIPE_STEEL_RHO // 이미 강재
    useStageStore.setState({ stages: [stage] })
    useStabilityStore.setState({ report: { stages: [] }, stabilityPath: '/x', overallStatus: 'pass' })

    const r = useStageStore.getState().emptyPipeFluid()

    expect(r.changedCount).toBe(0)
    expect(r.invalidatedStability).toBe(false)
    expect(useStabilityStore.getState().report).not.toBe(null) // 유지
  })
})

describe('useStageStore.rotateModel', () => {
  const makeStageData = () => new StageData({
    meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
    nodes: [{ id: 1, x: 0, y: 0, z: 0, tags: [] }, { id: 2, x: 100, y: 0, z: 0, tags: [] }],
    elements: [{ id: 1, type: 'CBEAM', startNode: 1, endNode: 2, propertyId: 10, orientation: [0, 0, 1] }],
    rigids: [], properties: [{ id: 10, kind: 'TUBE', dims: [50, 40] }], materials: [], pointMasses: [],
  })

  beforeEach(() => {
    useStageStore.setState({ stages: [], pipeFluidEmptied: false, modelRotated: false })
    useStabilityStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })

  it('기본 modelRotated 는 false', () => {
    expect(useStageStore.getState().modelRotated).toBe(false)
  })

  it('Z축 90° 회전: node2 → (0,100,0), modelRotated=true', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    const r = useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
    expect(r.changedNodeCount).toBe(2)
    const n2 = s.nodeMap.get(2)
    expect(Math.abs(n2.x) < 1e-6).toBe(true)
    expect(Math.abs(n2.y - 100) < 1e-6).toBe(true)
    expect(useStageStore.getState().modelRotated).toBe(true)
  })

  it('회전 후 stages 의 StageData 가 새 참조로 교체된다 (뷰어 rebuild 트리거)', () => {
    // 회전이 화면에 반영되려면 ThreeViewport 의 stageData 키 effect 가 재실행되어야 하고,
    // 그러려면 stages[i] 가 새 객체 참조여야 한다 (in-place mutate 만으로는 rebuild 안 됨).
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
    const after = useStageStore.getState().stages[0]
    expect(after).not.toBe(s)            // 새 참조
    expect(after.nodeMap).toBe(s.nodeMap) // 같은(회전된) 데이터를 공유
    const n2 = after.nodeMap.get(2)
    expect(Math.abs(n2.y - 100) < 1e-6).toBe(true)
  })

  it('회전 시 기존 자세안정성/구조해석 결과 무효화', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStabilityStore.setState({ report: { stages: [] }, stabilityPath: '/x', overallStatus: 'pass' })
    useUnitStructuralStore.setState({ status: 'Success', result: { ok: 1 } })
    const r = useStageStore.getState().rotateModel({ axis: 'X', angleDeg: 30, pivot: { x: 0, y: 0, z: 0 } })
    expect(r.invalidatedStability).toBe(true)
    expect(useStabilityStore.getState().report).toBe(null)
    expect(useUnitStructuralStore.getState().status).toBe(null)
  })

  it('stages 비면 no-op', () => {
    const r = useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90 })
    expect(r.changedNodeCount).toBe(0)
    expect(useStageStore.getState().modelRotated).toBe(false)
  })

  it('360°/0° 의 배수는 사실상 회전 없음 → no-op (무효화 안 함)', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStabilityStore.setState({ report: { stages: [] }, stabilityPath: '/x', overallStatus: 'pass' })
    const r = useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 360, pivot: { x: 0, y: 0, z: 0 } })
    expect(r.changedNodeCount).toBe(0)
    expect(r.invalidatedStability).toBe(false)
    expect(useStageStore.getState().modelRotated).toBe(false)
    expect(useStabilityStore.getState().report).not.toBe(null) // 유지
    // 좌표도 그대로
    expect(s.nodeMap.get(2).x).toBe(100)
  })
})

describe('useStageStore.resetRotation', () => {
  const makeStageData = () => new StageData({
    meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
    nodes: [{ id: 1, x: 0, y: 0, z: 0, tags: [] }, { id: 2, x: 100, y: 0, z: 0, tags: [] }],
    elements: [{ id: 1, type: 'CBEAM', startNode: 1, endNode: 2, propertyId: 10, orientation: [0, 0, 1] }],
    rigids: [], properties: [{ id: 10, kind: 'TUBE', dims: [50, 40] }], materials: [], pointMasses: [],
  })

  beforeEach(() => {
    useStageStore.setState({ stages: [], pipeFluidEmptied: false, modelRotated: false, rotationStack: [] })
    useStabilityStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })

  it('rotateModel 은 회전 이력을 rotationStack 에 push 한다', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
    const stack = useStageStore.getState().rotationStack
    expect(stack.length).toBe(1)
    expect(stack[0]).toMatchObject({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
  })

  it('단일 회전 → resetRotation 이 원좌표로 복원 + modelRotated=false + 스택 비움', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
    const r = useStageStore.getState().resetRotation()
    expect(r.undoneCount).toBe(1)
    const n2 = useStageStore.getState().stages[0].nodeMap.get(2)
    expect(Math.abs(n2.x - 100) < 1e-6).toBe(true)
    expect(Math.abs(n2.y) < 1e-6).toBe(true)
    expect(useStageStore.getState().modelRotated).toBe(false)
    expect(useStageStore.getState().rotationStack).toEqual([])
  })

  it('누적 회전(2건) → resetRotation 이 역순 역회전으로 원좌표 복원', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
    useStageStore.getState().rotateModel({ axis: 'X', angleDeg: 45, pivot: { x: 0, y: 0, z: 0 } })
    expect(useStageStore.getState().rotationStack.length).toBe(2)
    useStageStore.getState().resetRotation()
    const n2 = useStageStore.getState().stages[0].nodeMap.get(2)
    expect(Math.abs(n2.x - 100) < 1e-6).toBe(true)
    expect(Math.abs(n2.y) < 1e-6).toBe(true)
    expect(Math.abs(n2.z) < 1e-6).toBe(true)
  })

  it('resetRotation 은 stages 새 참조로 교체(뷰어 rebuild 트리거)', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 30, pivot: { x: 0, y: 0, z: 0 } })
    const before = useStageStore.getState().stages[0]
    useStageStore.getState().resetRotation()
    expect(useStageStore.getState().stages[0]).not.toBe(before)
  })

  it('resetRotation 은 기존 자세안정성/구조해석 결과를 무효화한다', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    useStageStore.getState().rotateModel({ axis: 'Z', angleDeg: 90, pivot: { x: 0, y: 0, z: 0 } })
    useStabilityStore.setState({ report: { stages: [] }, stabilityPath: '/x', overallStatus: 'pass' })
    useUnitStructuralStore.setState({ status: 'Success', result: { ok: 1 } })
    const r = useStageStore.getState().resetRotation()
    expect(r.invalidatedStability).toBe(true)
    expect(useStabilityStore.getState().report).toBe(null)
    expect(useUnitStructuralStore.getState().status).toBe(null)
  })

  it('회전 이력이 없으면 resetRotation 은 no-op', () => {
    const s = makeStageData()
    useStageStore.setState({ stages: [s] })
    const r = useStageStore.getState().resetRotation()
    expect(r.undoneCount).toBe(0)
    expect(r.changedNodeCount).toBe(0)
  })
})

describe('useStageStore.restorePipeFluid', () => {
  function makeStage() {
    const materials = [
      { id: 1, name: 'Steel', rho: 7.85e-9 },
      { id: 2, name: 'Steel_Fluid_A', rho: 1.3e-8 },
    ]
    const properties = [{ id: 10, materialId: 1 }, { id: 20, materialId: 2 }]
    return {
      elements: [
        { id: 1, type: 'BEAM', category: 'Structure', propertyId: 10 },
        { id: 2, type: 'BEAM', category: 'Pipe', propertyId: 20 },
      ],
      propertyMap: new Map(properties.map(p => [p.id, p])),
      materialMap: new Map(materials.map(m => [m.id, m])),
      materials,
    }
  }

  beforeEach(() => {
    useStageStore.setState({ stages: [], pipeFluidEmptied: false, pipeFluidOriginalRhoMap: null })
    useStabilityStore.getState().reset()
    useUnitStructuralStore.getState().reset()
  })

  it('emptyPipeFluid → restorePipeFluid 왕복: rho/플래그가 원복된다', () => {
    const stage = makeStage()
    useStageStore.setState({ stages: [stage] })
    useStageStore.getState().emptyPipeFluid()
    expect(stage.materialMap.get(2).rho).toBe(PIPE_STEEL_RHO)
    expect(useStageStore.getState().pipeFluidEmptied).toBe(true)

    const r = useStageStore.getState().restorePipeFluid()
    expect(r.changedCount).toBe(1)
    expect(stage.materialMap.get(2).rho).toBe(1.3e-8)   // 원래 유체 포함 밀도로 복원
    expect(useStageStore.getState().pipeFluidEmptied).toBe(false)
    expect(useStageStore.getState().pipeFluidOriginalRhoMap).toBe(null)
  })

  it('왕복 복원 시 기존 해석 결과를 무효화한다', () => {
    const stage = makeStage()
    useStageStore.setState({ stages: [stage] })
    useStageStore.getState().emptyPipeFluid()
    useStabilityStore.setState({ report: { stages: [] }, stabilityPath: '/x', overallStatus: 'pass' })
    useUnitStructuralStore.setState({ status: 'Success', result: { ok: 1 } })
    const r = useStageStore.getState().restorePipeFluid()
    expect(r.invalidatedStability).toBe(true)
    expect(useStabilityStore.getState().report).toBe(null)
    expect(useUnitStructuralStore.getState().status).toBe(null)
  })

  it('pipeFluidOriginalRhoMap={} 이면 no-op (바꿀 rho 없음)', () => {
    const stage = makeStage()
    useStageStore.setState({ stages: [stage], pipeFluidEmptied: true, pipeFluidOriginalRhoMap: {} })
    const r = useStageStore.getState().restorePipeFluid()
    expect(r.changedCount).toBe(0)
    expect(r.invalidatedStability).toBe(false)
    expect(useStageStore.getState().pipeFluidEmptied).toBe(false)
    expect(useStageStore.getState().pipeFluidOriginalRhoMap).toBe(null)
  })

  it('stages 가 비거나 백업맵이 없으면 no-op', () => {
    const r = useStageStore.getState().restorePipeFluid()
    expect(r.changedCount).toBe(0)
    expect(r.invalidatedStability).toBe(false)
  })
})
