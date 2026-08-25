/**
 * UI 디자인 토큰 — 인라인 스타일이 참조하는 단일 공급원.
 *
 * 왜 필요한가: 이 앱은 Tailwind className 대신 인라인 style 로 UI 를 그린다(710곳).
 * 그러다 보니 같은 역할의 회색이 파일마다 조금씩 달라져 텍스트 색 35종·radius 9종이
 * 생겼고, 그 과정에서 대비 기준(본문 4.5:1)을 못 지키는 값이 섞여 들어왔다.
 * 색·크기·모서리 값을 여기서만 정하면 그 표류가 멈춘다.
 *
 * 3D 씬 색은 utils/colors.js, 그룹 색은 utils/groupPalette.js 가 계속 담당한다.
 *
 * 대비 수치는 모두 패널 배경 BG.panel(#0b0b1e) 기준으로 계산했다.
 * 뷰포트(#0d0d1a)·도크(#12122a) 위에서는 배경이 더 밝아 값이 소폭 낮아지지만,
 * INK 계열은 그 경우에도 4.5:1 을 넘도록 골랐다.
 */

/** 배경 — 어두운 순서대로. panel=좌측 도크, viewport=3D 캔버스, dock=하단 결과 영역. */
export const BG = {
  deepest:  '#0a0a18',
  panel:    '#0b0b1e',
  viewport: '#0d0d1a',
  raised:   '#101024',
  dock:     '#12122a',
  overlay:  'rgba(11,11,30,0.97)',
}

/** 테두리·구분선. */
export const LINE = {
  subtle: '#1e1e38',
  base:   '#2a2a4a',
  strong: '#2e2e50',
  muted:  '#3a3a52',
}

/**
 * 텍스트 — 위계 4단계 + 비활성 1종.
 *
 * disabled 는 WCAG 1.4.3 이 명시적으로 면제하는 "비활성 UI 구성요소" 전용이다.
 * 읽어야 하는 텍스트(비활성 탭 라벨, 선택 가능한 항목명 등)에는 쓰지 말 것 —
 * 그건 disabled 가 아니라 muted 다.
 */
export const INK = {
  strong:   '#e6f1ff',   // 제목·강조 수치
  body:     '#cad8e8',   // 기본 본문
  muted:    '#9fb4cc',   // 보조 설명            (6.8:1)
  dim:      '#8aa0b8',   // 가장 흐린 '읽는' 텍스트 (6.8:1)
  disabled: '#5a5a80',   // 비활성 컨트롤 전용    (2.8:1, WCAG 면제)
}

/** 상태 — 색만으로 판정을 전달하지 말 것. 항상 텍스트·아이콘을 병기한다. */
export const STATUS = {
  pass:    '#37E08A',
  warn:    '#FFC447',
  fail:    '#FF5566',
  info:    '#90E8FF',
  neutral: '#90A4B0',
}

/** 액센트 — accent=브랜드 에메랄드(탭 활성), focus=포커스 링, select=선택 강조. */
export const ACCENT = {
  brand:  '#6ee7b7',
  cyan:   '#00D1FF',
  select: '#4682B4',
}

/**
 * 폰트 크기 — 최소 10px.
 *
 * 이전에는 8/8.5/9/10/11/12/13px 이 5px 대역에 몰려 위계가 성립하지 않았고,
 * 8px 배지는 대비 계산 이전에 이미 읽기 어려웠다.
 */
export const FONT = {
  xs:   10,   // 배지·칩 (최소값)
  sm:   11,   // 보조 라벨
  base: 12,   // 본문 기본
  md:   13,   // 소제목
  lg:   15,   // 섹션 제목
  xl:   22,   // 대표 수치
}

/** 모서리 — 3단계. 이전 9종(3/4/5/6/7/8/10/12/50%)을 여기로 수렴시킨다. */
export const RADIUS = {
  sm:   4,
  md:   7,
  lg:   10,
  full: 9999,
}

/** 여백 — 4의 배수. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
