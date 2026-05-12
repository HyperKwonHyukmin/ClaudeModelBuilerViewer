import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { sortQuadConvex } from './PolygonOverlay.js'

// 인접 변끼리 교차하지 않는지(=볼록 + 비자가교차) 확인하는 헬퍼.
// 4점 사각형이면 두 대각 변(0-2, 1-3 의 cycle 변이 아닌 세그먼트) 이 교차하면 bowtie.
// 정렬 결과의 4개 변(0-1, 1-2, 2-3, 3-0) 중 비-인접 두 변이 교차하지 않으면 OK.
function hasSelfIntersection(positions) {
  const segs = [[0,1],[1,2],[2,3],[3,0]]
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      // 인접한 변(공유 정점이 있음)은 교차 정의에서 제외
      const a = segs[i], b = segs[j]
      if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue
      if (segments2DIntersect(positions[a[0]], positions[a[1]], positions[b[0]], positions[b[1]])) {
        return true
      }
    }
  }
  return false
}

// XY 평면 사영 기준 2D 세그먼트 교차 판정 (Z 무시 — 본 테스트는 Z=상수 픽스처 사용).
function segments2DIntersect(p, q, r, s) {
  const d1 = cross2(q.x - p.x, q.y - p.y, r.x - p.x, r.y - p.y)
  const d2 = cross2(q.x - p.x, q.y - p.y, s.x - p.x, s.y - p.y)
  const d3 = cross2(s.x - r.x, s.y - r.y, p.x - r.x, p.y - r.y)
  const d4 = cross2(s.x - r.x, s.y - r.y, q.x - r.x, q.y - r.y)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return false
}
function cross2(ax, ay, bx, by) { return ax * by - ay * bx }

const v3 = (x, y, z = 0) => new THREE.Vector3(x, y, z)

describe('sortQuadConvex', () => {
  it('이미 정렬된 단위 사각형은 그대로 (자가교차 없음)', () => {
    const pts = [v3(0, 0), v3(2, 0), v3(2, 2), v3(0, 2)]
    const sorted = sortQuadConvex(pts)
    expect(sorted).toHaveLength(4)
    expect(hasSelfIntersection(sorted)).toBe(false)
  })

  it('대각선 순서로 꼬아 선택해도 정렬 후 자가교차 없음', () => {
    // 단위 사각형 코너를 (0,0) → (2,2) → (2,0) → (0,2) 순으로 입력 (bowtie)
    const pts = [v3(0, 0), v3(2, 2), v3(2, 0), v3(0, 2)]
    expect(hasSelfIntersection(pts)).toBe(true)   // 사전 검증: 입력 자체는 bowtie
    const sorted = sortQuadConvex(pts)
    expect(hasSelfIntersection(sorted)).toBe(false)
    // 정렬 결과는 원본 4 점을 모두 포함
    expect(new Set(sorted)).toEqual(new Set(pts))
  })

  it('완전 무작위 순서(여러 케이스) 모두 자가교차 없는 사각형으로 정렬', () => {
    const corners = [v3(0, 0), v3(3, 0), v3(3, 2), v3(0, 2)]
    const permutations = [
      [0,1,2,3], [0,2,1,3], [1,3,0,2], [2,0,3,1], [3,1,2,0], [1,0,3,2],
    ]
    for (const perm of permutations) {
      const pts = perm.map(i => corners[i])
      const sorted = sortQuadConvex(pts)
      expect(hasSelfIntersection(sorted), `perm ${perm.join(',')}`).toBe(false)
    }
  })

  it('비-원점 평면(Z 가 일정한 평면)도 정상 정렬', () => {
    const pts = [v3(0, 0, 5), v3(2, 2, 5), v3(2, 0, 5), v3(0, 2, 5)]
    const sorted = sortQuadConvex(pts)
    expect(hasSelfIntersection(sorted)).toBe(false)
  })

  it('약간 기울어진 평면(z 가 점마다 다른 거의-동일평면) 도 정렬 동작', () => {
    // 평면 z = x*0.1 위 사각형 코너
    const pts = [
      v3(0, 0, 0),
      v3(2, 2, 0.2),    // 대각
      v3(2, 0, 0.2),
      v3(0, 2, 0),
    ]
    const sorted = sortQuadConvex(pts)
    // 사영 후 자가교차가 없어야 (XY 사영만 검증)
    expect(hasSelfIntersection(sorted)).toBe(false)
  })

  it('4 점이 모두 일직선이면 입력 그대로 반환 (정렬 의미 없음)', () => {
    const pts = [v3(0, 0), v3(1, 0), v3(2, 0), v3(3, 0)]
    const sorted = sortQuadConvex(pts)
    expect(sorted).toEqual(pts)
  })

  it('길이가 4 가 아니면 입력 그대로 반환', () => {
    const pts3 = [v3(0, 0), v3(1, 0), v3(0, 1)]
    expect(sortQuadConvex(pts3)).toBe(pts3)
    const pts5 = [v3(0, 0), v3(1, 0), v3(1, 1), v3(0, 1), v3(0.5, 0.5)]
    expect(sortQuadConvex(pts5)).toBe(pts5)
  })
})
