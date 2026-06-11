import {
  Activity,
  ClipboardList,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'

/**
 * AnalyzePanel — 상단 메뉴바 'Analyze' 모드의 좌측 도크 본문.
 *
 * 설계 원칙(기능 손실 0):
 *  - 실제 상세 패널인 StabilityReportPanel / UnitStructuralPanel 은 ViewportContainer 안에
 *    position:absolute 플로팅으로 그대로 유지된다. 이 좌측 패널은 그 패널들로의 '진입/요약'만 담당.
 *  - 새 해석 실행 로직을 새로 구현하지 않는다. 기존 store 의 openPanel() 만 트리거하고
 *    overallStatus / status / progress 를 배지·요약으로 보여준다.
 *  - σy/γM 대응: 이 앱의 Unit 구조 해석 입력은 Safety Factor + 허용응력(MPa)이며 그 입력·실행
 *    버튼은 UnitStructuralPanel(플로팅) 이 계속 담당한다. 여기서는 현재 입력값을 읽기 전용으로 요약.
 *
 * 외곽 컨테이너는 Sidebar(ModelPanel)와 동일한 다크 컨테이너 — width 190 고정(레이아웃 점프 방지),
 * background '#0b0b1e', overflowY auto.
 */

const STABILITY_STATUS = {
  pass: { fg: '#37E08A', bg: 'rgba(55,224,138,0.10)', border: 'rgba(55,224,138,0.55)', label: 'PASS', Icon: CheckCircle2 },
  warn: { fg: '#FFC447', bg: 'rgba(255,196,71,0.10)', border: 'rgba(255,196,71,0.55)', label: 'WARN', Icon: AlertTriangle },
  fail: { fg: '#FF5566', bg: 'rgba(255,85,102,0.10)', border: 'rgba(255,85,102,0.55)', label: 'FAIL', Icon: XCircle },
}

const STRUCTURAL_STATUS = {
  Pending: { fg: '#90E8FF', bg: 'rgba(0,209,255,0.10)',  border: 'rgba(0,209,255,0.55)',  label: '대기',  Icon: Loader2, spin: true },
  Running: { fg: '#90E8FF', bg: 'rgba(0,209,255,0.10)',  border: 'rgba(0,209,255,0.55)',  label: '실행중', Icon: Loader2, spin: true },
  Success: { fg: '#37E08A', bg: 'rgba(55,224,138,0.10)', border: 'rgba(55,224,138,0.55)', label: '완료',  Icon: CheckCircle2 },
  Failed:  { fg: '#FF5566', bg: 'rgba(255,85,102,0.10)', border: 'rgba(255,85,102,0.55)', label: '실패',  Icon: XCircle },
}

export default function AnalyzePanel() {
  // ── 자세안정성 (useStabilityStore) ──────────────────────────────
  const stabilityReport = useStabilityStore(s => s.report)
  const stabilityRunning = useStabilityStore(s => s.running)
  const stabilityError = useStabilityStore(s => s.error)
  const stabilityOverall = useStabilityStore(s => s.overallStatus)
  const openStabilityPanel = useStabilityStore(s => s.openPanel)

  // ── Unit 구조 해석 (useUnitStructuralStore) ─────────────────────
  const structStatus = useUnitStructuralStore(s => s.status)
  const structProgress = useUnitStructuralStore(s => s.progress)
  const structSummary = useUnitStructuralStore(s => s.summary)
  const safetyFactor = useUnitStructuralStore(s => s.safetyFactor)
  const allowableMpa = useUnitStructuralStore(s => s.allowableMpa)
  const openStructuralPanel = useUnitStructuralStore(s => s.openPanel)

  const hasStabilityResult = !!stabilityReport || !!stabilityError

  return (
    <div style={{
      width: 190,
      flexShrink: 0,
      position: 'relative',
      background: '#0b0b1e',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* ── 헤더 ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '12px 10px 10px',
        borderBottom: '1px solid #1e1e38',
      }}>
        <Activity size={15} color="#6ee7b7" />
        <span style={{ fontSize: 12, fontWeight: 900, color: '#e6f1ff', letterSpacing: 0.5 }}>
          해석 (Analyze)
        </span>
      </div>

      {/* ── 섹션 1: 자세안정성 평가 ─────────────────── */}
      <Section label="자세안정성 평가">
        <StabilityStatusRow
          running={stabilityRunning}
          overall={stabilityOverall}
          hasResult={hasStabilityResult}
        />
        <ActionButton
          onClick={openStabilityPanel}
          disabled={!hasStabilityResult}
          accent="#00D1FF"
          icon={<ClipboardList size={14} />}
          title={hasStabilityResult
            ? '자세안정성 평가 결과 패널을 엽니다.'
            : 'Hoist 탭에서 "자세안정성 평가 실행"을 먼저 수행하세요.'}
        >
          결과 보기
        </ActionButton>
        {!hasStabilityResult && (
          <Hint>
            Hoist 탭에서 평가를 먼저 실행하면 여기서 결과를 다시 열 수 있습니다.
          </Hint>
        )}
      </Section>

      {/* ── 섹션 2: Unit 구조 해석 (σ / 허용응력) ───── */}
      <Section label="Unit 구조 해석">
        <StructuralStatusRow status={structStatus} progress={structProgress} />

        {/* 입력값 요약 (읽기 전용 — 실제 입력·실행은 플로팅 UnitStructuralPanel 담당) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <ReadonlyField label="Safety Factor" value={formatNum(safetyFactor)} />
          <ReadonlyField label="허용응력 (MPa)" value={formatNum(allowableMpa)} />
        </div>

        {structStatus === 'Success' && structSummary && (
          <StructuralSummary summary={structSummary} />
        )}

        <ActionButton
          onClick={openStructuralPanel}
          disabled={false}
          accent="#FFC447"
          icon={<Wrench size={14} />}
          title="Unit 구조 해석 패널을 엽니다. 입력값 변경·해석 실행·결과 확인은 그 패널에서 수행합니다."
        >
          구조 해석 패널 열기
        </ActionButton>
        <Hint>
          입력값 변경과 "구조 해석 실행"은 열린 패널에서 수행합니다. 자세안정성 PASS/WARN 후
          실행할 수 있습니다.
        </Hint>
      </Section>
    </div>
  )
}

// ── 자세안정성 상태 배지 행 ─────────────────────────────────────────────────

function StabilityStatusRow({ running, overall, hasResult }) {
  if (running) {
    return (
      <StatusPill fg="#90E8FF" bg="rgba(0,209,255,0.10)" border="rgba(0,209,255,0.55)">
        <Loader2 size={13} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
        평가 실행 중...
      </StatusPill>
    )
  }
  if (!hasResult) {
    return (
      <StatusPill fg="#7a8aaa" bg="rgba(122,138,170,0.08)" border="#2a2a4a">
        <AlertTriangle size={13} />
        미실행
      </StatusPill>
    )
  }
  const sc = overall ? STABILITY_STATUS[overall] : null
  if (!sc) {
    return (
      <StatusPill fg="#7a8aaa" bg="rgba(122,138,170,0.08)" border="#2a2a4a">
        <AlertTriangle size={13} />
        결과 확인 필요
      </StatusPill>
    )
  }
  return (
    <StatusPill fg={sc.fg} bg={sc.bg} border={sc.border}>
      <sc.Icon size={13} />
      {sc.label}
    </StatusPill>
  )
}

// ── 구조 해석 상태 배지 행 ──────────────────────────────────────────────────

function StructuralStatusRow({ status, progress }) {
  const sc = status ? STRUCTURAL_STATUS[status] : null
  if (!sc) {
    return (
      <StatusPill fg="#7a8aaa" bg="rgba(122,138,170,0.08)" border="#2a2a4a">
        <AlertTriangle size={13} />
        미실행
      </StatusPill>
    )
  }
  const showPct = (status === 'Pending' || status === 'Running')
  return (
    <StatusPill fg={sc.fg} bg={sc.bg} border={sc.border}>
      <sc.Icon size={13} style={sc.spin ? { animation: 'hoistSpin 900ms linear infinite' } : undefined} />
      {sc.label}
      {showPct && <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{Math.round(progress)}%</span>}
    </StatusPill>
  )
}

// ── 구조 해석 성공 요약 ─────────────────────────────────────────────────────

function StructuralSummary({ summary }) {
  const memberCount = summary?.memberElementCount ?? 0
  const exceedCount = summary?.memberExceedCount ?? 0
  const wireCount = summary?.wireCount ?? 0
  const wireCompression = summary?.wireCompressionCount ?? 0
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '7px 9px',
      background: 'rgba(0,0,0,0.25)',
      border: `1px solid ${exceedCount > 0 ? 'rgba(255,85,102,0.35)' : 'rgba(55,224,138,0.30)'}`,
      borderRadius: 6,
    }}>
      <SummaryRow
        label="부재 초과"
        value={`${exceedCount} / ${memberCount}`}
        color={exceedCount > 0 ? '#FF5566' : '#37E08A'}
      />
      <SummaryRow
        label="Wire 압축"
        value={`${wireCompression} / ${wireCount}`}
        color={wireCompression > 0 ? '#FFC447' : '#37E08A'}
      />
    </div>
  )
}

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#7a8aaa', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 800 }}>{value}</span>
    </div>
  )
}

// ── 공통 프리미티브 ─────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{
      padding: '11px 8px 12px',
      borderBottom: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{
        fontSize: 10, color: '#7ab2d4', letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 800,
        marginBottom: 1, paddingLeft: 2,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function StatusPill({ fg, bg, border, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 9px',
      borderRadius: 6,
      background: bg,
      border: `1px solid ${border}`,
      color: fg,
      fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
    }}>
      {children}
    </div>
  )
}

function ActionButton({ onClick, disabled, accent, icon, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        width: '100%',
        padding: '8px 10px',
        background: disabled ? '#0f0f1e' : `${accent}22`,
        color: disabled ? '#5a5a80' : '#ccd8e8',
        border: `1px solid ${disabled ? '#2a2a40' : accent + '88'}`,
        borderRadius: 6,
        fontSize: 11, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        textAlign: 'left',
      }}
    >
      {icon}
      <span style={{ flex: 1 }}>{children}</span>
      {!disabled && <ChevronRight size={13} style={{ opacity: 0.7 }} />}
    </button>
  )
}

function ReadonlyField({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      padding: '6px 9px',
      background: '#0f0f22',
      border: '1px solid #2a2a4a',
      borderRadius: 6,
    }}>
      <span style={{ fontSize: 10, color: '#90E8FF', fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#e6f1ff', fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function Hint({ children }) {
  return (
    <div style={{ fontSize: 9.5, color: '#60708a', lineHeight: 1.5, paddingLeft: 2 }}>
      {children}
    </div>
  )
}

function formatNum(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '-'
  if (Number.isInteger(v)) return String(v)
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
}
