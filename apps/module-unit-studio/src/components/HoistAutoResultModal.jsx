import { useEffect, useRef, useState, useMemo } from 'react'
import { Loader2, X, CheckCircle2, AlertTriangle, XCircle, Play } from 'lucide-react'
import { useEditStore, getHoistMaxGroups } from '../store/useEditStore.js'
import { toNodeGroups } from '../data/hoistCandidateRank.js'
import HoistZoneConfig from './HoistZoneConfig.jsx'

const STATUS_STYLE = {
  pass: { color: '#37E08A', bg: 'rgba(55,224,138,0.12)', border: 'rgba(55,224,138,0.5)', Icon: CheckCircle2, label: 'PASS' },
  warn: { color: '#FFC447', bg: 'rgba(255,196,71,0.12)', border: 'rgba(255,196,71,0.5)', Icon: AlertTriangle, label: 'WARN' },
  fail: { color: '#FF6677', bg: 'rgba(255,102,119,0.12)', border: 'rgba(255,102,119,0.5)', Icon: XCircle, label: 'FAIL' },
}
const styleFor = (s) => STATUS_STYLE[s] ?? STATUS_STYLE.fail
const fmt = (v, unit = '') => (v == null ? '–' : `${Math.round(v)}${unit}`)

const defaultZoneConfig = (mode) => mode === 'ceiling'
  ? { bandAxis: 'y', bands: [1], pointsPerZone: [[3]], includePipe: false }
  : { bandAxis: 'y', bands: [1, 1], pointsPerZone: [[3], [3]], includePipe: false }

