import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import { useStabilityStore } from '../store/useStabilityStore.js'

const STATUS_COLOR = {
  pass: { fg: '#37E08A', bg: 'rgba(55,224,138,0.10)', border: 'rgba(55,224,138,0.45)', label: 'PASS', Icon: CheckCircle2 },
  warn: { fg: '#FFC447', bg: 'rgba(255,196,71,0.10)', border: 'rgba(255,196,71,0.45)', label: 'WARN', Icon: AlertTriangle },
  fail: { fg: '#FF5566', bg: 'rgba(255,85,102,0.10)', border: 'rgba(255,85,102,0.45)', label: 'FAIL', Icon: XCircle },
  skip: { fg: '#7a8aaa', bg: 'rgba(122,138,170,0.08)', border: 'rgba(122,138,170,0.35)', label: 'SKIP', Icon: AlertTriangle },
}

export default function StabilityReportPanel() {
  const open = useStabilityStore(s => s.panelOpen)
  const running = useStabilityStore(s => s.running)
  const report = useStabilityStore(s => s.report)
  const error = useStabilityStore(s => s.error)
  const overall = useStabilityStore(s => s.overallStatus)
  const ranAt = useStabilityStore(s => s.ranAt)
  const close = useStabilityStore(s => s.closePanel)

  if (!open) return null

  return (
    <div style={{
      position: 'absolute',
      top: 42,
      left: 256,
      width: 430,
      maxHeight: 'calc(100vh - 56px)',
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
      <Header overall={overall} ranAt={ranAt} onClose={close} />
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

function Header({ overall, ranAt, onClose }) {
  const sc = overall ? STATUS_COLOR[overall] : null
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 12px',
      borderBottom: '1px solid rgba(0,209,255,0.20)',
      background: 'linear-gradient(180deg, rgba(0,209,255,0.06) 0%, transparent 100%)',
    }}>
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
  const summary = useMemo(() => buildReadableSummary(report), [report])
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

function buildReadableSummary(report) {
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
      const msg = summarizeStage(stage)
      if (msg) passHighlights.push(msg)
    } else if (stage.status === 'warn') {
      warnings.push({
        stage: stage.stage,
        headline: shortStageLabel(stage),
        message: summarizeStage(stage),
        action: actionForStage(stage),
      })
    } else if (stage.status === 'fail') {
      criticalIssues.push({
        stage: stage.stage,
        headline: shortStageLabel(stage),
        message: summarizeStage(stage),
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

function summarizeStage(stage) {
  const s = stage?.summary ?? {}
  if (stage.stage === 2) {
    const failed = Array.isArray(stage.results) ? stage.results.find(r => r?.valid === false) : null
    if (failed?.reason) return `${failed.groupId ? `Group ${failed.groupId}: ` : ''}${failed.reason}`
    if (s.failed) return `${s.failed}개 그룹의 권상 형상이 기준을 만족하지 않습니다.`
    return '권상 형상 기준을 만족합니다.'
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
    if (s.isStable === false) return `COG 투영점이 지지 기준에서 ${formatNumber(s.deviationMm)}mm 벗어났습니다. 허용값은 ${formatNumber(s.thresholdMm)}mm입니다.`
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
