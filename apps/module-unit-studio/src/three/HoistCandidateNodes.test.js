import { describe, it, expect } from 'vitest'
import { selectHoistCandidateNodes, autoHoistToleranceMm } from './HoistCandidateNodes.js'

describe('autoHoistToleranceMm', () => {
  it('floors at 2mm for short / zero-height models', () => {
    expect(autoHoistToleranceMm(0)).toBe(2)
    expect(autoHoistToleranceMm(100)).toBe(2)   // 0.4 → floored to 2
  })
  it('scales with 0.4% of model height', () => {
    expect(autoHoistToleranceMm(20000)).toBeCloseTo(80)
    expect(autoHoistToleranceMm(5000)).toBeCloseTo(20)
  })
  it('treats invalid input as zero height', () => {
    expect(autoHoistToleranceMm(NaN)).toBe(2)
    expect(autoHoistToleranceMm(undefined)).toBe(2)
    expect(autoHoistToleranceMm(-5)).toBe(2)
  })
})

describe('selectHoistCandidateNodes', () => {
  const mk = (entries) => new Map(entries)

  it('selects same-level nodes within ±tolerance of the plane (inclusive bounds)', () => {
    const nodes = mk([
      [1, { z: 1000 }],   // on plane
      [2, { z: 1005 }],   // within +tol
      [3, { z: 1010 }],   // exactly +tol → inclusive
      [4, { z: 1011 }],   // just outside
      [5, { z: 990 }],    // exactly -tol → inclusive
      [6, { z: 989 }],    // just outside (below)
    ])
    const out = selectHoistCandidateNodes(nodes, 1000, 10, new Set())
    expect(out.sort((a, b) => a - b)).toEqual([1, 2, 3, 5])
  })

  it('excludes nodes already used by a hoist group', () => {
    const nodes = mk([[1, { z: 1000 }], [2, { z: 1000 }], [3, { z: 1000 }]])
    const out = selectHoistCandidateNodes(nodes, 1000, 5, new Set([1, 3]))
    expect(out).toEqual([2])
  })

  it('is region-independent — only Z matters, X/Y are ignored', () => {
    const nodes = mk([
      [1, { x: 0,      y: 0,      z: 500 }],
      [2, { x: 999999, y: -50000, z: 500 }],  // far away in XY, same level
      [3, { x: 1,      y: 1,      z: 700 }],   // near in XY, different level
    ])
    const out = selectHoistCandidateNodes(nodes, 500, 1, new Set())
    expect(out.sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('accepts a plain array for usedIds', () => {
    const nodes = mk([[1, { z: 0 }], [2, { z: 0 }]])
    expect(selectHoistCandidateNodes(nodes, 0, 1, [1])).toEqual([2])
  })

  it('skips nodes with non-finite z and returns [] on bad args', () => {
    const nodes = mk([[1, { z: 100 }], [2, { z: NaN }], [3, {}]])
    expect(selectHoistCandidateNodes(nodes, 100, 5, new Set())).toEqual([1])
    expect(selectHoistCandidateNodes(nodes, NaN, 5, new Set())).toEqual([])
    expect(selectHoistCandidateNodes(null, 100, 5, new Set())).toEqual([])
  })
})
