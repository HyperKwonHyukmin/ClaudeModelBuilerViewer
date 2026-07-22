import { describe, it, expect, beforeEach } from 'vitest'
import { useStabilityStore } from './useStabilityStore.js'

const wire = (groupId) => ({ groupId, safe: true, startMm: { x: 0, y: 0, z: 1000 }, endMm: { x: groupId * 100, y: 0, z: 0 } })
const apex = (groupId) => ({ groupId, pointMm: { x: 0, y: 0, z: 1000 } })

describe('useStabilityStore', () => {
  beforeEach(() => { useStabilityStore.getState().reset() })

  it('reset 는 report·상태를 모두 비운다', () => {
    useStabilityStore.setState({ report: { stages: [] }, overallStatus: 'pass', error: { message: 'x' }, panelOpen: true })
    useStabilityStore.getState().reset()
    const s = useStabilityStore.getState()
    expect(s.report).toBeNull()
    expect(s.overallStatus).toBeNull()
    expect(s.error).toBeNull()
    expect(s.panelOpen).toBe(false)
  })

  it('dropGroupWires: 삭제 그룹 wire/apex 제거 + 큰 ID 는 1씩 당겨 재정렬', () => {
    useStabilityStore.setState({
      report: {
        stages: [],
        visualization: {
          wires: [wire(1), wire(2), wire(3), wire(4)],
          apexes: [apex(1), apex(2), apex(3), apex(4)],
        },
      },
    })
    useStabilityStore.getState().dropGroupWires(2)
    const v = useStabilityStore.getState().report.visualization
    // 그룹 2 제거, 3→2, 4→3
    expect(v.wires.map(w => w.groupId)).toEqual([1, 2, 3])
    expect(v.apexes.map(a => a.groupId)).toEqual([1, 2, 3])
    // 옛 그룹 3 wire 가 새 그룹 2 로 (좌표 endMm.x=300 로 정체 확인)
    expect(v.wires.find(w => w.groupId === 2).endMm.x).toBe(300)
    // 옛 그룹 4 wire 가 새 그룹 3 으로
    expect(v.wires.find(w => w.groupId === 3).endMm.x).toBe(400)
  })

  it('dropGroupWires: report/visualization 없으면 no-op', () => {
    useStabilityStore.getState().dropGroupWires(1)          // report=null
    expect(useStabilityStore.getState().report).toBeNull()
    useStabilityStore.setState({ report: { stages: [] } })  // visualization 없음
    useStabilityStore.getState().dropGroupWires(1)
    expect(useStabilityStore.getState().report).toEqual({ stages: [] })
  })

  it('dropGroupWires: apexes 가 없어도 wires 만 안전하게 재정렬', () => {
    useStabilityStore.setState({ report: { visualization: { wires: [wire(1), wire(2)] } } })
    useStabilityStore.getState().dropGroupWires(1)
    const v = useStabilityStore.getState().report.visualization
    expect(v.wires.map(w => w.groupId)).toEqual([1])   // 옛 그룹 2 → 1
    expect(v.apexes).toBeUndefined()
  })

  it('dropGroupWires: 마지막 그룹 삭제는 재정렬 없이 제거만', () => {
    useStabilityStore.setState({ report: { visualization: { wires: [wire(1), wire(2), wire(3)] } } })
    useStabilityStore.getState().dropGroupWires(3)
    expect(useStabilityStore.getState().report.visualization.wires.map(w => w.groupId)).toEqual([1, 2])
  })
})

describe('deriveOverallStatus (setReport 를 통해)', () => {
  beforeEach(() => { useStabilityStore.getState().reset() })

  it('user stage 가 전부 skip 이면 overallStatus 는 null (미실행 취급 — 구조해석 Run 오판 방지)', () => {
    useStabilityStore.getState().setReport({
      stages: [
        { id: 1, displayPolicy: 'user', status: 'skip' },
        { id: 2, displayPolicy: 'user', status: 'skip' },
      ],
    })
    expect(useStabilityStore.getState().overallStatus).toBeNull()
  })

  it('skip 들 사이에 pass 가 하나라도 있으면 pass', () => {
    useStabilityStore.getState().setReport({
      stages: [
        { id: 1, displayPolicy: 'user', status: 'skip' },
        { id: 2, displayPolicy: 'user', status: 'pass' },
      ],
    })
    expect(useStabilityStore.getState().overallStatus).toBe('pass')
  })

  it('fail/warn 우선순위 유지 (fail > warn > pass)', () => {
    useStabilityStore.getState().setReport({
      stages: [
        { id: 1, displayPolicy: 'user', status: 'warn' },
        { id: 2, displayPolicy: 'user', status: 'fail' },
      ],
    })
    expect(useStabilityStore.getState().overallStatus).toBe('fail')
  })

  it('internal stage 만 pass 이고 user 가 전부 skip 이면 null', () => {
    useStabilityStore.getState().setReport({
      stages: [
        { id: 1, displayPolicy: 'internal', status: 'pass' },
        { id: 2, displayPolicy: 'user', status: 'skip' },
      ],
    })
    expect(useStabilityStore.getState().overallStatus).toBeNull()
  })

  it('user stage 가 하나도 없으면(빈 배열 포함) null', () => {
    useStabilityStore.getState().setReport({ stages: [] })
    expect(useStabilityStore.getState().overallStatus).toBeNull()
  })
})
