import { describe, it, expect } from 'vitest'
import { rotatePointAboutAxis, rotateDirectionAboutAxis, isValidAxis } from './geometry.js'

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps

describe('geometry — 축 회전', () => {
  it('Z축 90°: (1,0,0) → (0,1,0)', () => {
    const [x, y, z] = rotatePointAboutAxis(1, 0, 0, 'Z', 90)
    expect(near(x, 0)).toBe(true)
    expect(near(y, 1)).toBe(true)
    expect(near(z, 0)).toBe(true)
  })

  it('X축 90° 방향벡터: (0,0,1) → (0,-1,0)', () => {
    const [x, y, z] = rotateDirectionAboutAxis(0, 0, 1, 'X', 90)
    expect(near(x, 0)).toBe(true)
    expect(near(y, -1)).toBe(true)
    expect(near(z, 0)).toBe(true)
  })

  it('pivot 기준 Z축 90°: pivot(1,1,0), 점(2,1,0) → (1,2,0)', () => {
    const [x, y, z] = rotatePointAboutAxis(2, 1, 0, 'Z', 90, { x: 1, y: 1, z: 0 })
    expect(near(x, 1)).toBe(true)
    expect(near(y, 2)).toBe(true)
    expect(near(z, 0)).toBe(true)
  })

  it('360° 회전은 원점 복귀(부동소수 허용)', () => {
    const [x, y, z] = rotatePointAboutAxis(3, -4, 5, 'Y', 360)
    expect(near(x, 3, 1e-6)).toBe(true)
    expect(near(y, -4, 1e-6)).toBe(true)
    expect(near(z, 5, 1e-6)).toBe(true)
  })

  it('isValidAxis', () => {
    expect(isValidAxis('X')).toBe(true)
    expect(isValidAxis('W')).toBe(false)
  })

  it('알 수 없는 축은 throw', () => {
    expect(() => rotatePointAboutAxis(1, 0, 0, 'W', 90)).toThrow()
  })
})
