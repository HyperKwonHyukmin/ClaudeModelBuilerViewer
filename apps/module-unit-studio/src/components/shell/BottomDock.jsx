import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
import { useViewerStore } from '../../store/useViewerStore.js'
import { useUnitStructuralStore } from '../../store/useUnitStructuralStore.js'
import { useErrorLogStore } from '../../store/useErrorLogStore.js'
import { useStageStore } from '../../store/useStageStore.js'
import { palette, type } from '../../utils/theme.js'
import UnitStructuralResultDock from '../UnitStructuralResultDock.jsx'
import AuditTab, { AuditSummaryChips } from '../dock/AuditTab.jsx'
import MessagesTab from '../dock/MessagesTab.jsx'

/**
 * BottomDock — 하단 고정 도크 (ModelBuilderStudio 에서 이식). 탭: 구조 해석 결과 / 입력 감사 / 메시지.
 *
 * 이전에는 `UnitStructuralResultDock`(fixed 배치)과 `BottomReviewDock`(변환 감사)이 **따로** 쌓여
 * 화면 아래를 두 겹으로 차지했다. 하나로 합치고 탭으로 전환한다.
 *
 * 기본 접힘(헤더 36px). 탭 버튼으로 펼치고, 상단 grip 을 드래그해 높이를 바꾼다(160px ~ 영역의 85%, 영속).
 * 구조 해석이 시작되거나 끝나면 "구조 해석 결과" 탭으로 자동 펼침 — 예전 결과 도크가 자동으로 뜨던 동작과 같다.
 *   · 최대화 토글 — 헤더 버튼 · 그립 더블클릭 · Ctrl+Shift+J. 다시 누르면 직전 높이로 복원.
 */
export const BOTTOM_DOCK_HEADER = 36

/** 최대화했을 때 도크가 쓰는 세로 비율 — 나머지는 3D 뷰포트가 계속 보이도록 남긴다. */
const MAX_RATIO = 0.85

