/**
 * 셸(좌측 탭 패널·우측 도크·하단 도크) 전용 의미론적 색 토큰 — **다크 전용**.
 *
 * ModelBuilderStudio 에서 셸 컴포넌트를 이식하면서 함께 들여왔다. 원본은 라이트/다크를
 * 모두 내보내지만 이 앱은 다크 전용이라 `palette()` 는 인자를 받지 않고 항상 같은 값을 준다
 * (이식한 코드가 `palette(theme)` 로 호출해도 동작하도록 인자는 무시하고 받아만 둔다).
 *
 * ⚠ 새 색을 인라인으로 적지 말 것. 색의 단일 공급원은 `utils/tokens.js`(BG/LINE/INK/STATUS/ACCENT)
 * 이고, 여기 있는 값은 그 토큰을 셸이 쓰는 이름으로 다시 묶은 것뿐이다. 토큰에 없는 새 색이
 * 필요하면 tokens.js 에 먼저 넣고 여기서 참조한다.
 *
 * 3D 씬 색은 utils/colors.js, 그룹 색은 utils/groupPalette.js 가 계속 담당한다.
 */
import { BG, LINE, INK, STATUS, ACCENT } from './tokens.js'

const PALETTE = Object.freeze({
  // ── 패널 배경 ──────────────────────────────────────────────────────────
  panelBg:        BG.panel,
  panelBg2:       '#0f0f22',
  panelBg3:       BG.raised,
  overlayBg:      BG.overlay,

  // ── 구분선 ─────────────────────────────────────────────────────────────
  border:         LINE.subtle,
  borderStrong:   LINE.base,
  borderSubtle:   '#181830',

  // ── 텍스트 ─────────────────────────────────────────────────────────────
  textPrimary:    INK.strong,
  textSecondary:  INK.body,
  textMuted:      INK.dim,
  textFaint:      INK.disabled,
  textDisabled:   INK.disabled,

  // ── 섹션 라벨 헤딩 ─────────────────────────────────────────────────────
  labelColor:     '#7ab2d4',    // Model 계열(하늘)
  labelColorAlt:  '#5eead4',    // Edit·Model Check 계열(청록)

  // ── 버튼 기본 ──────────────────────────────────────────────────────────
  btnBg:          '#0f0f22',
  btnBgHover:     '#1a1a38',
  btnBorder:      LINE.strong,
  btnText:        INK.body,

  // ── 강조색 ─────────────────────────────────────────────────────────────
  accent:         STATUS.pass,
  accentLight:    ACCENT.brand,
  accentBg:       'rgba(110,231,183,0.16)',
  accentBgSoft:   'rgba(110,231,183,0.08)',
  accentBorder:   'rgba(110,231,183,0.55)',

  // ── 심각도 ─────────────────────────────────────────────────────────────
  severityDanger:       STATUS.fail,
  severityDangerBg:     'rgba(255,85,102,0.08)',
  severityDangerBorder: 'rgba(255,85,102,0.40)',
  severityWarn:         STATUS.warn,
  severityWarnBg:       'rgba(255,196,71,0.08)',
  severityWarnBorder:   'rgba(255,196,71,0.40)',

  // ── 카드·탭·입력 ───────────────────────────────────────────────────────
  cardBg:         '#1a1a3a',
  cardBgHover:    '#222244',
  cardBorder:     LINE.base,
  tabBg:          BG.dock,
  tabBgActive:    '#1a1a3a',
  tabBorder:      LINE.base,
  tabTextActive:  INK.strong,
  tabTextInactive: INK.dim,
  tabIndicator:   ACCENT.select,
  inputBg:        '#1a1a3a',
  inputText:      INK.strong,
  inputBorder:    LINE.base,

  // ── 뷰포트 ─────────────────────────────────────────────────────────────
  vpHeaderBg:     BG.dock,
  vpBg:           BG.viewport,
  divider:        LINE.subtle,
})

/** @returns {typeof PALETTE} 다크 전용 팔레트(인자는 호환용으로 무시된다). */
export function palette() {
  return PALETTE
}

/** 타이포 스케일 — 셸(패널·도크) 공용. */
export const type = Object.freeze({
  value: 15,
  label: 12.5,
  body: 12,
  meta: 11,
})

/** z-index 스케일 — 겹침 순서를 숫자 리터럴로 흩어 놓지 않기 위한 단일 정의. */
export const z = Object.freeze({
  viewportChrome: 10,   // 뷰포트 위 상시 컨트롤(뷰 프리셋·축 기즈모)
  overlayPanel: 20,     // 범례 등 떠 있는 패널
  hint: 30,             // 뷰포트 힌트바
  toast: 40,
  dialog: 50,
  blocking: 55,
  tooltip: 60,
})
