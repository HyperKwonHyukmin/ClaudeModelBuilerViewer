import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
  Wrench,
  ShieldAlert,
  GripVertical,
} from 'lucide-react'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { describeFailedGroups, groupNodeLabel } from '../data/hoistGroupNodeLabel.js'

const STATUS_COLOR = {
  pass: { fg: '#37E08A', bg: 'rgba(55,224,138,0.10)', border: 'rgba(55,224,138,0.45)', label: 'PASS', Icon: CheckCircle2 },
  warn: { fg: '#FFC447', bg: 'rgba(255,196,71,0.10)', border: 'rgba(255,196,71,0.45)', label: 'WARN', Icon: AlertTriangle },
  fail: { fg: '#FF5566', bg: 'rgba(255,85,102,0.10)', border: 'rgba(255,85,102,0.45)', label: 'FAIL', Icon: XCircle },
  skip: { fg: '#7a8aaa', bg: 'rgba(122,138,170,0.08)', border: 'rgba(122,138,170,0.35)', label: 'SKIP', Icon: AlertTriangle },
}

const PANEL_WIDTH = 430
// 기본 위치 = 뷰포트 좌측 끝에 붙임. 과거엔 left:256 이라 모델 한가운데를 가렸다.
// y=62 는 뷰포트 좌상단 뷰 툴바(평면/정면/…, top:10 · 높이 ~26px)를 지나 그 아래에 놓기 위한 값이다.
// (이 창의 offsetParent 는 뷰포트 셀이 아니라 그 위 그리드 컨테이너라 툴바보다 원점이 높다.)
const DEFAULT_POS = { x: 0, y: 62 }
const POS_KEY = 'mu.stabilityPanel.pos.v1'

function loadPos() {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null')
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return { x: raw.x, y: raw.y }
  } catch { /* ignore */ }
  return { ...DEFAULT_POS }
}
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

