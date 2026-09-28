import { describe, expect, it } from 'vitest'
import { studioRenderPixelRatio } from './renderPixelRatio.js'

describe('studioRenderPixelRatio', () => {
  it('uses the browser display density without applying a second layout scale', () => {
    expect(studioRenderPixelRatio(1)).toBe(1)
    expect(studioRenderPixelRatio(1.5)).toBe(1.5)
    expect(studioRenderPixelRatio(2)).toBe(2)
  })

  it('caps unusually dense displays to protect WebGL performance', () => {
    expect(studioRenderPixelRatio(3)).toBe(2)
    expect(studioRenderPixelRatio(0)).toBe(1)
  })
})
