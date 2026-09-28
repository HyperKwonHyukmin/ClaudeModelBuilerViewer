import {
  Activity,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronRight,
  Play,
  Wrench,
} from 'lucide-react'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useViewerStore } from '../store/useViewerStore.js'
import TabPanel, { Accordion, HelpList, StatusLine } from './shell/TabPanel.jsx'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { useUnitStructuralRunner } from '../hooks/useUnitStructuralRunner.js'
import { useEditStore, computeMassFallback } from '../store/useEditStore.js'
import { useStageStore } from '../store/useStageStore.js'
import UnitStructuralReportButton from './UnitStructuralReportButton.jsx'
import { LiftingBdfDownloadButton, Op2DownloadButton } from './StructuralFileDownloads.jsx'

/**
 * AnalyzePanel — 상단 메뉴바 'Analyze' 모드의 좌측 도크 본문.
 *
 * 설계:
 *  - 자세안정성 평가: 결과 요약/진입만 담당. 실행은 Hoist 탭의 "자세안정성 평가 실행".
 *  - Unit 구조 해석: 입력(Safety Factor·허용응력)·준비상태·실행·진행·요약을 이 도크가 직접 소유한다
 *    (이전에는 뷰포트 floating UnitStructuralPanel 이 담당했으나 Analyze 좌측 도크로 이주).
 *    실행 로직은 useUnitStructuralRunner 훅으로 floating 패널과 공유한다.
 *  - "구조 해석 패널 열기": 상세 결과 floating 패널을 여는 버튼 — 해석 결과(Success) 전까지 비활성.
 *
 * 폭 190 고정(레이아웃 점프 방지), background '#0b0b1e'.
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
  const openPanel = useStabilityStore(s => s.openPanel)
  // 결과 패널은 Hoist 탭에서만 뜨므로(ViewportContainer) 여기서는 탭 전환까지 함께 한다.
  const setActiveMode = useViewerStore(s => s.setActiveMode)
  const openStabilityPanel = () => { openPanel(); setActiveMode('hoist') }

  // ── Unit 구조 해석 (실행/준비/입력 공유 훅 + 상세 패널 열기) ─────
  const us = useUnitStructuralRunner()
  const resetStructuralResult = useUnitStructuralStore(s => s.reset)

  // ── 가서포트(보강) — 추가·제거는 Edit 탭으로 옮겼고 여기선 반영 개수만 보여 준다 ──
  // 편집으로 직전 해석 결과가 초기화됐음을 알리는 배너 플래그
  const editStaleNotice = useEditStore(s => s.editStaleNotice)
  const clearEditStaleNotice = useEditStore(s => s.clearEditStaleNotice)
  // ⚠️ 셀렉터에서 .filter() 로 새 배열을 반환하면 Zustand v5 가 매 렌더마다 다른 참조로 보고
  // 무한 렌더 루프에 빠진다(패널 크래시 → 빈 화면). 안정적인 intents 참조만 구독하고 본문에서 필터링.
  const intents = useEditStore(s => s.intents)
  const supportBeams = intents.filter(i => i.kind === 'addSupportBeam')
  const stages = useStageStore(s => s.stages)
  const stageSummary = useStageStore(s => s.stageSummary)
  const lastStage = stages.at(-1)
  const massFallback = lastStage ? computeMassFallback(lastStage) : null
  const massTon = massFallback?.totalMassTon ?? stageSummary?.massProperties?.totalMassTon
  const cog = massFallback?.centerOfGravityMm ?? stageSummary?.massProperties?.centerOfGravityMm
  const hoistMode = useEditStore(s => s.hoistMode)
  const hoistGroups = useEditStore(s => s.hoistGroups)
  const wireLengthM = useEditStore(s => s.wireLengthM)

  const hasStabilityResult = !!stabilityReport || !!stabilityError
  const inputsDisabled = us.isRunning || us.isFinished

  // 상태 스트립 — 이 탭에서 "지금 어디까지 왔나"를 한 줄로. 해석 상태가 우선이고,
  // 아직 시작 전이면 그 앞 단계(자세안정성)가 준비됐는지를 보여 준다.
  const analysisStatusLine = us.status === 'Running' || us.status === 'Pending'
    ? <StatusLine tone="info" icon={Loader2} right={us.progress != null ? `${us.progress}%` : null}>구조 해석 실행 중</StatusLine>
    : us.status === 'Failed'
      ? <StatusLine tone="danger" icon={XCircle}>구조 해석 실패</StatusLine>
      : us.status === 'Success'
        ? <StatusLine tone="ok" icon={CheckCircle2} right={`허용 ${us.allowableMpa} MPa`}>구조 해석 완료</StatusLine>
        : us.isReady
          ? <StatusLine tone="info" icon={Play} right={`SF ${us.safetyFactor}`}>실행 준비됨</StatusLine>
          : <StatusLine tone="muted" icon={AlertTriangle}>
              {hasStabilityResult ? (us.blocking?.[0] ?? '실행 조건 확인 필요') : 'Hoist 탭에서 자세안정성 평가를 먼저 실행'}
            </StatusLine>

  const analysisHelp = (
    <>
      <div>권상 조건이 정해진 모델을 Nastran SOL 101(선형 정적)으로 풀고 부재 응력·변위·Wire 장력을 봅니다.</div>
      <HelpList title="실행 조건" items={[
        '자세안정성 PASS 또는 WARN — FAIL 이면 Hoist 탭에서 위치를 다시 잡습니다',
        'Workbench(Electron) 환경 — 웹 단독 모드에서는 실행할 수 없습니다',
      ]} />
      <HelpList title="결과 보는 곳" items={[
        '부재 응력·변위·Wire 장력 표 — 하단 도크 "구조 해석 결과" 탭 (Ctrl+J)',
        '검토 보고서(xlsx) — Save 탭',
      ]} />
      <HelpList title="해석 파일" items={[
        'Wire 포함 BDF — 자세안정성 평가 후 받을 수 있는 구조 해석용 BDF',
        '결과 OP2 — 구조 해석 성공 후, 그 BDF 를 푼 결과 (Save 탭에서도 받을 수 있음)',
      ]} />
    </>
  )

  return (
    <TabPanel id="analysis" title="Analysis" purpose="구조 해석을 실행하고 결과를 확인합니다."
      icon={Activity} status={analysisStatusLine} help={analysisHelp}>

      {/* ── 편집으로 결과가 무효화됐음을 알리는 배너 ─────── */}
      {editStaleNotice && (
        <div style={{
          margin: '8px 8px 0', padding: '8px 10px',
          background: 'rgba(255,196,71,0.10)',
          border: '1px solid rgba(255,196,71,0.55)',
          borderRadius: 6,
          display: 'flex', alignItems: 'flex-start', gap: 7,
        }}>
          <AlertTriangle size={13} color="#FFC447" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, fontSize: 10.5, lineHeight: 1.45, color: '#ffdf9e' }}>
            모델이 편집되어 이전 해석 결과가 초기화되었습니다. 다시 실행해 주세요.
            <button
              type="button"
              onClick={clearEditStaleNotice}
              style={{
                display: 'block', marginTop: 4,
                background: 'transparent', border: 'none', padding: 0,
                color: '#ffc447', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              확인 (배너 닫기)
            </button>
          </div>
        </div>
      )}

      <Section label="해석 시나리오">
        <ScenarioRow label="Solver" value="Nastran SOL 101 · 선형 정적" />
        <ScenarioRow label="하중 방향" value="중력 -Z" />
        <ScenarioRow label="총중량 / 무게중심" value={`${formatNumber(massTon, 2, 't')} / ${formatCog(cog)}`} />
        <ScenarioRow label="권상 조건" value={`${hoistMode ?? '미지정'} · ${Object.values(hoistGroups).filter(g => g?.length).length}그룹 · Wire ${wireLengthM ?? '-'}m`} />
        <ScenarioRow label="평가 기준" value={`SF ${us.safetyFactor} · ${us.allowableMpa} MPa`} />
      </Section>

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
            ? 'Hoist 탭으로 이동해 자세안정성 평가 결과 패널을 엽니다.'
            : 'Hoist 탭에서 "자세안정성 평가 실행"을 먼저 수행하세요.'}
        >
          Hoist 탭에서 결과 보기
        </ActionButton>
        <Hint>
          {hasStabilityResult
            ? '결과 패널은 Hoist 탭에서만 표시됩니다 — 이 탭의 3D 뷰를 가리지 않기 위함입니다.'
            : 'Hoist 탭에서 평가를 먼저 실행하면 여기서 결과를 다시 열 수 있습니다.'}
        </Hint>
      </Section>

      {/* ── 섹션: 가서포트(보강) 반영 현황 ─────────────────
          추가·제거는 편집 도구라 Edit 탭으로 옮겼다(사용자 요청). 해석을 실행하는 이 패널에는
          "지금 몇 개가 반영되는지" 만 남긴다. */}
      {supportBeams.length > 0 && (
        <Section label="가서포트(보강)">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', borderRadius: 6,
            background: 'rgba(45,212,191,0.08)', border: '1px solid rgba(45,212,191,0.35)',
          }}>
            <Wrench size={13} color="#5eead4" />
            <span style={{ fontSize: 11, color: '#bfe9d8', fontWeight: 700 }}>
              가서포트 {supportBeams.length}개 반영
            </span>
          </div>
          <Hint>추가·제거는 상단 <strong style={{ color: '#FFE6A8' }}>Edit</strong> 탭에서 합니다.</Hint>
        </Section>
      )}

      {/* ── 섹션 2: Unit 구조 해석 (입력·실행·결과 직접 소유) ───── */}
      <Section label="Unit 구조 해석">
        <StructuralStatusRow status={us.status} progress={us.progress} />

        {/* 준비 상태 — 자세안정성 PASS/WARN + Workbench 환경 + stability JSON 필요 */}
        {!us.isFinished && <ReadinessRow isReady={us.isReady} overall={us.overall} blocking={us.blocking} />}

        {/* 입력 (편집 가능 — 실행 중/완료 시 잠금) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <EditableField
            label="Safety Factor"
            value={us.sfInput}
            onChange={us.setSfInput}
            onCommit={us.commitSf}
            disabled={inputsDisabled}
            step="0.05"
            min="0.01"
          />
          <EditableField
            label="허용응력 (MPa)"
            value={us.allowInput}
            onChange={us.setAllowInput}
            onCommit={us.commitAllow}
            disabled={inputsDisabled}
            step="10"
            min="1"
          />
        </div>

        {/* 실행 버튼 */}
        <RunButton
          canRun={us.canRun}
          isRunning={us.isRunning}
          isFinished={us.isFinished}
          progress={us.progress}
          onClick={us.handleRun}
        />

        {/* 진행 바 */}
        {us.isRunning && <ProgressLine progress={us.progress} message={us.message} />}

        {/* 실패 메시지 */}
        {!us.isRunning && us.error && (
          <div style={{
            fontSize: 10, color: '#FFB3BC', lineHeight: 1.5,
            background: 'rgba(255,85,102,0.08)',
            border: '1px solid rgba(255,85,102,0.40)',
            borderRadius: 6, padding: '6px 8px',
          }}>
            <strong style={{ color: '#FF5566' }}>실행 실패</strong> · {us.error?.message ?? us.error?.error ?? String(us.error)}
          </div>
        )}

        {/* 성공 요약 */}
        {us.status === 'Success' && us.summary && (
          <StructuralSummary summary={us.summary} />
        )}

        {/* 해석 완료 후 Studio 주 화면에서 즉시 보고서를 생성한다. */}
        {us.status === 'Success' && <UnitStructuralReportButton />}
        {us.isFinished && (
          <ActionButton onClick={resetStructuralResult} accent="#FFC447" icon={<Play size={14} />} title="모델과 권상 설정은 유지하고 해석 입력·결과만 다시 준비합니다.">
            조건 변경 후 재실행
          </ActionButton>
        )}
      </Section>

      {/* ── 산출물: 구조 해석 입력(Wire 포함 BDF)과 결과(OP2) ─────
          편집 모델 BDF(Wire 없음)는 Save·Edit 탭에 있다. 여기서는 해석에 실제로 들어가는 BDF 를 준다. */}
      <Section label="해석 파일">
        <LiftingBdfDownloadButton />
        <Op2DownloadButton />
      </Section>
    </TabPanel>
  )
}

