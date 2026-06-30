import { useEffect, useRef, useState } from 'react'
import { Loader2, X, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useEditStore } from '../store/useEditStore.js'
import { toNodeGroups } from '../data/hoistCandidateRank.js'

const STATUS_STYLE = {
  pass: { color: '#37E08A', bg: 'rgba(55,224,138,0.12)', border: 'rgba(55,224,138,0.5)', Icon: CheckCircle2, label: 'PASS' },
  warn: { color: '#FFC447', bg: 'rgba(255,196,71,0.12)', border: 'rgba(255,196,71,0.5)', Icon: AlertTriangle, label: 'WARN' },
  fail: { color: '#FF6677', bg: 'rgba(255,102,119,0.12)', border: 'rgba(255,102,119,0.5)', Icon: XCircle, label: 'FAIL' },
}
const styleFor = (s) => STATUS_STYLE[s] ?? STATUS_STYLE.fail
const fmt = (v, unit = '') => (v == null ? '–' : `${Math.round(v)}${unit}`)

export default function HoistAutoResultModal({ onClose }) {
  const autoSelect = useEditStore(s => s.autoSelectHoistPositions)
  const applyGroups = useEditStore(s => s.applyAutoHoistGroups)

  const [running, setRunning] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 1, groupCount: 0 })
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [committed, setCommitted] = useState(false)

  // 진입 시점 상태 스냅샷 — 미리보기는 실제 hoistGroups 를 변경하므로 취소 시 복원한다.
  const snapshotRef = useRef(null)
  useEffect(() => {
    const s = useEditStore.getState()
    snapshotRef.current = {
      hoistMode: s.hoistMode, hoistGroupCount: s.hoistGroupCount,
      hoistGroups: s.hoistGroups, activeHoistGroupId: s.activeHoistGroupId,
    }
  }, [])

  // 마운트 시 스윕 실행.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await autoSelect({ onProgress: (p) => { if (alive) setProgress(p) } })
      if (!alive) return
      setRunning(false)
      if (!r.ok) { setError(r.error); return }
      setCandidates(r.candidates)
      const first = r.candidates[0]
      if (first) { setSelectedId(first.id); applyGroups(toNodeGroups(first)) }  // 최고안 미리보기
    })()
    return () => { alive = false }
  }, [autoSelect, applyGroups])

  const restore = () => { if (snapshotRef.current) useEditStore.setState(snapshotRef.current) }
  const handleCancel = () => { if (!committed) restore(); onClose() }
  const handlePreview = (c) => { setSelectedId(c.id); applyGroups(toNodeGroups(c)) }
  const handleApply = () => {
    const c = candidates.find(x => x.id === selectedId)
    if (!c) return
    applyGroups(toNodeGroups(c))
    setCommitted(true)
    onClose()
  }

  const hasPass = candidates.some(c => c.overallStatus === 'pass')
  const selected = candidates.find(c => c.id === selectedId) ?? null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(4,4,16,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 'min(720px, 94vw)', maxHeight: '88vh', background: '#0b0b1e', border: '1px solid #25254a', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e1e38' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#90E8FF' }}>권상 위치 자동 선정 — 자세안정성 평가 결과</span>
          <button onClick={handleCancel} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#8aa0b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cad8e8', fontSize: 13 }}>
              <Loader2 size={16} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
              자세안정성 평가 중… (그룹수 {progress.groupCount} · {progress.done}/{progress.total})
            </div>
          )}

          {!running && error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,102,119,0.10)', border: '1px solid rgba(255,102,119,0.5)', color: '#FF99A6', fontSize: 12.5, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {!running && !error && !hasPass && candidates.length > 0 && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(255,196,71,0.10)', border: '1px solid rgba(255,196,71,0.5)', color: '#FFC447', fontSize: 12, lineHeight: 1.5 }}>
              자세안정성 PASS 후보를 찾지 못했습니다. 아래는 차선 후보입니다 — 권상 방식 또는 그룹 수 조정을 권장합니다.
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

        {/* 푸터 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid #1e1e38' }}>
          <button onClick={handleCancel} style={{ padding: '8px 14px', borderRadius: 7, background: '#101024', border: '1px solid #2a2a4a', color: '#cad8e8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>취소</button>
          <button onClick={handleApply} disabled={!selected} style={{ padding: '8px 16px', borderRadius: 7, background: selected ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18', border: `1px solid ${selected ? '#2BD380' : '#2a2a4a'}`, color: selected ? '#F0FFF4' : '#3a3a52', fontSize: 12, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed' }}>이 안 적용</button>
        </div>
      </div>
    </div>
  )
}