export default function StabilityReportPanel() {
  const open = useStabilityStore(s => s.panelOpen)
  const running = useStabilityStore(s => s.running)
  const report = useStabilityStore(s => s.report)
  const error = useStabilityStore(s => s.error)
  const overall = useStabilityStore(s => s.overallStatus)
  const ranAt = useStabilityStore(s => s.ranAt)
  const close = useStabilityStore(s => s.closePanel)

  // 창 위치 — 기본은 뷰포트 좌측 끝(뷰어 가림 최소화)이고, 헤더를 끌어 옮길 수 있다.
  // 옮긴 위치는 localStorage 에 남아 평가를 다시 실행해도 유지된다.
  const panelRef = useRef(null)
  const [pos, setPos] = useState(loadPos)
  const posRef = useRef(pos)
  const dragRef = useRef(null)   // { sx, sy, ox, oy }
  const [dragging, setDragging] = useState(false)   // 커서 모양 전환용(렌더에서 ref 를 읽지 않도록 state)

  const onDragStart = useCallback((e) => {
    // 닫기 버튼 등 조작 요소 위에서 시작한 포인터는 드래그로 삼지 않는다.
    if (e.button !== 0 || e.target.closest('button')) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: posRef.current.x, oy: posRef.current.y }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onDragMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const el = panelRef.current
    const parent = el?.offsetParent
    // 창이 부모(뷰포트 셀) 밖으로 완전히 빠져나가 다시 못 잡는 일이 없도록 가장자리에서 멈춘다.
    const maxX = Math.max(0, (parent?.clientWidth ?? window.innerWidth) - (el?.offsetWidth ?? PANEL_WIDTH))
    const maxY = Math.max(0, (parent?.clientHeight ?? window.innerHeight) - 40)
    const next = {
      x: clamp(d.ox + e.clientX - d.sx, 0, maxX),
      y: clamp(d.oy + e.clientY - d.sy, 0, maxY),
    }
    posRef.current = next
    setPos(next)
  }, [])

  const onDragEnd = useCallback((e) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    try { localStorage.setItem(POS_KEY, JSON.stringify(posRef.current)) } catch { /* ignore */ }
  }, [])

  // 헤더 더블클릭 → 좌측 끝 기본 위치로 되돌리기(창을 잃어버렸을 때의 탈출구).
  const resetPos = useCallback(() => {
    posRef.current = { ...DEFAULT_POS }
    setPos({ ...DEFAULT_POS })
    try { localStorage.removeItem(POS_KEY) } catch { /* ignore */ }
  }, [])

  if (!open) return null

  return (
    <div ref={panelRef} style={{
      position: 'absolute',
      top: pos.y,
      left: pos.x,
      width: PANEL_WIDTH,
      maxHeight: `calc(100% - ${pos.y + 8}px)`,
      zIndex: 22,
      background: 'rgba(8, 6, 22, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,209,255,0.30)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <Header
        overall={overall} ranAt={ranAt} onClose={close}
        dragging={dragging}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onDoubleClick={resetPos}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {running && <RunningBlock />}
        {!running && error && <ErrorBlock error={error} />}
        {!running && !error && report && <ReportBlock report={report} />}
        {!running && !error && !report && (
          <div style={{ fontSize: 12, color: '#7a8aaa', textAlign: 'center', padding: '24px 0' }}>
            결과가 아직 없습니다. "자세안정성 평가 실행"을 눌러주세요.
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ overall, ranAt, onClose, dragging, ...dragHandlers }) {
  const sc = overall ? STATUS_COLOR[overall] : null
  return (
    <div
      {...dragHandlers}
      title="드래그해서 창을 옮길 수 있습니다 (더블클릭 = 좌측 끝으로 되돌리기)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(0,209,255,0.20)',
        background: 'linear-gradient(180deg, rgba(0,209,255,0.06) 0%, transparent 100%)',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none',
      }}>
      <GripVertical size={13} color="#4d6a82" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 900, color: '#90E8FF', letterSpacing: 0.6, flex: 1 }}>
        자세안정성 평가 결과
      </span>
      {sc && (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 800,
          color: sc.fg,
          background: sc.bg,
          border: `1px solid ${sc.border}`,
          borderRadius: 5,
          padding: '3px 8px',
        }}>
          <sc.Icon size={13} />
          {sc.label}
        </span>
      )}
      {ranAt && <span style={{ fontSize: 9, color: '#60708a' }}>{formatRanAt(ranAt)}</span>}
      <button
        onClick={onClose}
        title="결과 패널 닫기"
        style={{
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: '1px solid #2a2a4a',
          borderRadius: 5,
          color: '#7a8aaa',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 0,
        }}>
        <X size={13} />
      </button>
    </div>
  )
}

function RunningBlock() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      padding: '14px 12px',
      background: 'rgba(0,209,255,0.06)',
      border: '1px solid rgba(0,209,255,0.30)',
      borderRadius: 7,
      color: '#cad8e8',
      fontSize: 12,
      fontWeight: 600,
    }}>
      <Loader2 size={16} style={{ animation: 'hoistSpin 900ms linear infinite', color: '#00D1FF' }} />
      ModuleAnalysis.Cli 실행 중...
    </div>
  )
}

