import { describe, it, expect, beforeEach } from 'vitest'
import { useStageStore } from './useStageStore.js'
import { useStabilityStore } from './useStabilityStore.js'
import { useUnitStructuralStore } from './useUnitStructuralStore.js'
import { PIPE_STEEL_RHO } from '../data/pipeFluid.js'

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
