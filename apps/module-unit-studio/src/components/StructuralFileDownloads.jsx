import { useState } from 'react'
import { CheckCircle2, FileDown, Loader2, XCircle } from 'lucide-react'
import { getHost } from '../host/host.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { syncEditedModel } from '../hooks/useUnitStructuralRunner.js'
import { liftingBdfAvailability, op2Availability } from '../utils/structuralDownloads.js'

/**
 * 구조 해석 파일 다운로드 — Analysis 탭(BDF·OP2)과 Save 탭(OP2)이 쓴다.
 *
 * - Wire 포함 BDF: 권상 Wire 가 들어간 **구조 해석용 BDF**. 자세안정성 평가 후 활성.
 *   해석 전에는 백엔드가 해석과 같은 함수로 새로 만들고, 해석 성공 후에는 그 해석이 실제로 푼
 *   BDF 를 그대로 받는다 — 그래서 아래 OP2 와 항상 짝이 맞는다.
 * - OP2: 그 BDF 를 Nastran 이 푼 결과. 구조 해석 성공 후 활성.
 */
export function LiftingBdfDownloadButton() {
  const overall = useStabilityStore(s => s.overallStatus)
  const stabilityPath = useStabilityStore(s => s.stabilityPath)
  const structuralStatus = useUnitStructuralStore(s => s.status)
  const analysisId = useUnitStructuralStore(s => s.analysisId)
  const safetyFactor = useUnitStructuralStore(s => s.safetyFactor)
  const host = getHost()
  const { enabled, reason } = liftingBdfAvailability({
    overall, stabilityPath, hostReady: typeof host.downloadLiftingBdf === 'function', isElectron: host.name === 'electron',
  })
  const solved = structuralStatus === 'Success' && !!analysisId

  const run = async () => {
    if (solved) return host.downloadLiftingBdf({ analysisId })
    // 해석 전: 해석 실행과 똑같이 현재 편집 모델을 먼저 올려야 받은 BDF 가 해석본과 같다.
    const sync = await syncEditedModel(host)
    if (sync && !sync.ok) return { ok: false, error: `편집 모델 반영 실패: ${sync.error}` }
    return host.downloadLiftingBdf({ stabilityPath, safetyFactor })
  }

  return (
    <DownloadButton
      label="Wire 포함 BDF 다운로드"
      busyLabel="BDF 생성 중…"
      accent="110,231,183"
      enabled={enabled}
      reason={reason}
      run={run}
      hint={solved
        ? '구조 해석에 실제로 사용된 BDF 입니다(아래 OP2 와 같은 해석).'
        : `권상 Wire·하중(SF ${safetyFactor})이 포함된 구조 해석용 BDF 입니다.`}
    />
  )
}

export function Op2DownloadButton() {
  const status = useUnitStructuralStore(s => s.status)
  const analysisId = useUnitStructuralStore(s => s.analysisId)
  const host = getHost()
  const { enabled, reason } = op2Availability({
    status, analysisId, hostReady: typeof host.downloadUnitOp2 === 'function', isElectron: host.name === 'electron',
  })
  return (
    <DownloadButton
      label="결과 OP2 다운로드"
      busyLabel="OP2 받는 중…"
      accent="0,209,255"
      enabled={enabled}
      reason={reason}
      run={() => host.downloadUnitOp2({ analysisId })}
      hint="Wire 포함 BDF 를 Nastran SOL 101 로 푼 결과 파일입니다."
    />
  )
}

function DownloadButton({ label, busyLabel, accent, enabled, reason, run, hint }) {
  const [state, setState] = useState({ phase: 'idle', message: '' })
  const busy = state.phase === 'busy'
  const active = enabled && !busy

  const onClick = async () => {
    if (!active) return
    setState({ phase: 'busy', message: '' })
    try {
      const r = await run()
      if (r?.ok) setState({ phase: 'ok', message: r.savedPath ?? '저장 완료' })
      else if (r?.canceled) setState({ phase: 'idle', message: '' })
      else setState({ phase: 'error', message: r?.error ?? '다운로드 실패' })
    } catch (e) {
      setState({ phase: 'error', message: e?.message ?? String(e) })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" onClick={onClick} disabled={!active} title={enabled ? hint : reason} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        width: '100%', padding: '8px 10px', borderRadius: 6,
        background: active ? `rgba(${accent},.14)` : '#0f0f1e',
        color: active ? '#dff6ff' : '#5a5a80',
        border: `1px solid ${active ? `rgba(${accent},.55)` : '#2a2a40'}`,
        cursor: active ? 'pointer' : 'not-allowed', fontSize: 11, fontWeight: 800,
      }}>
        {busy ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} /> : <FileDown size={14} />}
        {busy ? busyLabel : label}
      </button>
      {state.phase === 'ok' && <Status Icon={CheckCircle2} color="#37E08A">저장 · {state.message}</Status>}
      {state.phase === 'error' && <Status Icon={XCircle} color="#FF7A88">실패 · {state.message}</Status>}
      <div style={{ color: '#7f91aa', fontSize: 10, lineHeight: 1.45 }}>{enabled ? hint : reason}</div>
    </div>
  )
}

function Status({ Icon, color, children }) {
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color, fontSize: 10, lineHeight: 1.45, wordBreak: 'break-all' }}>
    <Icon size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {children}
  </div>
}
