import { describe, it, expect } from 'vitest'
import { computeFitFraming, sceneHalfExtentsAbout, STANDARD_VIEWS } from './viewportFraming.js'

// bbox 반extent(scene m). 종방향(X) 30m · 횡방향(Y) 6m · 높이(Z) 4m 인 전형적 모듈 형상.
const HALF = { x: 15, y: 3, z: 2 }

describe('computeFitFraming — 전체 모델이 화면에 담기는 프레이밍 계산', () => {
  it('평면도(+Z 에서 내려다봄, up=+X)에서 화면 세로는 X, 가로는 Y 를 담는다', () => {
    const f = computeFitFraming({
      halfExtents: HALF,
      dir: { x: 0, y: 0, z: 1 },
      up:  { x: 1, y: 0, z: 0 },
      fovDeg: 45, aspect: 2, margin: 1,
    })
    // up=+X → 화면 세로축이 X(반extent 15), 가로축이 Y(반extent 3)
    expect(f.halfHeight).toBeCloseTo(15, 6)
    expect(f.halfWidth).toBeCloseTo(3, 6)
    // 시선 방향(Z) 성분은 깊이
    expect(f.halfDepth).toBeCloseTo(2, 6)
  })

  it('직교 반높이는 가로가 넘칠 때 aspect 로 환산해 키운다', () => {
    // 정면도 aspect=1 → 가로 15 가 세로 2 보다 훨씬 크므로 반높이는 15/1 로 결정된다
    const f = computeFitFraming({
      halfExtents: HALF,
      dir: { x: 0, y: 1, z: 0 },
      up:  { x: 0, y: 0, z: 1 },
      fovDeg: 45, aspect: 1, margin: 1,
    })
    expect(f.orthoHalfHeight).toBeCloseTo(15, 6)
  })

  it('가로로 넓은(aspect 큰) 화면일수록 직교 반높이는 작아진다', () => {
    const base = { halfExtents: HALF, dir: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, fovDeg: 45, margin: 1 }
    const wide   = computeFitFraming({ ...base, aspect: 3 })
    const narrow = computeFitFraming({ ...base, aspect: 1 })
    expect(wide.orthoHalfHeight).toBeLessThan(narrow.orthoHalfHeight)
    // 가로 15 를 aspect 3 으로 나누면 5 → 세로(2) 보다 크므로 5 가 반높이
    expect(wide.orthoHalfHeight).toBeCloseTo(5, 6)
  })

  it('margin 은 화면 반폭/반높이에 그대로 곱해진다(여백 확보)', () => {
    const a = computeFitFraming({ halfExtents: HALF, dir: { x: 0, y: 0, z: 1 }, up: { x: 1, y: 0, z: 0 }, fovDeg: 45, aspect: 1, margin: 1 })
    const b = computeFitFraming({ halfExtents: HALF, dir: { x: 0, y: 0, z: 1 }, up: { x: 1, y: 0, z: 0 }, fovDeg: 45, aspect: 1, margin: 1.1 })
    expect(b.halfHeight).toBeCloseTo(a.halfHeight * 1.1, 6)
    expect(b.halfWidth).toBeCloseTo(a.halfWidth * 1.1, 6)
  })

  it('up 이 시선과 평행해도(퇴화) 유효한 프레이밍을 낸다', () => {
    // 평면도에서 up 을 실수로 +Z(=시선)로 준 경우 — NaN 없이 X/Y 를 담아야 한다.
    const f = computeFitFraming({
      halfExtents: HALF,
      dir: { x: 0, y: 0, z: 1 },
      up:  { x: 0, y: 0, z: 1 },
      fovDeg: 45, aspect: 1, margin: 1,
    })
    expect(Number.isFinite(f.distance)).toBe(true)
    expect(Number.isFinite(f.orthoHalfHeight)).toBe(true)
    // 화면 평면은 X/Y 이므로 반폭·반높이는 {15, 3} 의 조합이어야 한다
    expect(Math.max(f.halfWidth, f.halfHeight)).toBeCloseTo(15, 6)
    expect(Math.min(f.halfWidth, f.halfHeight)).toBeCloseTo(3, 6)
  })

  it('등각 시선은 축정렬 뷰보다 더 큰 화면 반extent 를 요구한다(대각선 투영)', () => {
    const iso = computeFitFraming({
      halfExtents: HALF, dir: STANDARD_VIEWS.iso.dir, up: STANDARD_VIEWS.iso.up,
      fovDeg: 45, aspect: 1, margin: 1,
    })
    const side = computeFitFraming({
      halfExtents: HALF, dir: STANDARD_VIEWS.side.dir, up: STANDARD_VIEWS.side.up,
      fovDeg: 45, aspect: 1, margin: 1,
    })
    // 측면도는 Y(3)/Z(2) 만 보이지만 등각은 X 성분까지 화면에 실려 훨씬 넓다
    expect(iso.orthoHalfHeight).toBeGreaterThan(side.orthoHalfHeight)
  })

  it('halfExtent 가 0 인 퇴화 모델에서도 0 이나 NaN 을 반환하지 않는다', () => {
    const f = computeFitFraming({
      halfExtents: { x: 0, y: 0, z: 0 },
      dir: { x: 0, y: 0, z: 1 },
      up:  { x: 1, y: 0, z: 0 },
      fovDeg: 45, aspect: 1,
    })
    expect(f.distance).toBeGreaterThan(0)
    expect(f.orthoHalfHeight).toBeGreaterThan(0)
  })
})

