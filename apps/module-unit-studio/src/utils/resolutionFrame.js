export const STUDIO_DESIGN_WIDTH = 1920
export const STUDIO_DESIGN_HEIGHT = 1080

/**
 * 일반 창은 기존 반응형 레이아웃을 사용한다. FHD 이상 발표 화면에서는 1920×1080을
 * 논리 작업면으로 고정하고 균일 확대해, 해상도·화면비가 바뀌어도 패널 관계를 보존한다.
 */
export function computeResolutionFrame(viewportWidth, viewportHeight) {
  const vw = Math.max(1, Number(viewportWidth) || 1)
  const vh = Math.max(1, Number(viewportHeight) || 1)
  if (vw < STUDIO_DESIGN_WIDTH || vh < STUDIO_DESIGN_HEIGHT) {
    return { mode: 'fluid', width: vw, height: vh, scale: 1, left: 0, top: 0 }
  }

  const scale = Math.min(vw / STUDIO_DESIGN_WIDTH, vh / STUDIO_DESIGN_HEIGHT)
  return {
    mode: 'presentation',
    width: STUDIO_DESIGN_WIDTH,
    height: STUDIO_DESIGN_HEIGHT,
    scale,
    left: (vw - STUDIO_DESIGN_WIDTH * scale) / 2,
    top: (vh - STUDIO_DESIGN_HEIGHT * scale) / 2,
  }
}

export function studioRenderPixelRatio(container, devicePixelRatio = 1) {
  const scale = Number(container?.closest?.('.module-studio-shell')?.dataset?.studioScale) || 1
  return Math.min(Math.max((Number(devicePixelRatio) || 1) * scale, 1), 2)
}