function ErrorBlock({ error }) {
  return (
    <div style={{
      padding: '10px 12px',
      background: 'rgba(255,85,102,0.08)',
      border: '1px solid rgba(255,85,102,0.45)',
      borderRadius: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <XCircle size={14} color="#FF5566" />
        <span style={{ fontSize: 12, color: '#FF99A6', fontWeight: 800 }}>
          실행 실패{error.exitCode != null && ` (exit ${error.exitCode})`}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#e8d6d8', lineHeight: 1.5, wordBreak: 'break-word' }}>
        {error.message ?? '알 수 없는 오류'}
      </div>
      {error.stderr && (
        <pre style={{
          marginTop: 7,
          padding: '6px 8px',
          background: '#0a0a18',
          border: '1px solid #2a1a26',
          borderRadius: 4,
          fontSize: 10,
          color: '#a89098',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 140,
          overflow: 'auto',
        }}>{error.stderr}</pre>
      )}
    </div>
  )
}

function ReportBlock({ report }) {
  // 리포트에는 groupId 만 있고 노드 번호가 없다. 노드 선택은 스튜디오가 소유한 정보라
  // (hoistGroups: { groupId: [nodeId,...] }) 여기서 되짚어 "고쳐야 할 노드 번호"까지 보여준다.
  const hoistGroups = useEditStore(s => s.hoistGroups)
  const summary = useMemo(() => buildReadableSummary(report, hoistGroups), [report, hoistGroups])
  const [showDetails, setShowDetails] = useState(false)
  const sc = STATUS_COLOR[summary.status] ?? STATUS_COLOR.skip

  return (
    <>
      <div style={{
        border: `1px solid ${sc.border}`,
        background: sc.bg,
        borderRadius: 9,
        padding: '11px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <sc.Icon size={18} color={sc.fg} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: sc.fg }}>
              {summary.statusLabel}
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: '#e8eef7', lineHeight: 1.45 }}>
              {summary.primaryMessage}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
          <MetricChip label="수정 필요" value={summary.criticalIssues.length} color="#FF5566" />
          <MetricChip label="경고" value={summary.warnings.length} color="#FFC447" />
          <MetricChip label="통과" value={summary.passHighlights.length} color="#37E08A" />
        </div>
      </div>

      {summary.criticalIssues.length > 0 && (
        <Section title="먼저 수정할 항목" icon={<ShieldAlert size={13} color="#FF99A6" />}>
          {summary.criticalIssues.map((issue, i) => <IssueCard key={i} issue={issue} tone="fail" />)}
        </Section>
      )}

      {summary.warnings.length > 0 && (
        <Section title="확인할 경고" icon={<AlertTriangle size={13} color="#FFC447" />}>
          {summary.warnings.map((issue, i) => <IssueCard key={i} issue={issue} tone="warn" />)}
        </Section>
      )}

      {summary.passHighlights.length > 0 && (
        <Section title="문제 없는 항목" icon={<CheckCircle2 size={13} color="#37E08A" />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {summary.passHighlights.map((text, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                borderRadius: 5,
                background: 'rgba(55,224,138,0.07)',
                border: '1px solid rgba(55,224,138,0.22)',
                color: '#cfeee0',
                fontSize: 11,
                lineHeight: 1.4,
              }}>
                <CheckCircle2 size={12} color="#37E08A" />
                {text}
              </div>
            ))}
          </div>
        </Section>
      )}

      <button
        type="button"
        onClick={() => setShowDetails(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '8px 10px',
          background: '#101024',
          border: '1px solid #2a2a4a',
          borderRadius: 7,
          color: '#cad8e8',
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
        }}>
        단계별 상세 보기
        {showDetails ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {showDetails && <StagesBlock report={report} />}
    </>
  )
}

function MetricChip({ label, value, color }) {
  return (
    <div style={{
      padding: '6px 7px',
      borderRadius: 6,
      background: 'rgba(0,0,0,0.18)',
      border: `1px solid ${color}55`,
    }}>
      <div style={{ fontSize: 9, color: '#7a8aaa', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 1, fontSize: 15, color, fontWeight: 900 }}>{value}</div>
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        {icon}
        <div style={{ fontSize: 11, color: '#90E8FF', fontWeight: 900, letterSpacing: 0.5 }}>
          {title}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {children}
      </div>
    </div>
  )
}

function IssueCard({ issue, tone }) {
  const color = tone === 'fail' ? '#FF5566' : '#FFC447'
  return (
    <div style={{
      padding: '9px 10px',
      background: tone === 'fail' ? 'rgba(255,85,102,0.08)' : 'rgba(255,196,71,0.08)',
      border: `1px solid ${color}66`,
      borderRadius: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {tone === 'fail' ? <XCircle size={13} color={color} /> : <AlertTriangle size={13} color={color} />}
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#f4f7fb', fontWeight: 900, lineHeight: 1.35 }}>
          {issue.headline}
        </div>
      </div>
      {issue.message && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#d8e0ec', lineHeight: 1.45 }}>
          {issue.message}
        </div>
      )}
      {issue.impact && (
        <div style={{ marginTop: 5, fontSize: 10, color: '#aab8c8', lineHeight: 1.45 }}>
          영향: {issue.impact}
        </div>
      )}
      {issue.action && (
        <div style={{
          display: 'flex',
          gap: 6,
          marginTop: 7,
          padding: '6px 7px',
          borderRadius: 5,
          background: 'rgba(0,0,0,0.20)',
          border: '1px solid rgba(144,232,255,0.16)',
          color: '#dff7ff',
          fontSize: 11,
          lineHeight: 1.45,
        }}>
          <Wrench size={12} color="#90E8FF" style={{ flexShrink: 0, marginTop: 1 }} />
          {issue.action}
        </div>
      )}
    </div>
  )
}

function StagesBlock({ report }) {
  const userStages = useMemo(
    () => (Array.isArray(report?.stages) ? report.stages.filter(s => s.displayPolicy !== 'internal') : []),
    [report],
  )

  if (userStages.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#7a8aaa', textAlign: 'center', padding: '20px 0' }}>
        표시할 단계가 없습니다 ({report?.meta?.schema ?? 'unknown schema'}).
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {userStages.map((stage, i) => <StageCard key={stage.id ?? i} stage={stage} />)}
      {report?.meta?.schema && (
        <div style={{ fontSize: 9, color: '#3a3a52', textAlign: 'center', marginTop: 4 }}>
          schema: {report.meta.schema}
        </div>
      )}
    </div>
  )
}

function StageCard({ stage }) {
  const [expanded, setExpanded] = useState(stage.status === 'fail' || stage.status === 'warn')
  const sc = STATUS_COLOR[stage.status] ?? STATUS_COLOR.skip
  const summaryEntries = stage.summary && typeof stage.summary === 'object'
    ? Object.entries(stage.summary)
    : []
  const issueText = summarizeStage(stage)

  return (
    <div style={{ border: `1px solid ${sc.border}`, background: sc.bg, borderRadius: 7, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 10px',
          background: 'transparent',
          border: 'none',
          color: '#e8eef7',
          cursor: 'pointer',
          textAlign: 'left',
        }}>
        {expanded ? <ChevronDown size={13} color="#90c8e0" /> : <ChevronRight size={13} color="#90c8e0" />}
        <sc.Icon size={14} color={sc.fg} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 800 }}>
          {shortStageLabel(stage)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: sc.fg }}>{sc.label}</span>
      </button>
      {issueText && (
        <div style={{ padding: '0 12px 8px', fontSize: 11, color: '#d8e0ec', lineHeight: 1.4 }}>
          {issueText}
        </div>
      )}
      {expanded && summaryEntries.length > 0 && (
        <div style={{
          borderTop: `1px solid ${sc.border}`,
          padding: '7px 12px 9px',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 10,
          rowGap: 3,
          fontSize: 10,
          lineHeight: 1.45,
          background: 'rgba(0,0,0,0.18)',
        }}>
          {summaryEntries.map(([k, v]) => <KeyValueRow key={k} k={k} v={v} />)}
        </div>
      )}
    </div>
  )
}

