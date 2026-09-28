import { describe, it, expect } from 'vitest'
import { liftingBdfAvailability, op2Availability } from './structuralDownloads.js'

describe('liftingBdfAvailability — 자세안정성 평가 후에만', () => {
  const ready = { hostReady: true, stabilityPath: 'C:/uc/m_stability.json' }
  it('평가 전(overall null)에는 비활성', () => {
    expect(liftingBdfAvailability({ ...ready, overall: null }).enabled).toBe(false)
  })
  it('PASS·WARN 이면 활성', () => {
    expect(liftingBdfAvailability({ ...ready, overall: 'pass' })).toEqual({ enabled: true, reason: '' })
    expect(liftingBdfAvailability({ ...ready, overall: 'warn' }).enabled).toBe(true)
  })
  it('FAIL 이면 비활성 — 해석할 수 없는 권상 조건', () => {
    const r = liftingBdfAvailability({ ...ready, overall: 'fail' })
    expect(r.enabled).toBe(false)
    expect(r.reason).toMatch(/FAIL/)
  })
  it('stability JSON 경로가 없거나 WorkBench 밖이면 비활성', () => {
    expect(liftingBdfAvailability({ ...ready, overall: 'pass', stabilityPath: null }).enabled).toBe(false)
    expect(liftingBdfAvailability({ ...ready, overall: 'pass', hostReady: false }).enabled).toBe(false)
  })
})

describe('op2Availability — 구조 해석 성공 후에만', () => {
  it('성공 + analysisId 면 활성', () => {
    expect(op2Availability({ status: 'Success', analysisId: 12, hostReady: true }).enabled).toBe(true)
  })
  it('미실행·실행 중·실패·analysisId 없음은 비활성', () => {
    for (const status of [null, 'Pending', 'Running', 'Failed']) {
      expect(op2Availability({ status, analysisId: 12, hostReady: true }).enabled).toBe(false)
    }
    expect(op2Availability({ status: 'Success', analysisId: null, hostReady: true }).enabled).toBe(false)
    expect(op2Availability({ status: 'Success', analysisId: 12, hostReady: false }).enabled).toBe(false)
  })
})

it('WorkBench 앱 안인데 기능이 없으면 업데이트 안내', () => {
  expect(op2Availability({ status: 'Success', analysisId: 1, hostReady: false, isElectron: true }).reason).toMatch(/업데이트/)
  expect(liftingBdfAvailability({ overall: 'pass', stabilityPath: 'x', hostReady: false }).reason).toMatch(/환경에서만/)
})