function ScenarioRow({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, lineHeight: 1.45 }}>
    <span style={{ color: '#7f91aa', flexShrink: 0 }}>{label}</span>
    <strong style={{ color: '#d7e3ef', textAlign: 'right' }}>{value}</strong>
  </div>
}

function formatNumber(value, digits, unit) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(digits)} ${unit}` : '재계산 필요'
}

function formatCog(cog) {
  const values = Array.isArray(cog) ? cog : cog ? [cog.x, cog.y, cog.z] : []
  return values.length === 3 && values.every(v => Number.isFinite(Number(v)))
    ? `(${values.map(v => Number(v).toFixed(0)).join(', ')}) mm`
    : '재계산 필요'
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

// ── 구조 해석 준비 상태 ─────────────────────────────────────────────────────

function ReadinessRow({ isReady, overall, blocking }) {
  if (!isReady) {
    return (
      <div style={{
        fontSize: 10, color: '#FFC447', lineHeight: 1.5,
        background: 'rgba(255,196,71,0.06)',
        border: '1px solid rgba(255,196,71,0.30)',
        borderRadius: 6, padding: '6px 8px',
      }}>
        대기 — {blocking.join(' / ')}
      </div>
    )
  }
  if (overall === 'warn') {
    return (
      <div style={{
        fontSize: 10, color: '#FFC447', lineHeight: 1.5,
        background: 'rgba(255,196,71,0.10)',
        border: '1px solid rgba(255,196,71,0.45)',
        borderRadius: 6, padding: '6px 8px',
      }}>
        ⚠ 자세안정성 WARN — 진행 가능하나 결과 검토 필요
      </div>
    )
  }
  return (
    <div style={{
      fontSize: 10, color: '#37E08A', lineHeight: 1.5,
      background: 'rgba(55,224,138,0.06)',
      border: '1px solid rgba(55,224,138,0.30)',
      borderRadius: 6, padding: '6px 8px',
    }}>
      준비 완료 — 입력값을 확인하고 실행하세요.
    </div>
  )
}

// ── 구조 해석 실행 버튼 ─────────────────────────────────────────────────────

function RunButton({ canRun, isRunning, isFinished, progress, onClick }) {
  const label = isRunning ? `실행 중... ${Math.round(progress)}%`
    : isFinished ? '해석 완료'
    : '구조 해석 실행'
  const enabled = canRun
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      title={
        isFinished ? '아래 "조건 변경 후 재실행" 버튼으로 모델·권상 설정을 유지한 채 다시 준비할 수 있습니다.'
        : enabled ? 'Unit 구조 해석 실행'
        : isRunning ? '실행 중...'
        : '자세안정성 PASS/WARN + Workbench 환경 필요'
      }
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: '100%', padding: '8px 10px',
        background: enabled ? 'linear-gradient(180deg, #FFC447 0%, #ff9d3a 100%)' : '#0f0f1e',
        color: enabled ? '#1a1300' : '#5a5a80',
        border: `1px solid ${enabled ? '#FFC44788' : '#2a2a40'}`,
        borderRadius: 6,
        fontSize: 11.5, fontWeight: 800, letterSpacing: 0.3,
        cursor: enabled ? 'pointer' : 'not-allowed',
        transition: 'all 0.15s ease',
      }}
    >
      {isRunning ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
        : isFinished ? <CheckCircle2 size={14} />
        : <Play size={14} fill={enabled ? '#1a1300' : 'none'} strokeWidth={2.5} />}
      {label}
    </button>
  )
}

function ProgressLine({ progress, message }) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        position: 'relative', width: '100%', height: 6,
        background: 'rgba(255,255,255,0.06)', borderRadius: 6,
        overflow: 'hidden', border: '1px solid #2a2a4a',
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${pct}%`,
          background: 'linear-gradient(90deg, #00d1ff 0%, #FFC447 100%)',
          transition: 'width 0.3s ease',
        }} />
      </div>
      {message && <div style={{ fontSize: 10, color: '#90A4B0', lineHeight: 1.4 }}>{message}</div>}
    </div>
  )
}

