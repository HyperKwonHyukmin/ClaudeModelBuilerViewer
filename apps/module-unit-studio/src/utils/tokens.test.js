import { describe, it, expect } from 'vitest'
import { BG, INK, STATUS, ACCENT, FONT, RADIUS } from './tokens.js'

/**
 * 토큰이 지키기로 한 약속을 실행 가능한 형태로 고정한다.
 *
 * 색을 눈으로 고르면 대비는 반드시 다시 무너진다(이 앱이 실제로 그렇게 됐다).
 * 여기서 막으면 새 회색을 추가할 때 CI 가 먼저 알려준다.
 */

/** sRGB hex → 상대 휘도 (WCAG 2.x). */
function luminance(hex) {
  const m = hex.replace('#', '')
  const ch = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16) / 255)
  const [r, g, b] = ch.map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 두 색의 대비비 (1 ~ 21). */
export function contrast(fg, bg) {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// 텍스트가 실제로 얹히는 배경들. overlay 는 알파라 제외.
const TEXT_BACKGROUNDS = [BG.deepest, BG.panel, BG.viewport, BG.raised, BG.dock]

describe('INK 토큰 대비', () => {
  // disabled 는 WCAG 1.4.3 이 비활성 컨트롤로 면제하므로 대상에서 뺀다.
  const readable = { strong: INK.strong, body: INK.body, muted: INK.muted, dim: INK.dim }

  for (const [name, color] of Object.entries(readable)) {
    for (const bg of TEXT_BACKGROUNDS) {
      it(`INK.${name} 이 ${bg} 위에서 본문 기준 4.5:1 이상`, () => {
        expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('위계가 실제로 단조 감소한다 (strong > body > muted ≥ dim)', () => {
    const c = (x) => contrast(x, BG.panel)
    expect(c(INK.strong)).toBeGreaterThan(c(INK.body))
    expect(c(INK.body)).toBeGreaterThan(c(INK.muted))
    expect(c(INK.muted)).toBeGreaterThanOrEqual(c(INK.dim))
  })

  it('disabled 는 읽는 텍스트보다 확실히 흐리다 — 오용하면 눈에 띄게 만든다', () => {
    expect(contrast(INK.disabled, BG.panel)).toBeLessThan(contrast(INK.dim, BG.panel))
  })
})

describe('STATUS 토큰 대비', () => {
  // 판정 색은 굵게(≥700) 쓰이므로 큰 텍스트 기준 3:1 을 적용한다.
  for (const [name, color] of Object.entries(STATUS)) {
    for (const bg of TEXT_BACKGROUNDS) {
      it(`STATUS.${name} 이 ${bg} 위에서 3:1 이상`, () => {
        expect(contrast(color, bg)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

describe('ACCENT 토큰 대비', () => {
  it('브랜드 액센트가 패널 위에서 3:1 이상 (활성 탭 라벨)', () => {
    expect(contrast(ACCENT.brand, BG.panel)).toBeGreaterThanOrEqual(3)
  })
  it('포커스 링 색이 패널 위에서 3:1 이상 — 안 보이면 포커스 링이 아니다', () => {
    expect(contrast(ACCENT.brand, BG.panel)).toBeGreaterThanOrEqual(3)
  })
})

describe('FONT 스케일', () => {
  it('최소 크기가 10px 이상', () => {
    expect(Math.min(...Object.values(FONT))).toBeGreaterThanOrEqual(10)
  })
  it('단계가 오름차순이고 중복이 없다', () => {
    const v = Object.values(FONT)
    expect(v).toEqual([...v].sort((a, b) => a - b))
    expect(new Set(v).size).toBe(v.length)
  })
})

describe('RADIUS 스케일', () => {
  it('full 을 뺀 단계가 3종 이하 — 이전 9종으로 되돌아가지 않게', () => {
    const steps = Object.entries(RADIUS).filter(([k]) => k !== 'full')
    expect(steps.length).toBeLessThanOrEqual(3)
  })
})
