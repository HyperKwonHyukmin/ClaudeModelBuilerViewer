/**
 * 응력 활용도(utilization = σ_max / 허용응력) → 연속 색 램프.
 *
 * 왜 만들었나: NastranResultOverlay 는 `exceedsLimit` 불리언 하나로 부재를
 * 파랑/빨강 2색만 칠했다. 그런데 엔지니어가 실제로 알고 싶은 건 "넘었나"가 아니라
 * "얼마나 여유가 있나"다. 허용치의 98% 인 부재와 30% 인 부재가 3D 에서 같은
 * 파란색이면 설계 여유가 없는 구간을 찾을 수 없다. members[].utilization 은 이미
 * 계산돼 하단 결과 표에 %로 나오고 있었으므로, 데이터가 아니라 시각화가 문제였다.
 *
 * 색 배치는 상용 FEA 의 무지개 컨투어가 아니라 활용도 신호등을 따른다 —
 * 파랑(여유) → 청록 → 초록(적정) → 호박(주의) → 주황(한계 근접) → 빨강(초과).
 * 활용도는 "낮을수록 좋다"는 방향이 분명해서, 파랑=낮음/빨강=높음 관례보다
 * 판단이 빠르다.
 *
 * 색만으로 판정을 전달하지 않기 위해(PRODUCT.md 접근성 규범) 같은 모듈에서
 * utilizationBandLabel() 로 텍스트 라벨도 함께 제공한다.
 */

/** 램프 정지점. at 은 활용도(0~1), color 는 0xRRGGBB. */
export const RAMP_STOPS = [
  { at: 0.00, color: 0x1E5AA8, label: '여유' },
  { at: 0.40, color: 0x2BA6C4, label: '여유' },
  { at: 0.70, color: 0x37E08A, label: '적정' },
  { at: 0.85, color: 0xFFC447, label: '주의' },
  { at: 1.00, color: 0xFF8A3D, label: '한계 근접' },
]

/** 1.0 을 넘긴 부재. 램프 보간에 참여하지 않고 단독으로 쓰인다. */
export const COLOR_EXCEEDED = 0xFF5566

/** utilization 이 없는 부재(F06 결과 누락 등). */
export const COLOR_NO_RESULT = 0x90A4B0

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function lerpColor(c1, c2, t) {
  const r = lerpChannel((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t)
  const g = lerpChannel((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t)
  const b = lerpChannel(c1 & 0xff, c2 & 0xff, t)
  return (r << 16) | (g << 8) | b
}

/**
 * 활용도 → 0xRRGGBB.
 *
 * @param {number|null|undefined} u  σ/허용응력. 1.0 = 허용응력 도달.
 * @returns {number} 색. 결과가 없으면 COLOR_NO_RESULT, 1.0 이상이면 COLOR_EXCEEDED.
 */
export function utilizationColor(u) {
  if (typeof u !== 'number' || !Number.isFinite(u)) return COLOR_NO_RESULT
  // 정확히 1.0 은 "한계 도달"이지 초과가 아니다(대부분의 설계 기준이 ≤1.0 을 허용).
  // 초과 판정의 최종 권한은 엔진의 exceedsLimit 이며, 오버레이가 그것을 함께 본다.
  if (u > 1) return COLOR_EXCEEDED

  const v = Math.max(0, u)
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    const lo = RAMP_STOPS[i]
    const hi = RAMP_STOPS[i + 1]
    if (v >= lo.at && v <= hi.at) {
      const span = hi.at - lo.at
      const t = span === 0 ? 0 : (v - lo.at) / span
      return lerpColor(lo.color, hi.color, t)
    }
  }
  return RAMP_STOPS[RAMP_STOPS.length - 1].color
}

/** 활용도 → CSS hex 문자열. 범례·표에서 3D 와 같은 색을 쓰도록. */
export function utilizationCss(u) {
  return '#' + utilizationColor(u).toString(16).padStart(6, '0')
}

/**
 * 활용도 → 사람이 읽는 라벨.
 * 색약 사용자를 위해 색 옆에 항상 이 텍스트를 함께 둔다.
 */
export function utilizationBandLabel(u) {
  if (typeof u !== 'number' || !Number.isFinite(u)) return '결과 없음'
  // 초과 경계는 utilizationColor 와 반드시 같아야 한다 — 색은 "한계 근접"인데
  // 라벨만 "초과"라고 하면 같은 부재를 두고 두 신호가 다른 말을 하게 된다.
  if (u > 1) return `허용응력 초과 (${Math.round(u * 100)}%)`
  const pct = Math.round(Math.max(0, u) * 100)
  const band = [...RAMP_STOPS].reverse().find(s => u >= s.at) ?? RAMP_STOPS[0]
  return `${pct}% · ${band.label}`
}

/**
 * 범례에 쓸 눈금. 활용도 축을 균등 분할해 색과 라벨을 함께 돌려준다.
 * @param {number} steps  눈금 개수(기본 5)
 */
export function legendTicks(steps = 5) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps
    return { at: u, pct: Math.round(u * 100), css: utilizationCss(i === steps ? 0.999 : u) }
  })
}