function KeyValueRow({ k, v }) {
  return (
    <>
      <span style={{ color: '#7a8aaa', fontWeight: 600 }}>{translateKey(k)}</span>
      <span style={{ color: '#e8eef7', wordBreak: 'break-word' }}>{formatValue(v)}</span>
    </>
  )
}

function buildReadableSummary(report, hoistGroups) {
  const supplied = report?.overall?.userSummary
  if (supplied) {
    return {
      status: supplied.status ?? report?.overall?.status ?? 'skip',
      statusLabel: supplied.statusLabel ?? statusLabel(supplied.status),
      primaryMessage: supplied.primaryMessage ?? '',
      criticalIssues: Array.isArray(supplied.criticalIssues) ? supplied.criticalIssues : [],
      warnings: Array.isArray(supplied.warnings) ? supplied.warnings : [],
      passHighlights: Array.isArray(supplied.passHighlights) ? supplied.passHighlights : [],
    }
  }

  const stages = Array.isArray(report?.stages) ? report.stages : []
  const criticalIssues = []
  const warnings = []
  const passHighlights = []

  for (const stage of stages) {
    if (stage.displayPolicy === 'internal') continue
    if (stage.status === 'pass') {
      const msg = summarizeStage(stage, hoistGroups)
      if (msg) passHighlights.push(msg)
    } else if (stage.status === 'warn') {
      warnings.push({
        stage: stage.stage,
        headline: shortStageLabel(stage),
        message: summarizeStage(stage, hoistGroups),
        action: actionForStage(stage),
      })
    } else if (stage.status === 'fail') {
      criticalIssues.push({
        stage: stage.stage,
        headline: shortStageLabel(stage),
        message: summarizeStage(stage, hoistGroups),
        action: actionForStage(stage),
      })
    }
  }

  const status = report?.overall?.status ?? (criticalIssues.length ? 'fail' : warnings.length ? 'warn' : 'pass')
  return {
    status,
    statusLabel: statusLabel(status),
    primaryMessage: status === 'fail'
      ? '현재 권상 조건은 그대로 진행하기 어렵습니다. 아래 핵심 문제를 먼저 수정하세요.'
      : status === 'warn'
        ? '치명 오류는 없지만 확인이 필요한 항목이 있습니다.'
        : '자세 안정성 평가를 통과했습니다.',
    criticalIssues,
    warnings,
    passHighlights,
  }
}

