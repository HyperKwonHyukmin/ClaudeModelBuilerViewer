import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, HelpCircle, X } from 'lucide-react'
import { BG, LINE, INK, STATUS, ACCENT, FONT, RADIUS } from '../../utils/tokens.js'

/**
 * TabPanel — 좌측 탭 패널의 공통 4구역 틀 (ModelBuilderStudio 에서 이식).
 *
 *   ┌ 헤더 ─────────────┐  아이콘·제목·1줄 목적·[?] 팝오버
 *   ├ 상태 스트립 ──────┤  이 탭의 현재 상태 요약 (status prop)
 *   ├ 입력 (스크롤) ────┤  children — Accordion 섹션들
 *   ├ 액션 푸터 (고정) ─┤  footer — 주 실행 버튼·차단 사유
 *   └───────────────────┘
 *
 * 6개 탭(Model / Model Check / Edit / Hoist / Analysis / Save)이 같은 순서를 가져야 사용자가
 * 한 번 배운 눈 움직임을 재사용한다. 도움말 문단은 본문에 두지 않는다 — `help` 로 넘기면
 * `?` 팝오버에만 나온다.
 *
 * ⚠ 원본은 라이트/다크 `palette(theme)` 를 받지만 이 앱은 다크 전용이라 utils/tokens.js 를 쓴다.
 * 새 색을 인라인으로 적지 말고 토큰을 쓸 것(대비 기준이 토큰에 계산돼 있다).
 */
export const TAB_PANEL_WIDTH = 300