// ── 구조 해석 성공 요약 ─────────────────────────────────────────────────────

function StructuralSummary({ summary }) {
  const memberCount = summary?.memberElementCount ?? 0
  const exceedCount = summary?.memberExceedCount ?? 0
  const wireCount = summary?.wireCount ?? 0
  const wireCompression = summary?.wireCompressionCount ?? 0
  const wireMissing = summary?.wireMissingResultCount ?? 0
  const displacementCount = summary?.nodeDisplacementCount ?? 0
  const resultComplete = memberCount > 0 && wireCount > 0 && wireMissing === 0 && displacementCount > 0
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
      <SummaryRow
        label="결과 완전성"
        value={resultComplete ? '응력·변위·Wire 결과 확인' : `확인 필요 · Wire 누락 ${wireMissing}`}
        color={resultComplete ? '#37E08A' : '#FFC447'}
      />
      <div style={{ fontSize: 9.5, color: '#788ba4', lineHeight: 1.4 }}>
        전역 힘·모멘트 평형 오차는 현재 결과 파일에 제공되지 않으므로 보고서에서 별도 확인이 필요합니다.
      </div>
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

// 이 패널의 섹션 = 공통 틀의 아코디언. 호출부(<Section label="…">)는 그대로 두고 껍데기만 바꿔
// 다른 탭과 같은 접기/펼치기 동작을 얻는다.
function Section({ label, children }) {
  return <Accordion title={label} defaultOpen contentGap={7}>{children}</Accordion>
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

function EditableField({ label, value, onChange, onCommit, disabled, step, min }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      padding: '5px 8px 5px 9px',
      background: '#0f0f22',
      border: '1px solid #2a2a4a',
      borderRadius: 6,
    }}>
      <span style={{ fontSize: 10, color: '#90E8FF', fontWeight: 700, letterSpacing: 0.3, flexShrink: 0 }}>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{
          width: 64,
          padding: '3px 6px',
          fontSize: 12, fontWeight: 800,
          color: disabled ? '#5a5a80' : '#e6f1ff',
          background: disabled ? '#0a0a18' : 'rgba(8,6,22,0.65)',
          border: '1px solid #2a2a4a',
          borderRadius: 4,
          outline: 'none',
          textAlign: 'right',
        }}
      />
    </div>
  )
}

function Hint({ children }) {
  return (
    <div style={{ fontSize: 10, color: '#8aa0b8', lineHeight: 1.5, paddingLeft: 2 }}>
      {children}
    </div>
  )
}
