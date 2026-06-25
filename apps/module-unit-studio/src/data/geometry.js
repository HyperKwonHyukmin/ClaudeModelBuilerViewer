/**
 * 표준축(X/Y/Z) 기준 강체 회전 수학. 오른손 좌표계, 양각 = CCW.
 * - 점: pivot 기준 회전 (translation 포함)
 * - 방향벡터: pivot 무시(순수 방향 회전) — CBEAM/CBAR orientation 벡터용
 */

const AXES = new Set(['X', 'Y', 'Z'])
const ROTATION_EPSILON = 1e-14

function cleanRotationRoundoff(value) {
  return Math.abs(value) < ROTATION_EPSILON ? 0 : value
}

export function isValidAxis(axis) {
  return AXES.has(axis)
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * 점 (x,y,z) 를 axis 중심·pivot 기준으로 angleDeg 회전.
 * @returns {[number, number, number]}
 */
export function rotatePointAboutAxis(x, y, z, axis, angleDeg, pivot = { x: 0, y: 0, z: 0 }) {
  if (!AXES.has(axis)) throw new Error(`알 수 없는 회전축: ${axis}`)
  const r = degToRad(angleDeg)
  const c = Math.cos(r)
  const s = Math.sin(r)
  const px = pivot?.x ?? 0, py = pivot?.y ?? 0, pz = pivot?.z ?? 0
  const dx = x - px, dy = y - py, dz = z - pz
  let rx = dx, ry = dy, rz = dz
  if (axis === 'X') {
    ry = dy * c - dz * s
    rz = dy * s + dz * c
  } else if (axis === 'Y') {
    rz = dz * c - dx * s
    rx = dz * s + dx * c
  } else { // 'Z'
    rx = dx * c - dy * s
    ry = dx * s + dy * c
  }
  return [rx + px, ry + py, rz + pz]
}

/**
 * 방향 벡터 (vx,vy,vz) 를 axis 중심으로 angleDeg 회전 (pivot 평행이동 없음).
 * @returns {[number, number, number]}
 */
export function rotateDirectionAboutAxis(vx, vy, vz, axis, angleDeg) {
  return rotatePointAboutAxis(vx, vy, vz, axis, angleDeg, { x: 0, y: 0, z: 0 })
    .map(cleanRotationRoundoff)
}
