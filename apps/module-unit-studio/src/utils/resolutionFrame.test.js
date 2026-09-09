import { describe, expect, it } from 'vitest'
import { computeResolutionFrame, studioRenderPixelRatio } from './resolutionFrame.js'

describe('computeResolutionFrame', () => {
  it('keeps ordinary and half-screen Studio windows fluid', () => {
    expect(computeResolutionFrame(1366, 768)).toMatchObject({ mode: 'fluid', width: 1366, height: 768, scale: 1, left: 0, top: 0 })
    expect(computeResolutionFrame(960, 1040)).toMatchObject({ mode: 'fluid', width: 960, height: 1040, scale: 1 })
  })

  it('maps a 4K presentation display to the intended 1920x1080 layout', () => {
    expect(computeResolutionFrame(3840, 2160)).toEqual({ mode: 'presentation', width: 1920, height: 1080, scale: 2, left: 0, top: 0 })
  })

  it('centres the intended 16:9 layout on ultrawide and 16:10 displays', () => {
    const ultrawide = computeResolutionFrame(3440, 1440)
    expect(ultrawide.scale).toBeCloseTo(4 / 3)
    expect(ultrawide.left).toBeCloseTo(440)
    expect(ultrawide.top).toBeCloseTo(0)

    const sixteenTen = computeResolutionFrame(2560, 1600)
    expect(sixteenTen.scale).toBeCloseTo(4 / 3)
    expect(sixteenTen.left).toBeCloseTo(0)
    expect(sixteenTen.top).toBeCloseTo(80)
  })

  it('sanitises transient zero-size resize observations', () => {
    expect(computeResolutionFrame(0, 0)).toMatchObject({ mode: 'fluid', width: 1, height: 1, scale: 1 })
  })

  it('raises WebGL density with presentation scale without exceeding the GPU cap', () => {
    const container = { closest: () => ({ dataset: { studioScale: '1.333333' } }) }
    expect(studioRenderPixelRatio(container, 1)).toBeCloseTo(1.333333)
    expect(studioRenderPixelRatio(container, 2)).toBe(2)
  })
})
