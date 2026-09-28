/**
 * Chromium/Electron이 Windows 디스플레이 배율을 devicePixelRatio에 이미 반영한다.
 * CSS 작업면의 별도 확대율을 다시 곱하지 않고 GPU 부담만 상한 2로 제한한다.
 */
export function studioRenderPixelRatio(devicePixelRatio = 1) {
  return Math.min(Math.max(Number(devicePixelRatio) || 1, 1), 2)
}
