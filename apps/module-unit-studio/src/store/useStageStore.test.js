import { describe, it, expect, beforeEach } from 'vitest'
import { useStageStore } from './useStageStore.js'
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
  beforeEach(() => { useStageStore.setState({ stages: [], pipeFluidEmptied: false }) })

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
})
