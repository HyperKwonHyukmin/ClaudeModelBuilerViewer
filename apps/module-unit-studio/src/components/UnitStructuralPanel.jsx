import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  X,
  Play,
  Wrench,
} from 'lucide-react'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { useUnitStructuralRunner } from '../hooks/useUnitStructuralRunner.js'

/**
 * UnitStructuralPanel — 자세안정성 PASS 후 Wire 포함 BDF + Nastran SOL 101 실행 패널.
 *
 * StabilityReportPanel 옆(우측)에 동일 형식으로 배치. main process 의 IPC 핸들러
 * viewer:runUnitStructural 가 백엔드 unit-structural endpoint 를 호출하고 폴링한다.
 *
 * 활성 조건:
 *   - 자세안정성 결과의 overall === 'pass' (사용자 요구사항)
 *   - host.runUnitStructural 가 노출되어 있어야 함 (Workbench Electron 환경)
 *   - status !== 'Running' (중복 실행 방지)
 */

const STATUS_COLOR = {
  pass:    { fg: '#37E08A', bg: 'rgba(55,224,138,0.10)', border: 'rgba(55,224,138,0.45)', label: 'PASS', Icon: CheckCircle2 },
  warn:    { fg: '#FFC447', bg: 'rgba(255,196,71,0.10)', border: 'rgba(255,196,71,0.45)', label: 'WARN', Icon: AlertTriangle },
  fail:    { fg: '#FF5566', bg: 'rgba(255,85,102,0.10)', border: 'rgba(255,85,102,0.45)', label: 'FAIL', Icon: XCircle },
  running: { fg: '#90E8FF', bg: 'rgba(0,209,255,0.10)',  border: 'rgba(0,209,255,0.45)',  label: 'RUN',  Icon: Loader2 },
}