function summarizeStage(stage, hoistGroups) {
  const s = stage?.summary ?? {}
  // Stage 1(형상 분류) · Stage 2(형상 검증) — 기준을 만족하지 못한 그룹의 '노드 번호'까지 알려준다.
  // 사용자가 실제로 고칠 대상은 그룹이 아니라 노드이므로, 번호 없이 "Group 2 실패"만 알리면
  // 어느 노드를 바꿔야 하는지 다시 찾아야 한다.
  if (stage.stage === 1 || stage.stage === 2) {
    const detail = describeFailedGroups(stage.results, hoistGroups)
    if (detail) return detail
    if (s.failed) return `${s.failed}개 그룹의 권상 형상이 기준을 만족하지 않습니다.`
    return stage.stage === 2 ? '권상 형상 기준을 만족합니다.' : '권상 형상이 분류되었습니다.'
  }
  if (stage.stage === 4) {
    if (s.minAngleDeg == null) return '슬링 와이어 각도 기준을 만족합니다.'
    const minStr = formatNumber(s.minAngleDeg)
    if (stage.status === 'pass') {
      return `최소 슬링각 ${minStr}°로 기준 60° 이상입니다.`
    }
    // results[].wires[].safe=false 인 와이어를 모아 각도 오름차순으로 표시
    const unsafe = []
    for (const r of (Array.isArray(stage.results) ? stage.results : [])) {
      for (const w of (Array.isArray(r?.wires) ? r.wires : [])) {
        if (w?.safe === false) {
          unsafe.push({ groupId: r.groupId, lugId: w.lugNodeId, angle: Number(w.angleDeg) })
        }
      }
    }
    unsafe.sort((a, b) => a.angle - b.angle)
    if (unsafe.length === 0) {
      const where = (s.minAngleAtGroupId != null && s.minAngleAtLugNodeId != null)
        ? ` (Group ${s.minAngleAtGroupId} / Lug ${s.minAngleAtLugNodeId})`
        : ''
      return `최소 슬링각 ${minStr}°${where} — 기준(60°)에 근접합니다.`
    }
    const list = unsafe.slice(0, 6)
      .map(u => `G${u.groupId} L${u.lugId}: ${formatNumber(u.angle)}°`)
      .join(', ')
    const more = unsafe.length > 6 ? ` 외 ${unsafe.length - 6}개` : ''
    return `${unsafe.length}개 와이어가 60° 미만입니다 — ${list}${more}`
  }
  if (stage.stage === 5) {
    if (s.conflictCount) return `${s.conflictCount}건의 와이어-구조물 간섭 가능성이 있습니다. 최소 여유 ${formatNumber(s.minClearanceMm)}mm.`
    return '와이어-구조물 간섭이 확인되지 않았습니다.'
  }
  if (stage.stage === 6) {
    if (s.isStable === false) {
      // 전도는 '지지 다각형을 이루는 권상 노드' 전체가 원인이라 관련 노드를 함께 제시한다.
      const groups = Object.keys(hoistGroups ?? {})
        .filter(gid => (hoistGroups[gid] ?? []).length > 0)
        .map(gid => groupNodeLabel(gid, hoistGroups))
        .filter(Boolean)
      const where = groups.length ? ` 관련 권상점 — ${groups.join(' / ')}.` : ''
      return `COG 투영점이 지지 기준에서 ${formatNumber(s.deviationMm)}mm 벗어났습니다. 허용값은 ${formatNumber(s.thresholdMm)}mm입니다.${where}`
    }
    return 'COG 투영점이 권상 지지 영역 안에 있습니다.'
  }
  if (stage.status === 'pass') return `${shortStageLabel(stage)} 통과`
  if (s.error) return String(s.error)
  return stage.purpose ?? ''
}

