import { describe, it, expect } from 'vitest'
import {
  groupAreaMm2,
  groupSquareness,
  groupAxisDevDeg,
  groupLineLenMm,
  groupOppositeSideEquality,
  candidateFootprint,
  candidateBBoxXY,
  planViewProjector,
} from './hoistCandidateShape.js'

const g = (...pts) => ({ nodes: pts.map(([x, y], i) => ({ id: i + 1, x, y, z: 5000 })) })

describe('hoistCandidateShape', () => {
  it('groupAreaMm2: 1000×1000 정사각형 = 1e6', () => {
    expect(groupAreaMm2(g([0, 0], [1000, 0], [1000, 1000], [0, 1000]))).toBeCloseTo(1_000_000, 0)
  })

  it('groupAreaMm2: 일직선은 0', () => {
    expect(groupAreaMm2(g([0, 0], [500, 0], [1000, 0], [1500, 0]))).toBeCloseTo(0, 3)
  })

  it('groupSquareness: 정사각형≈1, 2:1 직사각형≈0.5, 일직선=0', () => {
    expect(groupSquareness(g([0, 0], [1000, 0], [1000, 1000], [0, 1000]))).toBeCloseTo(1, 2)
    expect(groupSquareness(g([0, 0], [2000, 0], [2000, 1000], [0, 1000]))).toBeCloseTo(0.5, 2)
    expect(groupSquareness(g([0, 0], [500, 0], [1000, 0], [1500, 0]))).toBeCloseTo(0, 2)
  })

  it('groupAxisDevDeg: 축평행=0, 45° 회전 정사각형≈45', () => {
    expect(groupAxisDevDeg(g([0, 0], [1000, 0], [1000, 1000], [0, 1000]))).toBeCloseTo(0, 1)
    expect(groupAxisDevDeg(g([0, 0], [707, 707], [0, 1414], [-707, 707]))).toBeCloseTo(45, 0)
  })

  it('candidateFootprint: 면적 합·최악 정사각형도·최악 축편차 집계', () => {
    const cand = {
      groups: [
        g([0, 0], [1000, 0], [1000, 1000], [0, 1000]),       // 정사각형 area 1e6, sq 1, axis 0
        g([0, 0], [2000, 0], [2000, 1000], [0, 1000]),       // 2:1 area 2e6, sq 0.5, axis 0
      ],
    }
    const fp = candidateFootprint(cand)
    expect(fp.areaM2).toBeCloseTo(3.0, 2)
    expect(fp.minSquareness).toBeCloseTo(0.5, 2)  // 최악(2:1) 기준
    expect(fp.maxAxisDevDeg).toBeCloseTo(0, 1)
  })

  it('groupLineLenMm: 2점 직선 길이, 그 외 0', () => {
    expect(groupLineLenMm(g([0, 0], [3000, 4000]))).toBeCloseTo(5000, 3)
    expect(groupLineLenMm(g([0, 0], [1000, 0], [1000, 1000], [0, 1000]))).toBe(0)
  })

  it('candidateFootprint: 2점 직선의 축편차·선길이도 집계된다 (2026-07-03)', () => {
    const cand = {
      groups: [
        g([0, 0], [1000, 0], [1000, 1000], [0, 1000]),  // 축평행 정사각형 (axis 0)
        g([0, 0], [5000, 5000]),                          // 45° 대각 직선 len≈7071
      ],
    }
    const fp = candidateFootprint(cand)
    expect(fp.maxAxisDevDeg).toBeCloseTo(45, 0)           // 대각 직선이 축편차에 잡힌다
    expect(fp.maxLineLenMm).toBeCloseTo(Math.hypot(5000, 5000), 0)
    expect(fp.minSquareness).toBeCloseTo(1, 2)            // 정사각형도는 면적>0 그룹 기준 유지
  })

  it('groupOppositeSideEquality: 직사각형·평행사변형=1, 부등변 사다리꼴<1, 비4점=1 (2026-07-03)', () => {
    // 직사각형·평행사변형 — 대변 길이 같음 → 1
    expect(groupOppositeSideEquality(g([0, 0], [4000, 0], [4000, 2000], [0, 2000]))).toBeCloseTo(1, 6)
    expect(groupOppositeSideEquality(g([0, 0], [4000, 0], [6000, 2000], [2000, 2000]))).toBeCloseTo(1, 6)
    // 밑변 12000 vs 윗변 6000 등변 사다리꼴 → (0.5 + 1.0)/2 = 0.75
    expect(groupOppositeSideEquality(g([0, 0], [12000, 0], [9000, 6000], [3000, 6000]))).toBeCloseTo(0.75, 3)
    // 2점 직선 등 4점이 아니면 중립값 1
    expect(groupOppositeSideEquality(g([0, 0], [5000, 0]))).toBe(1)
  })

  it('candidateFootprint: 4점 그룹 중 최악 대변비(minSideEquality)를 집계, 4점 없으면 null', () => {
    const cand = {
      groups: [
        g([0, 0], [4000, 0], [4000, 2000], [0, 2000]),        // 직사각형 → 1.0
        g([0, 0], [12000, 0], [9000, 6000], [3000, 6000]),    // 부등변 사다리꼴 → 0.75
      ],
    }
    expect(candidateFootprint(cand).minSideEquality).toBeCloseTo(0.75, 3)
    expect(candidateFootprint({ groups: [g([0, 0], [5000, 0])] }).minSideEquality).toBeNull()
  })

  it('candidateBBoxXY: 모든 그룹 점을 감싼다', () => {
    const cand = { groups: [g([0, 0], [1000, 0], [1000, 1000], [0, 1000])] }
    const bb = candidateBBoxXY(cand)
    expect(bb).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 })
  })

  it('노드 없는 그룹은 면적 0, 빈 후보 bbox 는 null', () => {
    expect(groupAreaMm2({ nodeIds: [1, 2, 3] })).toBe(0)
    expect(candidateBBoxXY({ groups: [{ nodeIds: [1] }] })).toBeNull()
  })

  describe('planViewProjector (평면도 방향: ↑X · ←Y)', () => {
    const frame = { minX: 0, maxX: 100, minY: 0, maxY: 40 }

    it('+X 는 위(작은 svgY), +Y 는 왼쪽(작은 svgX)', () => {
      const { project } = planViewProjector(frame, { width: 200, height: 200, pad: 0 })
      const topLeft = project({ x: 100, y: 40 })     // maxX·maxY → 좌상단
      const bottomRight = project({ x: 0, y: 0 })     // minX·minY → 우하단
      expect(topLeft.x).toBeLessThan(bottomRight.x)   // +Y 클수록 왼쪽
      expect(topLeft.y).toBeLessThan(bottomRight.y)   // +X 클수록 위
    })

    it('종방향(X)이 세로, 횡방향(Y)이 가로로 매핑된다', () => {
      // X 범위(100)가 Y 범위(40)보다 크므로 세로가 스케일 제한이 된다.
      const { rect } = planViewProjector(frame, { width: 200, height: 200, pad: 0 })
      expect(rect.h).toBeGreaterThan(rect.w) // 세로(X) > 가로(Y)
    })

    it('degenerate frame(폭 0)도 NaN 없이 동작', () => {
      const { project, rect } = planViewProjector({ minX: 5, maxX: 5, minY: 0, maxY: 10 }, { width: 96, height: 72 })
      const p = project({ x: 5, y: 5 })
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(rect.w)).toBe(true)
    })
  })
})