export default function HoistAutoResultModal({ onClose }) {
  const mode = useEditStore(s => s.hoistMode)
  const zoneSelect = useEditStore(s => s.zoneSelectHoistPositions)
  const autoSelect = useEditStore(s => s.autoSelectHoistPositions)
  const applyGroups = useEditStore(s => s.applyAutoHoistGroups)
  const maxGroups = getHoistMaxGroups(mode)
  const getPartitionInput = useEditStore(s => s.getZonePartitionInput)
  // getZonePartitionInput 은 안정적인 Zustand 액션 참조라 이 memo 는 마운트 시 1회만 실행(스냅샷).
  // 모달이 뷰포트를 막는 동안 모델/스테이지는 바뀌지 않으므로 1회 계산이 맞다.
  const partitionInput = useMemo(() => getPartitionInput(), [getPartitionInput])

  const [tab, setTab] = useState('zone')
  const [zoneConfig, setZoneConfig] = useState(() => defaultZoneConfig(mode))
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 1 })
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState(null)
  const [diagnosis, setDiagnosis] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [committed, setCommitted] = useState(false)
  const optimizerRan = useRef(false)

  const snapshotRef = useRef(null)
  useEffect(() => {
    const s = useEditStore.getState()
    snapshotRef.current = { hoistMode: s.hoistMode, hoistGroupCount: s.hoistGroupCount, hoistGroups: s.hoistGroups, activeHoistGroupId: s.activeHoistGroupId }
  }, [])

  const restore = () => { if (snapshotRef.current) useEditStore.setState(snapshotRef.current) }
  const handleCancel = () => { if (!committed) restore(); onClose() }
  const previewCandidate = (c) => {
    if (!c) return false
    const r = applyGroups(toNodeGroups(c))
    if (!r?.ok) {
      setSelectedId(null)
      setError(r?.error ?? '후보 미리보기에 실패했습니다.')
      return false
    }
    setSelectedId(c.id)
    return true
  }

  const ingest = (r) => {
    setRunning(false)
    if (!r.ok) { setError(r.error); setCandidates([]); setDiagnosis(null); return }
    setError(null)
    setCandidates(r.candidates)
    setDiagnosis(r.diagnosis ?? null)
    const first = r.candidates[0]
    if (first) previewCandidate(first)
    else setSelectedId(null)
  }

  const runZone = async () => {
    setError(null); setCandidates([]); setSelectedId(null); setDiagnosis(null); restore()
    setRunning(true); setProgress({ done: 0, total: 1 })
    const r = await zoneSelect(zoneConfig, { onProgress: setProgress })
    ingest(r)
  }

  const runOptimizer = async () => {
    setError(null); setCandidates([]); setSelectedId(null); setDiagnosis(null); restore()
    setRunning(true); setProgress({ done: 0, total: 1 })
    const r = await autoSelect({ onProgress: setProgress })
    ingest(r)
  }

  useEffect(() => {
    if (tab === 'optimizer' && !optimizerRan.current) { optimizerRan.current = true; runOptimizer() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handlePreview = (c) => { previewCandidate(c) }
  const handleApply = () => {
    const c = candidates.find(x => x.id === selectedId)
    if (!c) return
    const r = applyGroups(toNodeGroups(c))
    if (!r?.ok) { setError(r?.error ?? '권상 위치 적용에 실패했습니다.'); return }
    setCommitted(true); onClose()
  }

  const hasPass = candidates.some(c => c.overallStatus === 'pass')
  const selected = candidates.find(c => c.id === selectedId) ?? null
  const groupCount = zoneConfig.bands.reduce((n, b) => n + Math.max(1, b), 0)
  const zoneRunnable = !running && groupCount <= maxGroups

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(4,4,16,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(740px, 95vw)', maxHeight: '90vh', background: '#0b0b1e', border: '1px solid #25254a', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e1e38' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#90E8FF' }}>권상 위치 자동 선정</span>
          <button onClick={handleCancel} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#8aa0b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
          <Tab active={tab === 'zone'} onClick={() => setTab('zone')}>구역 지정</Tab>
          <Tab active={tab === 'optimizer'} onClick={() => setTab('optimizer')}>자동 최적화</Tab>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ marginBottom: 12, fontSize: 11.5, lineHeight: 1.45, color: '#8aa0b8' }}>
            {tab === 'optimizer'
              ? '엔진이 그룹 수를 순차 평가해 PASS 후보를 자동 랭킹합니다. 후보는 미리보기만 적용되며, 선택안 적용 전에는 확정되지 않습니다.'
              : '먼저 모델 평면을 구역으로 나눈 뒤 그 설계를 1회 검증합니다. 자동 최적화는 구역 지정 결과가 맞지 않을 때 별도로 실행하세요.'}
          </div>
          {tab === 'zone' && (
            <div style={{ marginBottom: 14 }}>
              <HoistZoneConfig value={zoneConfig} onChange={setZoneConfig} mode={mode} maxGroups={maxGroups} partitionInput={partitionInput} />
              <button onClick={runZone} disabled={!zoneRunnable} style={{
                marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
                padding: '9px 10px', borderRadius: 7,
                background: zoneRunnable ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18',
                border: `1px solid ${zoneRunnable ? '#2BD380' : '#2a2a4a'}`, color: zoneRunnable ? '#F0FFF4' : '#3a3a52',
                fontSize: 12, fontWeight: 800, cursor: zoneRunnable ? 'pointer' : 'not-allowed',
              }}>
                {running ? <Loader2 size={14} style={{ animation: 'hoistSpin 900ms linear infinite' }} /> : <Play size={14} fill={zoneRunnable ? '#F0FFF4' : 'none'} strokeWidth={2.5} />}
                {running ? '평가 중…' : '구역 지정안 평가'}
              </button>
            </div>
          )}

          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cad8e8', fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
              자세안정성 평가 중… {tab === 'optimizer' && progress.groupCount ? `(그룹수 ${progress.groupCount} · ${progress.done}/${progress.total})` : `(${progress.done}/${progress.total})`}
            </div>
          )}
          {!running && error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,102,119,0.10)', border: '1px solid rgba(255,102,119,0.5)', color: '#FF99A6', fontSize: 12.5, lineHeight: 1.5 }}>{error}</div>
          )}
          {!running && !error && !hasPass && candidates.length > 0 && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(255,196,71,0.10)', border: '1px solid rgba(255,196,71,0.5)', color: '#FFC447', fontSize: 12, lineHeight: 1.5 }}>
              {(() => {
                const reason = diagnosis?.reason ?? diagnosis?.Reason
                const suggestion = diagnosis?.suggestion ?? diagnosis?.Suggestion
                return diagnosis && (reason || suggestion) ? (
                  <>자세안정성 PASS 후보를 찾지 못했습니다. <b>{reason}</b>{suggestion ? <><br />권장: {suggestion}</> : null}</>
                ) : (
                  <>자세안정성 PASS 후보를 찾지 못했습니다. 아래는 차선 후보입니다 — {tab === 'zone' ? '분할 축·밴드·포인트 수' : '권상 방식·그룹 수'} 조정을 권장합니다.</>
                )
              })()}
            </div>
          )}

          {!running && !error && candidates.map((c, i) => {
            const st = styleFor(c.overallStatus)
            const active = c.id === selectedId
            return (
              <button key={c.id} onClick={() => handlePreview(c)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: active ? st.bg : '#0f0f22', border: `1px solid ${active ? st.border : '#2a2a4a'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <st.Icon size={15} color={st.color} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: st.color }}>#{i + 1} · {st.label}</span>
                  <span style={{ fontSize: 11, color: '#8aa0b8' }}>{c.groupCount}그룹 · 포인트 {c.groups.reduce((n, g) => n + g.nodeIds.length, 0)}개</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: '#9fb4cc' }}>
                  <span>Stage6 여유 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.stage6MarginMm, 'mm')}</b></span>
                  <span>최소 슬링각 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.minSlingAngleDeg, '°')}</b></span>
                  <span>간섭 <b style={{ color: '#cfe6ff' }}>{c.metrics.wireConflictCount}</b></span>
                  <span>score <b style={{ color: '#cfe6ff' }}>{fmt(c.score)}</b></span>
                </div>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid #1e1e38' }}>
          <button onClick={handleCancel} style={{ padding: '8px 14px', borderRadius: 7, background: '#101024', border: '1px solid #2a2a4a', color: '#cad8e8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
          <button onClick={handleApply} disabled={!selected} style={{ padding: '8px 16px', borderRadius: 7, background: selected ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18', border: `1px solid ${selected ? '#2BD380' : '#2a2a4a'}`, color: selected ? '#F0FFF4' : '#3a3a52', fontSize: 12, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed' }}>선택안 적용</button>
        </div>
      </div>
    </div>
  )
}

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', borderRadius: '7px 7px 0 0', fontSize: 12, fontWeight: 800,
      background: active ? '#0f0f22' : 'transparent',
      color: active ? '#90E8FF' : '#6a7a92',
      border: `1px solid ${active ? '#25254a' : 'transparent'}`, borderBottom: 'none', cursor: 'pointer',
    }}>{children}</button>
  )
}
