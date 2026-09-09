import { describe, expect, it } from 'vitest'
import { evaluateHoistFootprint } from './hoistPreflight.js'

const stage = {
  bbox: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
  nodeMap: new Map([
    [1, { x: 5, y: 5 }], [2, { x: 10, y: 5 }], [3, { x: 5, y: 10 }],
    [4, { x: 10, y: 10 }], [5, { x: 90, y: 90 }], [6, { x: 90, y: 10 }],
  ]),
}

describe('evaluateHoistFootprint', () => {
  it('좁게 모인 3/4점 조합을 차단한다', () => {
    expect(evaluateHoistFootprint({ 1: [1, 2, 3, 4] }, stage).ok).toBe(false)
  })

  it('충분히 펼쳐진 권상점 조합을 허용한다', () => {
    const result = evaluateHoistFootprint({ 1: [1, 5, 6] }, stage)
    expect(result.ok).toBe(true)
    expect(result.areaRatio).toBeGreaterThanOrEqual(0.1)
  })
})