// 이 스튜디오는 회전 중심을 무게중심(CoG)에 고정한다 — 프레이밍 기준점이 bbox 중심이 아닐 수
// 있으므로, 기준점에서 잰 반extent 로 계산해야 모델 전체가 화면에 남는다.
describe('sceneHalfExtentsAbout — 기준점(pivot)에서 잰 scene 반extent', () => {
  // 100m × 20m × 10m (mm 단위), 중심 원점
  const stage = {
    bbox: { minX: -50000, maxX: 50000, minY: -10000, maxY: 10000, minZ: -5000, maxZ: 5000 },
    center: { x: 0, y: 0, z: 0 },
  }

  it('pivot 이 bbox 중심(원점)이면 통상 반extent 와 같다', () => {
    const h = sceneHalfExtentsAbout(stage, { x: 0, y: 0, z: 0 })
    expect(h.x).toBeCloseTo(50, 6)
    expect(h.y).toBeCloseTo(10, 6)
    expect(h.z).toBeCloseTo(5, 6)
  })

  it('pivot 이 치우치면 먼 쪽 면까지의 거리를 반extent 로 쓴다', () => {
    // X=+30m 로 치우친 무게중심 → 먼 쪽(minX=-50m)까지 80m
    const h = sceneHalfExtentsAbout(stage, { x: 30, y: 0, z: 0 })
    expect(h.x).toBeCloseTo(80, 6)
    expect(h.y).toBeCloseTo(10, 6)
  })

  it('pivot 이 bbox 밖이어도 전체를 덮는 반extent 를 낸다', () => {
    const h = sceneHalfExtentsAbout(stage, { x: 0, y: 0, z: 40 })
    expect(h.z).toBeCloseTo(45, 6)
  })

  it('center 가 원점이 아닌 모델도 scene 좌표(center 차감)로 환산한다', () => {
    const shifted = {
      bbox: { minX: 0, maxX: 100000, minY: 0, maxY: 20000, minZ: 0, maxZ: 10000 },
      center: { x: 50000, y: 10000, z: 5000 },
    }
    const h = sceneHalfExtentsAbout(shifted, { x: 0, y: 0, z: 0 })
    expect(h.x).toBeCloseTo(50, 6)
    expect(h.y).toBeCloseTo(10, 6)
    expect(h.z).toBeCloseTo(5, 6)
  })

  it('pivot 이 없으면 bbox 중심 기준으로 계산한다', () => {
    const h = sceneHalfExtentsAbout(stage, null)
    expect(h.x).toBeCloseTo(50, 6)
  })

  it('bbox 가 없으면 안전한 기본값을 낸다', () => {
    const h = sceneHalfExtentsAbout(null, null)
    expect(h.x).toBeGreaterThan(0)
    expect(h.y).toBeGreaterThan(0)
    expect(h.z).toBeGreaterThan(0)
  })
})

describe('STANDARD_VIEWS — A/S/D/등각 시선 정의', () => {
  it('평면(A)은 +Z 에서 내려다보고 화면 위쪽이 X(종방향)', () => {
    expect(STANDARD_VIEWS.top.dir).toEqual({ x: 0, y: 0, z: 1 })
    expect(STANDARD_VIEWS.top.up).toEqual({ x: 1, y: 0, z: 0 })
  })
  it('정면(S)은 -Y 에서 보고 화면 위쪽이 Z(수직)', () => {
    expect(STANDARD_VIEWS.front.dir).toEqual({ x: 0, y: -1, z: 0 })
    expect(STANDARD_VIEWS.front.up).toEqual({ x: 0, y: 0, z: 1 })
  })
  it('측면(D)은 +X 에서 보고 화면 위쪽이 Z(수직)', () => {
    expect(STANDARD_VIEWS.side.dir).toEqual({ x: 1, y: 0, z: 0 })
    expect(STANDARD_VIEWS.side.up).toEqual({ x: 0, y: 0, z: 1 })
  })
})