export default function UnitStructuralPanel() {
  const open = useUnitStructuralStore(s => s.panelOpen)
  const close = useUnitStructuralStore(s => s.closePanel)

  // 실행·준비상태·입력 미러는 AnalyzePanel(좌측 도크, 주 입력/실행 위치)과 공유하는 훅에서 가져온다.
  // 이 floating 패널은 '구조 해석 패널 열기'(결과 Success 후 활성)로만 열리는 상세 뷰.
  const {
    status, progress, message, result, summary, warnings, error, ranAt,
    sfInput, setSfInput, commitSf,
    allowInput, setAllowInput, commitAllow,
    overall, stabilityPath, ipcAvailable, shapeRelaxed,
    isRunning, isFinished, isReady, canRun,
    handleRun,
  } = useUnitStructuralRunner()

  // 패널 위치 — 첫 마운트 시 우상단의 XYZ 축 바로 아래로 anchor.
  // ThreeViewport 의 AXES_PX=108, AXES_MARGIN=10 기준 → top = 10 + 108 + 8 = 126.
  // 사용자가 드래그하면 그 위치를 localStorage 에 영구 저장. STORAGE_KEY v3 로 bump.
  //
  // anchored=true 인 동안에는 부모 폭 변화(InspectorPanel 펼침/접힘 등)를 ResizeObserver 로
  // 감지해 자동으로 우상단을 따라간다. 사용자가 드래그하면 anchored=false 로 바뀌고 그 위치를 유지.
  const PANEL_W = 420
  const AXES_PX = 108
  const AXES_MARGIN = 10
  const STORAGE_KEY = 'unit_structural_panel_pos_v4'
  const panelRef = useRef(null)
  const initial = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved
    } catch { /* 손상된 저장값 무시 */ }
    return null
  })()
  const [pos, setPos] = useState(initial)
  const [anchored, setAnchored] = useState(initial?.anchored ?? true)

  // 우상단 anchor 좌표 계산 (부모 폭 기준)
  const computeAnchor = () => {
    const parent = panelRef.current?.parentElement
    if (!parent) return null
    const rect = parent.getBoundingClientRect()
    return {
      x: Math.max(8, rect.width - PANEL_W - AXES_MARGIN),
      y: AXES_MARGIN + AXES_PX + 8,
    }
  }

  // 첫 마운트 — 저장된 좌표 없으면 우상단 anchor
  useLayoutEffect(() => {
    if (pos || !panelRef.current) return
    const anchor = computeAnchor()
    if (anchor) setPos(anchor)
  }, [pos])

  // 부모 폭 변화 (Sidebar/InspectorPanel 펼침/접힘)를 감지해 anchored 상태에서는 자동 추종
  useEffect(() => {
    const parent = panelRef.current?.parentElement
    if (!parent || !anchored) return
    const ro = new ResizeObserver(() => {
      const anchor = computeAnchor()
      if (anchor) setPos(anchor)
    })
    ro.observe(parent)
    return () => ro.disconnect()
  }, [anchored])

  // localStorage 영구 저장 (anchored 플래그도 함께)
  useEffect(() => {
    if (!pos) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...pos, anchored })) } catch { /* 저장 실패 무시 */ }
  }, [pos, anchored])

  // 헤더 잡고 드래그 — panel 을 viewport 안 자유롭게 이동
  const startDrag = (e) => {
    if (!pos) return
    // 닫기 버튼 등의 클릭은 무시 (button 안에서 시작된 mousedown)
    if (e.target.closest('button')) return
    e.preventDefault()
    // 사용자가 드래그하면 우상단 자동 추종을 해제 — 이후 위치는 사용자가 책임진다.
    if (anchored) setAnchored(false)
    const startMx = e.clientX
    const startMy = e.clientY
    const startPos = { ...pos }
    const onMove = (ev) => {
      const parent = panelRef.current?.parentElement
      const bounds = parent?.getBoundingClientRect()
      const nx = startPos.x + (ev.clientX - startMx)
      const ny = startPos.y + (ev.clientY - startMy)
      // viewport 안으로 clamp — 헤더 일부는 항상 보이도록
      const maxX = bounds ? Math.max(0, bounds.width - 60) : 99999
      const maxY = bounds ? Math.max(0, bounds.height - 30) : 99999
      setPos({
        x: Math.min(maxX, Math.max(-PANEL_W + 60, nx)),
        y: Math.min(maxY, Math.max(0, ny)),
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!open) return null

  return (
    <div ref={panelRef} style={{
      position: 'absolute',
      top: pos?.y ?? 42,
      left: pos?.x ?? 8,
      width: PANEL_W,
      maxHeight: 'calc(100vh - 56px)',
      zIndex: 22,
      background: 'rgba(8, 6, 22, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,196,71,0.35)',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      visibility: pos ? 'visible' : 'hidden',
    }}>
      <Header status={status} ranAt={ranAt} onClose={close} onDragStart={startDrag} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ReadinessRow
          isReady={isReady}
          overall={overall}
          ipcAvailable={ipcAvailable}
          stabilityPath={stabilityPath}
          shapeRelaxed={shapeRelaxed}
        />

        <InputsRow
          sfInput={sfInput}
          setSfInput={setSfInput}
          onCommitSf={commitSf}
          allowInput={allowInput}
          setAllowInput={setAllowInput}
          onCommitAllow={commitAllow}
          disabled={isRunning}
        />

        <button
          onClick={handleRun}
          disabled={!canRun}
          title={
            isFinished ? '이미 해석이 완료되었습니다 — 다시 실행하려면 좌하단 "초기화" 후 폴더를 다시 여세요'
            : canRun ? 'Unit 구조 해석 실행'
            : isRunning ? '실행 중...'
            : '자세안정성 PASS/WARN + Workbench 환경 필요'
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            background: canRun ? 'linear-gradient(180deg, #FFC447 0%, #ff9d3a 100%)' : '#2a2a4a',
            color: canRun ? '#1a1300' : '#7a8aaa',
            border: 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.4,
            cursor: canRun ? 'pointer' : 'not-allowed',
            transition: 'opacity 0.15s',
            opacity: canRun ? 1 : 0.7,
          }}
        >
          {isRunning ? <Loader2 size={14} className="spin" />
            : isFinished ? <CheckCircle2 size={14} />
            : <Play size={14} />}
          {isRunning ? `실행 중... ${progress}%`
            : isFinished ? '해석 완료 — 초기화 후 재실행'
            : 'Unit 구조 해석 실행'}
        </button>

        {isRunning && <ProgressBlock progress={progress} message={message} />}
        {!isRunning && error && <ErrorBlock error={error} />}
        {!isRunning && status === 'Success' && (
          <SuccessBlock summary={summary} warnings={warnings} result={result} />
        )}
        {!isRunning && !error && status === null && (
          <div style={{ fontSize: 11, color: '#7a8aaa', lineHeight: 1.55 }}>
            자세안정성 평가가 PASS 된 후 위 입력값을 확인하고 실행하세요. Wire 포함 BDF 가 빌드되고
            Nastran SOL 101 이 실행되며, 부재 응력/Wire 장력 결과가 산출됩니다.
          </div>
        )}
      </div>

      <style>{`@keyframes _us_spin { to { transform: rotate(360deg) } } .spin { animation: _us_spin 1s linear infinite; }`}</style>
    </div>
  )
}

function Header({ status, ranAt, onClose, onDragStart }) {
  const sc = status === 'Pending' || status === 'Running' ? STATUS_COLOR.running
    : status === 'Success' ? STATUS_COLOR.pass
    : status === 'Failed' ? STATUS_COLOR.fail
    : null
  return (
    <div
      onMouseDown={onDragStart}
      title="헤더를 잡고 끌어 패널 위치를 이동할 수 있습니다"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255,196,71,0.20)',
        background: 'linear-gradient(180deg, rgba(255,196,71,0.06) 0%, transparent 100%)',
        cursor: 'move',
        userSelect: 'none',
      }}>
      <Wrench size={14} style={{ color: '#FFC447' }} />
      <span style={{ fontSize: 13, fontWeight: 900, color: '#FFD876', letterSpacing: 0.6, flex: 1 }}>
        Unit 구조 해석
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
          <sc.Icon size={13} className={sc === STATUS_COLOR.running ? 'spin' : undefined} />
          {sc.label}
        </span>
      )}
      {ranAt && <span style={{ fontSize: 9, color: '#60708a' }}>{formatRanAt(ranAt)}</span>}
      <button
        onClick={onClose}
        title="패널 닫기"
        style={{
          width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: '1px solid #2a2a4a', borderRadius: 5,
          color: '#7a8aaa', cursor: 'pointer', padding: 0, lineHeight: 0,
        }}>
        <X size={13} />
      </button>
    </div>
  )
}

