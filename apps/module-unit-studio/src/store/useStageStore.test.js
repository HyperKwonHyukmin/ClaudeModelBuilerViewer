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
