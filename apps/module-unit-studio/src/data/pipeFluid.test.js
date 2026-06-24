import { describe, it, expect } from 'vitest'
import { collectPipeMaterialIds, applyPipeFluidEmpty, PIPE_STEEL_RHO } from './pipeFluid.js'

function makeStage() {
  const materials = [
    { id: 1, name: 'Steel', rho: 7.85e-9 },
    { id: 2, name: 'Steel_Fluid_A', rho: 1.3e-8 },
    { id: 3, name: 'Steel_Fluid_B', rho: 1.6e-8 },
  ]
  const properties = [
    { id: 10, materialId: 1 }, // structure
    { id: 20, materialId: 2 }, // pipe
    { id: 30, materialId: 3 }, // pipe
  ]
  return {
    elements: [
      { id: 1, type: 'BEAM', category: 'Structure', propertyId: 10 },
      { id: 2, type: 'BEAM', category: 'Pipe', propertyId: 20 },
      { id: 3, type: 'BEAM', category: 'Pipe', propertyId: 30 },
    ],
    propertyMap: new Map(properties.map(p => [p.id, p])),
    materialMap: new Map(materials.map(m => [m.id, m])),
    materials,
  }
}

describe('collectPipeMaterialIds', () => {
  it('Pipe 요소가 참조하는 material id 만 수집', () => {
    expect([...collectPipeMaterialIds(makeStage())].sort()).toEqual([2, 3])
  })
  it('stage 가 없으면 빈 Set', () => {
    expect(collectPipeMaterialIds(null).size).toBe(0)
  })
})

describe('applyPipeFluidEmpty', () => {
  it('지정 material 의 rho 만 7.85e-9 로 변경, 구조 material 불변', () => {
    const stage = makeStage()
    const changed = applyPipeFluidEmpty([stage], collectPipeMaterialIds(stage))
    expect(changed).toBe(2)
    expect(stage.materialMap.get(2).rho).toBe(PIPE_STEEL_RHO)
    expect(stage.materialMap.get(3).rho).toBe(PIPE_STEEL_RHO)
    expect(stage.materials.find(m => m.id === 2).rho).toBe(PIPE_STEEL_RHO) // Map↔array 동일 ref
    expect(stage.materialMap.get(1).rho).toBe(7.85e-9)
  })
  it('이미 7.85e-9 면 changed 카운트에 포함 안 함', () => {
    const stage = makeStage()
    const changed = applyPipeFluidEmpty([stage], new Set([1]))
    expect(changed).toBe(0)
  })
})