function ReadinessRow({ isReady, overall, ipcAvailable, stabilityPath, shapeRelaxed = false }) {
  // 차단 사유 — fail/미실행/IPC 없음/path 없음
  const blocking = []
  if (overall === 'fail') blocking.push('자세안정성 FAIL')
  else if (overall == null) blocking.push('자세안정성 미실행')
  if (!ipcAvailable) blocking.push('Workbench 환경 아님')
  if (!stabilityPath) blocking.push('stability JSON path 없음')

  const isWarnReady = isReady && overall === 'warn'
  if (!isReady) {
    return (
      <div style={{
        fontSize: 11, color: '#FFC447',
        background: 'rgba(255,196,71,0.06)',
        border: '1px solid rgba(255,196,71,0.30)',
        borderRadius: 6, padding: '6px 8px', lineHeight: 1.5,
      }}>
        대기 — {blocking.join(' / ')}
      </div>
    )
  }
  if (isWarnReady) {
    return (
      <div style={{
        fontSize: 11, color: '#FFC447',
        background: 'rgba(255,196,71,0.10)',
        border: '1px solid rgba(255,196,71,0.45)',
        borderRadius: 6, padding: '7px 9px', lineHeight: 1.5,
      }}>
        <div style={{ fontWeight: 800, marginBottom: 3 }}>
          ⚠ 자세안정성 WARN — 진행 가능하지만 결과 검토 필요
        </div>
        <div style={{ color: '#cfd5e6' }}>
          {shapeRelaxed
            // Strict 평가 OFF 로 형상 FAIL 이 warn 으로 강등된 상태 — 통상 경고와 성격이 다르므로
            // "형상 기준을 만족하지 못했다"는 사실을 분명히 적는다.
            ? <>
                <strong style={{ color: '#FFC447' }}>Strict 평가 OFF</strong> — 권상 형상 기준(형상 분류·Z단차·평면도 등)을
                만족하지 못했으나 경고로 처리해 진행합니다. 전도·Wire 길이는 정상 판정된 상태입니다.
              </>
            : '간섭/슬링각 등 경고 사항이 남아있습니다. 결과 패널에서 함께 확인하세요.'}
        </div>
      </div>
    )
  }
  return (
    <div style={{
      fontSize: 11, color: '#37E08A',
      background: 'rgba(55,224,138,0.06)',
      border: '1px solid rgba(55,224,138,0.30)',
      borderRadius: 6, padding: '6px 8px', lineHeight: 1.5,
    }}>
      준비 완료 — 입력값을 확인하고 실행하세요.
    </div>
  )
}