export default function BottomDock() {
  const dock = useViewerStore(s => s.bottomDock)
  const setDock = useViewerStore(s => s.setBottomDock)
  const openTab = useViewerStore(s => s.openBottomDockTab)
  const toggle = useViewerStore(s => s.toggleBottomDock)
  const toggleMax = useViewerStore(s => s.toggleBottomDockMax)
  const openAtLeast = useViewerStore(s => s.openBottomDockAtLeast)
  const structuralStatus = useUnitStructuralStore(s => s.status)
  const structuralResult = useUnitStructuralStore(s => s.result)
  const errorCount = useErrorLogStore(s => s.entries.filter(e => e.level !== 'info').length)
  const messageCount = useErrorLogStore(s => s.entries.length)
  const inputAudit = useStageStore(s => s.inputAudit)
  const p = palette()

  // 해석 실행/완료/실패 → 결과 탭 자동 펼침(표가 잘리지 않는 최소 높이까지).
  const lastStatusRef = useRef(null)
  useEffect(() => {
    if (!structuralStatus || structuralStatus === lastStatusRef.current) return
    lastStatusRef.current = structuralStatus
    if (['Pending', 'Running', 'Success', 'Failed'].includes(structuralStatus)) {
      openAtLeast('result', structuralStatus === 'Success' ? 300 : 160)
    }
  }, [structuralStatus, openAtLeast])

  // 최대화 높이·드래그 상한은 도크가 놓인 열(뷰포트 + 도크)의 실제 높이를 기준으로 잡는다.
  const sectionRef = useRef(null)
  const [columnH, setColumnH] = useState(0)
  useEffect(() => {
    const parent = sectionRef.current?.parentElement
    if (!parent || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setColumnH(entry.contentRect.height))
    ro.observe(parent)
    setColumnH(parent.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])
  const limitH = columnH > 0 ? Math.max(160, Math.floor(columnH * MAX_RATIO)) : 0
  const openHeight = dock.maximized && limitH > 0
    ? limitH
    : (limitH > 0 ? Math.min(dock.height, limitH) : dock.height)

  // 높이 드래그
  const dragRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const onGripDown = useCallback((e) => {
    if (!dock.open) return
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: dock.maximized ? openHeight : dock.height }
    setDragging(true)
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      const maxH = limitH > 0 ? limitH : Math.max(160, Math.floor(window.innerHeight * 0.8))
      const next = Math.max(160, Math.min(maxH, d.startH + (d.startY - ev.clientY)))
      setDock({ height: next, maximized: false })
    }
    const onUp = () => {
      dragRef.current = null
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [dock.open, dock.height, dock.maximized, openHeight, limitH, setDock])

  const resultExtra = structuralStatus === 'Running' || structuralStatus === 'Pending'
    ? <Count tone="info" p={p}>실행중</Count>
    : structuralStatus === 'Failed' ? <Count tone="danger" p={p}>실패</Count>
    : structuralResult ? <Count tone="ok" p={p}>완료</Count> : null

  const tabs = [
    { id: 'result',   label: '구조 해석 결과', extra: resultExtra },
    { id: 'audit',    label: '입력 감사',      extra: dock.open && dock.tab === 'audit' ? null : (inputAudit ? <AuditSummaryChips /> : null) },
    { id: 'messages', label: '메시지',         extra: messageCount > 0 ? <Count tone={errorCount > 0 ? 'danger' : 'muted'} p={p}>{errorCount > 0 ? `오류 ${errorCount}` : messageCount}</Count> : null },
  ]

  return (
    <section ref={sectionRef} aria-label="결과·감사·메시지 도크" style={{
      flexShrink: 0, display: 'flex', flexDirection: 'column',
      height: dock.open ? openHeight : BOTTOM_DOCK_HEADER,
      background: p.tabBg, borderTop: `1px solid ${p.borderStrong}`,
      transition: dragging ? 'none' : 'height 0.18s ease',
      boxShadow: dock.open ? '0 -8px 24px -8px rgba(0,0,0,0.5)' : 'none',
    }}>
      {dock.open && (
        <div onMouseDown={onGripDown} onDoubleClick={toggleMax} title="드래그로 높이 조정 · 더블클릭으로 최대화/복원"
          style={{ height: 6, cursor: 'ns-resize', flexShrink: 0, position: 'relative' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(70,130,180,0.45)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 32, height: 2, background: p.borderStrong, borderRadius: 2 }} />
        </div>
      )}

      <div role="tablist" style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
        height: dock.open ? BOTTOM_DOCK_HEADER - 6 : BOTTOM_DOCK_HEADER, flexShrink: 0,
        borderBottom: dock.open ? `1px solid ${p.border}` : 'none', overflowX: 'auto',
      }}>
        {tabs.map(t => {
          const active = dock.open && dock.tab === t.id
          return (
            <button key={t.id} type="button" role="tab" aria-selected={active} onClick={() => openTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 10px', borderRadius: 6,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: active ? p.tabBgActive : 'transparent',
                color: active ? p.tabTextActive : p.tabTextInactive,
                border: `1px solid ${active ? p.tabIndicator : 'transparent'}`,
                fontSize: type.label, fontWeight: 700,
              }}>
              {t.label}
              {t.extra}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: type.meta, color: p.textFaint, marginRight: 6 }}>Ctrl+J</span>
        <button type="button" onClick={toggleMax}
          aria-pressed={!!dock.maximized}
          aria-label={dock.maximized ? '하단 도크 직전 높이로 복원' : '하단 도크 최대화'}
          title={dock.maximized ? '직전 높이로 복원 (Ctrl+Shift+J)' : '결과를 크게 보기 — 최대화 (Ctrl+Shift+J)'}
          style={{
            width: 24, height: 24, marginRight: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: dock.maximized ? p.accentBg : 'transparent',
            border: `1px solid ${dock.maximized ? p.accentBorder : p.btnBorder}`, borderRadius: 5,
            color: dock.maximized ? p.accentLight : p.textMuted, cursor: 'pointer',
          }}>
          {dock.maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button type="button" onClick={toggle}
          aria-label={dock.open ? '하단 도크 접기' : '하단 도크 펼치기'} title={dock.open ? '접기' : '펼치기'}
          style={{
            width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: `1px solid ${p.btnBorder}`, borderRadius: 5,
            color: p.textMuted, cursor: 'pointer',
          }}>
          {dock.open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {dock.open && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {dock.tab === 'result' && (
            structuralResult
              ? <UnitStructuralResultDock embedded />
              : <Empty p={p}>구조 해석을 실행하면 부재 응력·변위·Wire 장력 표가 여기에 나타납니다.</Empty>
          )}
          {dock.tab === 'audit' && <AuditTab />}
          {dock.tab === 'messages' && <MessagesTab />}
        </div>
      )}
    </section>
  )
}

function Empty({ children, p }) {
  return <div style={{ padding: '14px 12px', fontSize: type.body, color: p.textMuted, lineHeight: 1.6 }}>{children}</div>
}

function Count({ tone, children, p }) {
  const color = tone === 'danger' ? p.severityDanger : tone === 'ok' ? p.accent : tone === 'info' ? p.labelColor : p.textMuted
  return (
    <span style={{
      fontSize: type.meta, fontWeight: 800, color, background: `${color}1f`,
      border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 7px',
    }}>
      {children}
    </span>
  )
}
