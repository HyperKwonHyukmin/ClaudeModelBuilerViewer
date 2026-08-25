import { describe, it, expect } from 'vitest'
import { utilizationColor, utilizationCss, RAMP_STOPS, utilizationBandLabel } from './stressColorRamp.js'

/**
 * 응력 활용도(utilization = σ / 허용응력) → 색.
 *
 * 이전 오버레이는 exceedsLimit 불리언 하나로 파랑/빨강 2색만 칠했다. 허용치의 98% 인
 * 부재와 30% 인 부재가 같은 파란색이라 설계 여유가 없는 구간을 3D 에서 찾을 수 없었다.
 * 여기서 검증하는 성질은 "단조성"과 "경계에서의 확정성" 두 가지다.
 */

describe('utilizationColor 경계값', () => {
  it('0 이면 램프의 첫 stop 색', () => {
    expect(utilizationColor(0)).toBe(RAMP_STOPS[0].color)
  })

  it('1.0 을 넘으면 초과색으로 고정된다', () => {
    const over = utilizationColor(1.0001)
    expect(utilizationColor(1.5)).toBe(over)
    expect(utilizationColor(99)).toBe(over)
  })

  it('정확히 1.0 은 초과가 아니라 램프의 마지막 색 — 대부분의 기준이 ≤1.0 을 허용한다', () => {
    expect(utilizationColor(1.0)).toBe(RAMP_STOPS[RAMP_STOPS.length - 1].color)
    expect(utilizationColor(1.0)).not.toBe(utilizationColor(1.0001))
  })

  it('각 stop 위치에서 정확히 그 stop 색을 낸다 (보간 오차 없음)', () => {
    for (const s of RAMP_STOPS) {
      expect(utilizationColor(s.at)).toBe(s.color)
    }
  })
})

describe('utilizationColor 단조성', () => {
  // 활용도가 오르면 색은 "차가움 → 뜨거움" 방향으로만 가야 한다.
  // R 채널은 단조 증가, B 채널은 단조 감소로 확인한다.
  const sample = Array.from({ length: 41 }, (_, i) => i / 40)   // 0 ~ 1.0

  it('R 채널이 감소하지 않는다', () => {
    const reds = sample.map(u => (utilizationColor(u) >> 16) & 0xff)
    for (let i = 1; i < reds.length; i++) {
      expect(reds[i]).toBeGreaterThanOrEqual(reds[i - 1])
    }
  })

  // 파랑 채널 단조 감소는 성립하지 않는다 — 남색(#1E5AA8, B=168)에서 청록(#2BA6C4, B=196)
  // 으로 갈 때 파랑이 오히려 올라간다. 청록이 남색보다 더 파랗기 때문이고, 이건 램프의
  // 결함이 아니다. 대신 컨투어를 읽을 때 실제로 필요한 성질을 검증한다:
  // 활용도가 0.2 벌어지면 색도 눈에 띄게 벌어져야 한다.
  it('활용도가 0.2 차이 나면 색이 뚜렷이 구분된다', () => {
    const dist = (a, b) => {
      const d = (sh) => (((a >> sh) & 0xff) - ((b >> sh) & 0xff)) ** 2
      return Math.sqrt(d(16) + d(8) + d(0))
    }
    for (let u = 0; u <= 0.8; u += 0.05) {
      const near = utilizationColor(u)
      const far = utilizationColor(u + 0.2)
      expect(dist(near, far)).toBeGreaterThan(30)
    }
  })

  it('여유가 큰 부재와 한계 직전 부재가 실제로 다른 색이다', () => {
    expect(utilizationColor(0.30)).not.toBe(utilizationColor(0.95))
  })
})

describe('비정상 입력', () => {
  it('null·NaN·undefined 는 결과 없음 색(회색)을 낸다', () => {
    const none = utilizationColor(null)
    expect(utilizationColor(undefined)).toBe(none)
    expect(utilizationColor(NaN)).toBe(none)
    expect(utilizationColor('0.5')).toBe(none)
  })

  it('음수는 0 으로 클램프된다', () => {
    expect(utilizationColor(-0.2)).toBe(utilizationColor(0))
  })
})

describe('utilizationCss', () => {
  it('CSS hex 문자열을 낸다', () => {
    expect(utilizationCss(0.5)).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('utilizationColor 와 같은 색을 가리킨다', () => {
    expect(utilizationCss(0.72)).toBe('#' + utilizationColor(0.72).toString(16).padStart(6, '0'))
  })
})

describe('색과 라벨의 일치', () => {
  // 같은 부재를 두고 색은 "한계 근접", 라벨은 "초과"라고 말하면 안 된다.
  const samples = [0, 0.5, 0.85, 0.999, 1.0, 1.0001, 1.5]
  for (const u of samples) {
    it(`u=${u} 에서 초과 여부가 색과 라벨에서 같다`, () => {
      const colorSaysExceeded = utilizationColor(u) === utilizationColor(2)
      const labelSaysExceeded = utilizationBandLabel(u).includes('초과')
      expect(colorSaysExceeded).toBe(labelSaysExceeded)
    })
  }
})

describe('utilizationBandLabel', () => {
  it('초과 구간을 명시한다 — 색만으로 판정을 전달하지 않기 위한 텍스트', () => {
    expect(utilizationBandLabel(1.2)).toContain('초과')
  })
  it('결과 없음을 구분한다', () => {
    expect(utilizationBandLabel(null)).toContain('없음')
  })
  it('정상 구간은 백분율을 포함한다', () => {
    expect(utilizationBandLabel(0.42)).toContain('42')
  })
})

describe('RAMP_STOPS', () => {
  it('at 이 오름차순이고 0 에서 시작해 1 에서 끝난다', () => {
    const ats = RAMP_STOPS.map(s => s.at)
    expect(ats).toEqual([...ats].sort((a, b) => a - b))
    expect(ats[0]).toBe(0)
    expect(ats[ats.length - 1]).toBe(1)
  })
})
