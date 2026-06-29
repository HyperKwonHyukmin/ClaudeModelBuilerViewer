import { describe, it, expect, beforeEach } from 'vitest'
import { useHoistLayoutStore } from './useHoistLayoutStore.js'
import { useStageStore } from './useStageStore.js'
import { StageData } from '../data/StageData.js'

const makeGridStage = () => {
  const nodes = []
  let id = 1
  for (let x = 0; x <= 100; x += 25) for (let y = 0; y <= 100; y += 25) nodes.push({ id: id++, x, y, z: 0, tags: [] })
  return new StageData({
    meta: { phase: 'C', stageName: 'C', unit: 'mm', schemaVersion: '1.1' },
    nodes, elements: [], rigids: [], properties: [], materials: [], pointMasses: [],
    healthMetrics: { totals: { bbox: { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 0 } }, issues: {} },
  })
}

beforeEach(() => {
  useStageStore.setState({ stages: [makeGridStage()], stageSummary: null, pipeFluidEmptied: false, modelRotated: false })
  useHoistLayoutStore.setState({
    open: false, divX: 1, divY: 2, dividersX: [], dividersY: [], bbox: null, cog: null, cogSource: null,
    projectedNodes: [], massByNode: null, pointsPerRegion: {}, suggestions: {}, overrides: {}, warnings: {},
  })
})

describe('useHoistLayoutStore', () => {
  it('openEditor — 무게중심 기준 분할선 + 구역별 기본 2점 제안', () => {
    useHoistLayoutStore.getState().openEditor()
    const s = useHoistLayoutStore.getState()
    expect(s.open).toBe(true)
    expect(s.dividersY).toHaveLength(1)                 // divY=2 → 수평선 1
    expect(Object.keys(s.suggestions)).toHaveLength(2)  // 1x2 → 2구역
    for (const ids of Object.values(s.suggestions)) expect(ids.length).toBe(2)
  })
  it('setDivX(2) — 구역·맵 리셋, 분할선 재배치(2x2=4구역)', () => {
    useHoistLayoutStore.getState().openEditor()
    useHoistLayoutStore.getState().setDivX(2)
    const s = useHoistLayoutStore.getState()
    expect(s.dividersX).toHaveLength(1)
    expect(Object.keys(s.suggestions)).toHaveLength(4)
  })
  it('setDivX — 6 초과 클램프', () => {
    useHoistLayoutStore.getState().openEditor()
    useHoistLayoutStore.getState().setDivX(99)
    expect(useHoistLayoutStore.getState().divX).toBe(6)
  })
  it('setDividerX — 인접/bbox 클램프', () => {
    useHoistLayoutStore.setState({ bbox: { minX: 0, maxX: 100, minY: 0, maxY: 100 }, dividersX: [50], dividersY: [], projectedNodes: [] })
    useHoistLayoutStore.getState().setDividerX(0, 999)
    expect(useHoistLayoutStore.getState().dividersX[0]).toBe(100)
  })
  it('setRegionPointCount — 최소 2 강제', () => {
    useHoistLayoutStore.getState().openEditor()
    const rid = Object.keys(useHoistLayoutStore.getState().pointsPerRegion)[0]
    useHoistLayoutStore.getState().setRegionPointCount(rid, 1)
    expect(useHoistLayoutStore.getState().pointsPerRegion[rid]).toBe(2)
  })
  it('setRegionPoints — override 가 suggestions 에 즉시 반영', () => {
    useHoistLayoutStore.getState().openEditor()
    const rid = Object.keys(useHoistLayoutStore.getState().suggestions)[0]
    useHoistLayoutStore.getState().setRegionPoints(rid, [1, 2])
    expect(useHoistLayoutStore.getState().overrides[rid]).toEqual([1, 2])
    expect(useHoistLayoutStore.getState().suggestions[rid]).toEqual([1, 2])
    useHoistLayoutStore.getState().recomputeAll()
    expect(useHoistLayoutStore.getState().suggestions[rid]).toEqual([1, 2])  // override 보존
  })
  it('closeEditor — open=false, 상태 보존', () => {
    useHoistLayoutStore.getState().openEditor()
    useHoistLayoutStore.getState().closeEditor()
    const s = useHoistLayoutStore.getState()
    expect(s.open).toBe(false)
    expect(Object.keys(s.suggestions)).toHaveLength(2)
  })
})