function InputsRow({ sfInput, setSfInput, onCommitSf, allowInput, setAllowInput, onCommitAllow, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Field label="Safety Factor" hint="GRAV 에 곱해지는 하중 배수">
        <input
          type="number"
          step="0.05"
          min="0.01"
          value={sfInput}
          disabled={disabled}
          onChange={(e) => setSfInput(e.target.value)}
          onBlur={onCommitSf}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={inputStyle(disabled)}
        />
      </Field>
      <Field label="허용응력 (MPa)" hint="구조·배관 통일">
        <input
          type="number"
          step="10"
          min="1"
          value={allowInput}
          disabled={disabled}
          onChange={(e) => setAllowInput(e.target.value)}
          onBlur={onCommitAllow}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={inputStyle(disabled)}
        />
      </Field>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: '#90E8FF', fontWeight: 700, letterSpacing: 0.4 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 9, color: '#60708a' }}>{hint}</span>}
    </label>
  )
}

function inputStyle(disabled) {
  return {
    width: '100%',
    padding: '5px 8px',
    fontSize: 12,
    color: disabled ? '#60708a' : '#e6f1ff',
    background: 'rgba(8, 6, 22, 0.65)',
    border: '1px solid #2a2a4a',
    borderRadius: 5,
    outline: 'none',
  }
}

