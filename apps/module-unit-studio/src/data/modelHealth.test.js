import { describe, expect, it } from 'vitest'
import { getModelHealth, isModelHealthRunnable } from './modelHealth.js'

const stage = (diagnosticCounts = {}, issues = {}) => ({
  nodeMap: new Map([[1, { x: 0, y: 0, z: 0 }]]),
  elements: [{ id: 1 }],
  healthMetrics: { diagnosticCounts, issues },
})

describe('model health gate', () => {
  it('진단 오류는 후속 권상 검토를 차단한다', () => {
    const value = stage({ error: 2, warning: 1 })
    expect(getModelHealth(value).status).toBe('error')
    expect(isModelHealthRunnable(value)).toBe(false)
  })

  it('경고와 품질 이슈는 표시하되 Strict OFF 흐름을 차단하지 않는다', () => {
    const value = stage({ warning: 3 }, { freeEndNodes: 4 })
    expect(getModelHealth(value).status).toBe('warn')
    expect(isModelHealthRunnable(value)).toBe(true)
  })
})