function actionForStage(stage) {
  if (stage.stage === 2) return '높이 차이가 큰 권상 노드를 같은 레벨의 러그/패드아이로 다시 선택하세요.'
  if (stage.stage === 4) return '문제 와이어의 러그 노드를 권상 정점에 더 가깝게(수평거리 작게) 배치하거나, 정점 높이를 올려 슬링각을 60° 이상으로 만드세요.'
  if (stage.stage === 5) return '문제 와이어의 러그 노드 또는 권상 정점을 이동해 구조물과의 간격을 확보하세요.'
  if (stage.stage === 6) return 'COG가 지지선/지지 다각형 안에 들어오도록 권상점 위치 또는 그룹 구성을 조정하세요.'
  return null
}

function statusLabel(status) {
  if (status === 'pass') return '사용 가능'
  if (status === 'warn') return '검토 필요'
  if (status === 'fail') return '수정 필요'
  return '확인 필요'
}

function shortStageLabel(stage) {
  const label = stage?.displayLabel ?? `Stage ${stage?.stage ?? '?'}`
  return label.replace(/^\d+단계\s*·\s*/, '')
}

function translateKey(key) {
  const map = {
    topPointCount: '정점 수',
    evaluationMode: '평가 방식',
    isStable: '안정 여부',
    deviationMm: '벗어난 거리',
    thresholdMm: '허용값',
    marginMm: '여유',
    totalGroups: '그룹 수',
    passed: '통과',
    failed: '실패',
    conflictCount: '간섭 수',
    minClearanceMm: '최소 여유',
    minAngleDeg: '최소 각도',
    unsafeCount: '위험 와이어',
  }
  return map[key] ?? key
}

function formatValue(v) {
  if (v == null) return '-'
  if (typeof v === 'number') return formatNumber(v)
  if (typeof v === 'boolean') return v ? '예' : '아니오'
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return n.toLocaleString('ko-KR')
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}

function formatRanAt(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('ko-KR', { hour12: false })
  } catch {
    return ''
  }
}
