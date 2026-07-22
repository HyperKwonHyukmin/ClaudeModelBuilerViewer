import { describe, it, expect } from 'vitest'
import { paletteFor } from './HoistGuideToast.jsx'

describe('HoistGuideToast.paletteFor', () => {
  it("'error' 는 빨강 계열(실패) 팔레트를 반환한다", () => {
    const p = paletteFor('error')
    expect(p.icon_color).toBe('#FF5566')
    expect(p.border).toMatch(/255, 85, 102/)
  })

  it("'error'(실패) 는 'noMode'(주의) 와 색이 명확히 구분된다", () => {
    expect(paletteFor('error').icon_color).not.toBe(paletteFor('noMode').icon_color)
    expect(paletteFor('error').border).not.toBe(paletteFor('noMode').border)
  })

  it("'noMode' 는 여전히 호박색(주의) — 회귀 방지", () => {
    expect(paletteFor('noMode').icon_color).toBe('#FFB800')
  })

  it("'success'=초록, 기본(info/미지정)=시안 유지", () => {
    expect(paletteFor('success').icon_color).toBe('#6AE07A')
    expect(paletteFor('info').icon_color).toBe('#00D1FF')
    expect(paletteFor(undefined).icon_color).toBe('#00D1FF')
  })
})
