import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * 핵심 기능 버튼용 가벼운 커스텀 말풍선.
 * native title attribute 보다 일관된 스타일과 충분한 가독성을 제공한다.
 *
 * 구현: tooltip 본문은 React Portal 로 document.body 에 직접 렌더링되어
 *      부모 컨테이너의 overflow: hidden / auto 에 의해 잘리지 않는다.
 *      위치는 children 의 화면 좌표(getBoundingClientRect)로 계산한 fixed 좌표.
 *      스크롤/리사이즈 시 자동 재계산.
 *
 * 사용법:
 *   <Tooltip content="설명" placement="bottom">
 *     <button ...>버튼</button>
 *   </Tooltip>
 *
 * Props:
 *   content   : 말풍선 본문 (React 노드 또는 문자열)
 *   placement : 'top' | 'bottom' | 'left' | 'right' (기본 'bottom')
 *   delay     : hover 후 표시까지 지연 (기본 380ms)
 *   maxWidth  : 본문 최대 폭 px (기본 340 — 한글 + word-break:keep-all 가독성 확보)
 *   minWidth  : 본문 최소 폭 px (기본 220 — 너무 좁아 세로로 길어지는 것 방지)
 *   disabled  : true 면 말풍선 숨김 (children 만 렌더)
 */
export default function Tooltip({
  children,
  content,
  placement = 'bottom',
  delay = 380,
  maxWidth = 340,
  minWidth = 220,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false })
  const wrapperRef = useRef(null)
  const tooltipRef = useRef(null)
  const timerRef = useRef()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // children 박스 + tooltip 박스 실측 → fixed 좌표 계산. viewport 가장자리에서 자동 클램프.
  // placement 가 viewport 밖으로 나가면 반대쪽으로 자동 뒤집기(top↔bottom, left↔right).
  useLayoutEffect(() => {
    if (!open) return
    const recompute = () => {
      const wrap = wrapperRef.current
      const tip  = tooltipRef.current
      if (!wrap || !tip) return
      const r = wrap.getBoundingClientRect()
      const tipW = tip.offsetWidth
      const tipH = tip.offsetHeight
      const gap = 10
      const edge = 8           // viewport 가장자리 여백
      const vw = window.innerWidth
      const vh = window.innerHeight

      // 1차 placement
      let p = placement
      if (p === 'top'    && r.top    - tipH - gap < edge) p = 'bottom'
      if (p === 'bottom' && r.bottom + tipH + gap > vh - edge) p = 'top'
      if (p === 'left'   && r.left   - tipW - gap < edge) p = 'right'
      if (p === 'right'  && r.right  + tipW + gap > vw - edge) p = 'left'

      let top, left
      if (p === 'top') {
        top  = r.top    - tipH - gap
        left = r.left + r.width / 2 - tipW / 2
      } else if (p === 'bottom') {
        top  = r.bottom + gap
        left = r.left + r.width / 2 - tipW / 2
      } else if (p === 'right') {
        top  = r.top + r.height / 2 - tipH / 2
        left = r.right + gap
      } else { // left
        top  = r.top + r.height / 2 - tipH / 2
        left = r.left - tipW - gap
      }

      // viewport 클램프
      left = Math.max(edge, Math.min(left, vw - tipW - edge))
      top  = Math.max(edge, Math.min(top,  vh - tipH - edge))

      setCoords({ top, left, ready: true, resolvedPlacement: p, anchorRect: r })
    }
    recompute()
    // capture: true → 부모 패널의 overflow: auto 스크롤도 모두 추적
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [open, placement, content])

  if (disabled || !content) return children

  const onEnter = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), delay)
  }
  const onLeave = () => {
    clearTimeout(timerRef.current)
    setOpen(false)
    setCoords(c => ({ ...c, ready: false }))
  }

  // 화살표 — 실제로 사용된 placement 기준 (viewport 클램프로 뒤집힐 수 있음)
  const arrowSize = 7
  const resolved = coords.resolvedPlacement ?? placement
  const r = coords.anchorRect
  // children 중심을 가리키도록 fixed 좌표에서 화살표 위치 계산
  let arrowStyle = null
  if (r) {
    if (resolved === 'top') {
      arrowStyle = {
        bottom: -arrowSize / 2 - 1,
        left: r.left + r.width / 2 - coords.left - arrowSize / 2,
        transform: 'rotate(45deg)',
        borderRight:  '1px solid rgba(0,209,255,0.45)',
        borderBottom: '1px solid rgba(0,209,255,0.45)',
      }
    } else if (resolved === 'bottom') {
      arrowStyle = {
        top: -arrowSize / 2 - 1,
        left: r.left + r.width / 2 - coords.left - arrowSize / 2,
        transform: 'rotate(45deg)',
        borderLeft: '1px solid rgba(0,209,255,0.45)',
        borderTop:  '1px solid rgba(0,209,255,0.45)',
      }
    } else if (resolved === 'right') {
      arrowStyle = {
        left: -arrowSize / 2 - 1,
        top: r.top + r.height / 2 - coords.top - arrowSize / 2,
        transform: 'rotate(45deg)',
        borderLeft:   '1px solid rgba(0,209,255,0.45)',
        borderBottom: '1px solid rgba(0,209,255,0.45)',
      }
    } else { // left
      arrowStyle = {
        right: -arrowSize / 2 - 1,
        top: r.top + r.height / 2 - coords.top - arrowSize / 2,
        transform: 'rotate(45deg)',
        borderRight: '1px solid rgba(0,209,255,0.45)',
        borderTop:   '1px solid rgba(0,209,255,0.45)',
      }
    }
  }

  const tooltipNode = open ? (
    <span
      ref={tooltipRef}
      role="tooltip"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        // 첫 layout pass 에서 ready=false → 화면 밖에서 측정만 하고 깜빡임 방지
        visibility: coords.ready ? 'visible' : 'hidden',
        zIndex: 9999,
        background: 'rgba(15, 17, 30, 0.97)',
        color: '#dde9f7',
        border: '1px solid rgba(0, 209, 255, 0.45)',
        borderRadius: 7,
        padding: '9px 13px',
        fontSize: 12,
        lineHeight: 1.55,
        fontWeight: 500,
        pointerEvents: 'none',
        whiteSpace: 'normal',
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
        maxWidth,
        minWidth,
        width: 'max-content',
        boxShadow: '0 6px 22px rgba(0,0,0,0.62)',
        animation: coords.ready ? 'tooltipFadeIn 140ms ease-out' : 'none',
        textAlign: 'left',
        userSelect: 'none',
      }}
    >
      {content}
      {arrowStyle && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            width: arrowSize,
            height: arrowSize,
            background: 'rgba(15, 17, 30, 0.97)',
            ...arrowStyle,
          }}
        />
      )}
    </span>
  ) : null

  return (
    <>
      <span
        ref={wrapperRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>
      {tooltipNode && typeof document !== 'undefined' && createPortal(tooltipNode, document.body)}
    </>
  )
}