export default function TabPanel({ id, title, purpose, icon: Icon, status, help, footer, children, headerExtra, width = TAB_PANEL_WIDTH, extra }) {
  return (
    <section
      aria-labelledby={`tab-title-${id}`}
      style={{
        width, flexShrink: 0, height: '100%', position: 'relative',
        display: 'flex', flexDirection: 'column', minHeight: 0,
        background: BG.panel, borderRight: `1px solid ${LINE.subtle}`,
      }}>
      {/* 헤더 */}
      <header style={{ padding: '10px 10px 8px', borderBottom: `1px solid ${LINE.subtle}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {Icon && <Icon size={15} color={ACCENT.brand} aria-hidden="true" />}
          <h2 id={`tab-title-${id}`} style={{
            margin: 0, flex: 1, fontSize: FONT.md, fontWeight: 900,
            color: INK.strong, letterSpacing: 0.3, whiteSpace: 'nowrap',
          }}>{title}</h2>
          {headerExtra}
          {help && <HelpPopover title={title}>{help}</HelpPopover>}
        </div>
        {purpose && (
          <p style={{ margin: '5px 0 0 22px', fontSize: FONT.xs, color: INK.dim, lineHeight: 1.5 }}>{purpose}</p>
        )}
      </header>

      {/* 상태 스트립 */}
      {status && (
        <div style={{ padding: '7px 10px', borderBottom: `1px solid ${LINE.subtle}`, background: BG.raised, flexShrink: 0 }}>
          {status}
        </div>
      )}

      {/* 입력 — 스크롤 영역 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        {children}
      </div>

      {/* 액션 푸터 — 스크롤과 무관하게 항상 보인다 */}
      {footer && (
        <footer style={{
          flexShrink: 0, padding: '9px 10px 10px',
          borderTop: `1px solid ${LINE.strong}`, background: BG.panel,
          display: 'flex', flexDirection: 'column', gap: 6,
          boxShadow: '0 -6px 14px -8px rgba(0,0,0,0.55)',
        }}>
          {footer}
        </footer>
      )}

      {/* extra — 패널 전체에 겹치는 것(예: Model 탭의 폭 리사이즈 핸들). */}
      {extra}
    </section>
  )
}

const TONE_COLOR = {
  ok: STATUS.pass, warn: STATUS.warn, danger: STATUS.fail, info: STATUS.info, muted: INK.dim,
}

/**
 * 상태 스트립 한 줄 — 아이콘 + 텍스트. 색은 보조 정보이고 아이콘·텍스트가 뜻을 전한다.
 * tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted'
 */
export function StatusLine({ tone = 'muted', icon: Icon, children, right }) {
  const color = TONE_COLOR[tone] ?? INK.dim
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.base,
      color, fontWeight: 700, lineHeight: 1.4, minWidth: 0,
    }}>
      {Icon && <Icon size={13} aria-hidden="true" style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, color: tone === 'muted' ? INK.body : color }}>{children}</span>
      {right && <span style={{ flexShrink: 0, fontSize: FONT.xs, color: INK.dim, fontWeight: 600 }}>{right}</span>}
    </div>
  )
}

/**
 * 아코디언 섹션 — 탭 패널 입력 구역의 기본 단위.
 * 기본 펼침/접힘은 탭별로 지정하고, 사용자가 바꾼 상태는 컴포넌트가 살아 있는 동안 유지된다.
 * tone='alt' 는 청록 계열 라벨(Edit·Model Check 관례), 기본은 하늘 계열(Model 관례).
 */
export function Accordion({ title, defaultOpen = true, badge, children, tone, contentGap = 6 }) {
  const [open, setOpen] = useState(defaultOpen)
  const titleColor = tone === 'alt' ? '#5eead4' : '#7ab2d4'
  return (
    <div style={{ borderBottom: `1px solid ${LINE.subtle}` }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '9px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: titleColor, fontSize: FONT.xs, fontWeight: 800, letterSpacing: 1.3,
          textTransform: 'uppercase', textAlign: 'left',
        }}>
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
        <span style={{ flex: 1 }}>{title}</span>
        {badge != null && (
          <span style={{
            fontSize: FONT.xs, fontWeight: 800, letterSpacing: 0, textTransform: 'none', color: INK.body,
            background: BG.raised, border: `1px solid ${LINE.base}`, borderRadius: RADIUS.full, padding: '1px 7px',
          }}>{badge}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: '0 8px 11px', display: 'flex', flexDirection: 'column', gap: contentGap }}>
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * `?` 팝오버 — 탭 개요·조작법. 본문에 문단을 늘어놓는 대신 여기로 뺀다.
 * Esc·바깥 클릭으로 닫힌다.
 */
export function HelpPopover({ title, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="이 탭 도움말"
        title="이 탭 도움말"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: RADIUS.md, cursor: 'pointer',
          background: open ? 'rgba(110,231,183,0.16)' : 'transparent',
          color: open ? ACCENT.brand : INK.dim,
          border: `1px solid ${open ? 'rgba(110,231,183,0.55)' : LINE.base}`,
        }}>
        <HelpCircle size={14} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label={`${title} 도움말`} style={{
          position: 'absolute', top: 30, left: 0, zIndex: 3000,
          width: 320, maxHeight: '60vh', overflowY: 'auto',
          background: BG.raised, border: `1px solid ${LINE.strong}`, borderRadius: RADIUS.lg,
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)', padding: '10px 12px 12px',
          fontSize: FONT.base, color: INK.body, lineHeight: 1.65,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <strong style={{ flex: 1, fontSize: FONT.sm, color: INK.strong }}>{title}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="도움말 닫기"
              style={{ background: 'transparent', border: 'none', color: INK.dim, cursor: 'pointer', padding: 2, lineHeight: 0 }}>
              <X size={13} />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}

/** 도움말 팝오버 안의 소제목 + 목록 — 각 탭이 같은 형식을 쓰도록 공용화. */
export function HelpList({ title, items }) {
  return (
    <div style={{ marginTop: 8 }}>
      {title && (
        <div style={{ fontSize: FONT.xs, fontWeight: 800, color: '#7ab2d4', letterSpacing: 1, marginBottom: 3 }}>{title}</div>
      )}
      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  )
}

/** 푸터 아래 차단 사유/힌트 1~2줄. */
export function FooterNote({ tone = 'muted', children }) {
  const color = TONE_COLOR[tone] ?? INK.dim
  return <div style={{ fontSize: FONT.xs, color, lineHeight: 1.5 }}>{children}</div>
}