function ProgressBlock({ progress, message }) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: 8,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid #2a2a4a',
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${pct}%`,
          background: 'linear-gradient(90deg, #00d1ff 0%, #FFC447 100%)',
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#cad8e8', lineHeight: 1.45 }}>
        <span style={{ fontWeight: 800, color: '#90E8FF' }}>{pct}%</span>
        {message && <span style={{ marginLeft: 8 }}>{message}</span>}
      </div>
    </div>
  )
}

function ErrorBlock({ error }) {
  const msg = error?.message ?? error?.error ?? String(error)
  return (
    <div style={{
      padding: '8px 10px',
      background: 'rgba(255,85,102,0.08)',
      border: '1px solid rgba(255,85,102,0.40)',
      borderRadius: 7,
      color: '#FFB3BC',
      fontSize: 11,
      lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 800, color: '#FF5566', marginBottom: 4 }}>실행 실패</div>
      <div>{msg}</div>
      {error?.stderr && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 10, color: '#90A4B0' }}>로그 보기</summary>
          <pre style={{
            marginTop: 4, fontSize: 10, lineHeight: 1.4, maxHeight: 200, overflow: 'auto',
            color: '#90A4B0', whiteSpace: 'pre-wrap',
          }}>{String(error.stderr).slice(0, 4000)}</pre>
        </details>
      )}
    </div>
  )
}

function ColorLegend({ allowableMpa }) {
  return (
    <div style={{
      padding: '7px 9px',
      background: 'rgba(0,0,0,0.25)',
      border: '1px solid #2a2a4a',
      borderRadius: 6,
      fontSize: 10,
      color: '#cad8e8',
      lineHeight: 1.55,
    }}>
      <div style={{ fontSize: 10, color: '#90E8FF', fontWeight: 800, marginBottom: 4 }}>색 범례 (구조·배관)</div>
      <Swatch color="#4488FF" label={`σ ≤ ${allowableMpa} MPa`} />
      <Swatch color="#FF5566" label={`σ > ${allowableMpa} MPa (초과)`} />
      <div style={{ marginTop: 4, fontSize: 9.5, color: '#7a8aaa' }}>
        와이어는 각 와이어 위에 축력(N)을 직접 표시합니다. 모델을 클릭하면 해당 부재의 응력값이 보입니다.
      </div>
    </div>
  )
}

function Swatch({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span style={{
        display: 'inline-block', width: 12, height: 4, background: color,
        borderRadius: 2, flexShrink: 0,
      }} />
      <span>{label}</span>
    </div>
  )
}

function SuccessBlock({ summary, warnings, result }) {
  const memberCount = summary?.memberElementCount ?? 0
  const exceedCount = summary?.memberExceedCount ?? 0
  const maxStress = summary?.memberMaxStressMPa
  const maxStressEid = summary?.memberMaxStressElementId
  const wireCount = summary?.wireCount ?? 0
  const wireCompression = summary?.wireCompressionCount ?? 0
  const wireMin = summary?.wireMinAxialForceN
  const wireMax = summary?.wireMaxAxialForceN
  const allowable = result?.evaluation?.structuralAllowableMPa

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Stat title="부재 응력" tone={exceedCount > 0 ? 'fail' : 'pass'}>
        총 <b>{memberCount.toLocaleString()}</b>개 — 초과 <b style={{ color: exceedCount > 0 ? '#FF5566' : '#37E08A' }}>{exceedCount}</b>개
        {Number.isFinite(maxStress) && (
          <div style={{ fontSize: 10, color: '#90A4B0', marginTop: 2 }}>
            max σ {Number(maxStress).toFixed(1)} MPa @ E{maxStressEid} {allowable && `(허용 ${allowable} MPa)`}
          </div>
        )}
      </Stat>
      <Stat title="Wire 장력" tone={wireCompression > 0 ? 'warn' : 'pass'}>
        총 <b>{wireCount}</b>개 — 압축 <b style={{ color: wireCompression > 0 ? '#FFC447' : '#37E08A' }}>{wireCompression}</b>개
        {Number.isFinite(wireMin) && Number.isFinite(wireMax) && (
          <div style={{ fontSize: 10, color: '#90A4B0', marginTop: 2 }}>
            F 범위 {Number(wireMin).toLocaleString()} ~ {Number(wireMax).toLocaleString()} N
          </div>
        )}
      </Stat>
      {Array.isArray(warnings) && warnings.length > 0 && (
        <div style={{
          padding: '7px 9px',
          background: 'rgba(255,196,71,0.06)',
          border: '1px solid rgba(255,196,71,0.30)',
          borderRadius: 6,
          fontSize: 10.5,
          lineHeight: 1.55,
          color: '#FFE3A0',
        }}>
          <div style={{ fontWeight: 800, color: '#FFC447', marginBottom: 4 }}>경고 {warnings.length}건</div>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
            {warnings.length > 5 && <li style={{ color: '#90A4B0' }}>... 외 {warnings.length - 5}건</li>}
          </ul>
        </div>
      )}
      <ColorLegend allowableMpa={allowable ?? 220} />
    </div>
  )
}

function Stat({ title, tone, children }) {
  const color = tone === 'fail' ? '#FF5566' : tone === 'warn' ? '#FFC447' : '#37E08A'
  return (
    <div style={{
      padding: '7px 10px',
      background: 'rgba(0,0,0,0.25)',
      border: `1px solid ${color}33`,
      borderRadius: 6,
      fontSize: 11.5,
      color: '#cad8e8',
      lineHeight: 1.45,
    }}>
      <div style={{ fontSize: 10, color, fontWeight: 800, letterSpacing: 0.5, marginBottom: 3 }}>{title}</div>
      {children}
    </div>
  )
}

function formatRanAt(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}
