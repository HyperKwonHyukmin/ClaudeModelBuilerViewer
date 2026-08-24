import { describe, it, expect } from 'vitest'
import { selectHoistCircleCandidateNodes, autoHoistCircleTolMm } from './HoistCircleCandidateNodes.js'

describe('autoHoistCircleTolMm', () => {
  it('floors at 30mm for small / zero-span models', () => {
    expect(autoHoistCircleTolMm(0)).toBe(30)
    expect(autoHoistCircleTolMm(1000)).toBe(30)   // 5 → floored to 30
  })
  it('scales with 0.5% of horizontal span', () => {
    expect(autoHoistCircleTolMm(20000)).toBeCloseTo(100)
    expect(autoHoistCircleTolMm(40000)).toBeCloseTo(200)
  })
  it('treats invalid input as zero span', () => {
    expect(autoHoistCircleTolMm(NaN)).toBe(30)
    expect(autoHoistCircleTolMm(undefined)).toBe(30)
    expect(autoHoistCircleTolMm(-5)).toBe(30)
  })
})

describe('selectHoistCircleCandidateNodes', () => {
  const mk = (entries) => new Map(entries)
  const C = { x: 0, y: 0 }

  // plateZ=null → 링 조건만 (Z 무시). 순수 반경 판정 검증.
  it('selects nodes whose horizontal distance is within ±tol of the radius (inclusive, plateZ=null)', () => {
    const nodes = mk([
      [1, { x: 100, y: 0 }],   // d=100, exactly on ring
      [2, { x: 105, y: 0 }],   // d=105, within +tol
      [3, { x: 110, y: 0 }],   // d=110, exactly +tol → inclusive
      [4, { x: 111, y: 0 }],   // d=111, just outside
      [5, { x: 90,  y: 0 }],   // d=90,  exactly -tol → inclusive
      [6, { x: 89,  y: 0 }],   // d=89,  just outside (inside ring)
    ])
    const out = selectHoistCircleCandidateNodes(nodes, C, 100, 10, null, new Set())
    expect(out.sort((a, b) => a - b)).toEqual([1, 2, 3, 5])
  })

  it('constrains to the same Z level as plateZ (±tol) in addition to the ring', () => {
    const nodes = mk([
      [1, { x: 100, y: 0,   z: 1000 }],   // on ring, same level
      [2, { x: 0,   y: 100, z: 1005 }],   // on ring, within +tol level
      [3, { x: 0,   y: -100, z: 1200 }],  // on ring, different level → excluded
      [4, { x: 200, y: 0,   z: 1000 }],   // same level, wrong radius → excluded
      [5, { x: -100, y: 0,  z: 990 }],    // on ring, exactly -tol level → inclusive
    ])
    const out = selectHoistCircleCandidateNodes(nodes, C, 100, 10, 1000, new Set())
    expect(out.sort((a, b) => a - b)).toEqual([1, 2, 5])
  })

  it('excludes on-ring nodes that lack a finite z when Z-gated', () => {
    const nodes = mk([
      [1, { x: 100, y: 0, z: 1000 }],
      [2, { x: 0, y: 100 }],          // on ring but no z → excluded when Z-gated
      [3, { x: 0, y: -100, z: NaN }], // on ring but NaN z → excluded
    ])
    expect(selectHoistCircleCandidateNodes(nodes, C, 100, 10, 1000, new Set())).toEqual([1])
  })

  it('ignores Z when plateZ is null (cylinder fallback)', () => {
    const nodes = mk([
      [1, { x: 100, y: 0, z: 0 }],
      [2, { x: 0, y: 100, z: 99999 }],   // same radius, wildly different height
      [3, { x: 200, y: 0, z: 0 }],       // wrong radius
    ])
    const out = selectHoistCircleCandidateNodes(nodes, C, 100, 5, null, new Set())
    expect(out.sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('uses true 2D distance (diagonal nodes count)', () => {
    const nodes = mk([[1, { x: 30, y: 40 }]])  // d = 50
    expect(selectHoistCircleCandidateNodes(nodes, C, 50, 1, null, new Set())).toEqual([1])
    expect(selectHoistCircleCandidateNodes(nodes, C, 60, 1, null, new Set())).toEqual([])
  })

  it('respects a non-zero center', () => {
    const nodes = mk([[1, { x: 1100, y: 500 }]])  // d from (1000,500) = 100
    expect(selectHoistCircleCandidateNodes(nodes, { x: 1000, y: 500 }, 100, 1, null, new Set())).toEqual([1])
  })

  it('excludes nodes already used by a hoist group', () => {
    const nodes = mk([[1, { x: 100, y: 0 }], [2, { x: 100, y: 0 }], [3, { x: 100, y: 0 }]])
    expect(selectHoistCircleCandidateNodes(nodes, C, 100, 5, null, new Set([1, 3]))).toEqual([2])
    // plain array also accepted
    expect(selectHoistCircleCandidateNodes(nodes, C, 100, 5, null, [1])).toEqual([2, 3])
  })

  it('returns [] on bad args (zero/negative radius, bad center, null map, bad tol)', () => {
    const nodes = mk([[1, { x: 100, y: 0 }]])
    expect(selectHoistCircleCandidateNodes(nodes, C, 0, 5, null)).toEqual([])
    expect(selectHoistCircleCandidateNodes(nodes, C, -100, 5, null)).toEqual([])
    expect(selectHoistCircleCandidateNodes(nodes, { x: NaN, y: 0 }, 100, 5, null)).toEqual([])
    expect(selectHoistCircleCandidateNodes(null, C, 100, 5, null)).toEqual([])
    expect(selectHoistCircleCandidateNodes(nodes, C, 100, NaN, null)).toEqual([])
  })

  it('skips nodes with non-finite XY coordinates', () => {
    const nodes = mk([[1, { x: 100, y: 0 }], [2, { x: NaN, y: 0 }], [3, {}]])
    expect(selectHoistCircleCandidateNodes(nodes, C, 100, 5, null, new Set())).toEqual([1])
  })
})
