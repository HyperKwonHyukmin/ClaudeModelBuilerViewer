/**
 * Compensate TrackballControls panning for an orthographic camera.
 *
 * TrackballControls scales orthographic pan by eye length and viewport width.
 * This keeps right-drag panning close to the same screen tracking feel as the
 * previous perspective viewer.
 */
export function computeOrthoPanSpeed(eyeLength, clientWidth, track = 0.72) {
  const d = eyeLength > 1e-6 ? eyeLength : 1e-6
  const cw = clientWidth > 0 ? clientWidth : 1
  return (track * cw) / d
}
