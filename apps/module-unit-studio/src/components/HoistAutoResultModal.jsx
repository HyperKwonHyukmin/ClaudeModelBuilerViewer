import { useEffect, useRef, useState, useMemo } from 'react'
import { Loader2, X, CheckCircle2, AlertTriangle, XCircle, Play, Info, ChevronDown, ChevronRight } from 'lucide-react'
import { useEditStore, getHoistMaxGroups } from '../store/useEditStore.js'
import { toNodeGroups } from '../data/hoistCandidateRank.js'
import { explainCandidate, rankingCriteria } from '../data/hoistCandidateExplain.js'
import { countActiveZones } from '../data/hoistZonePartition.js'
import HoistZoneConfig from './HoistZoneConfig.jsx'
import HoistCandidateThumbnail from './HoistCandidateThumbnail.jsx'

const sortKey = { score: c => c.score ?? 0, span: c => c.metrics?.supportSpanFraction ?? 0, area: c => c.footprint?.areaMm2 ?? 0, square: c => c.footprint?.minSquareness ?? 0 }
const statusOrder = (s) => (s === 'pass' ? 0 : s === 'warn' ? 1 : 2)
const fmtArea = (m2) => (m2 == null ? '–' : `${m2.toFixed(2)}㎡`)

const STATUS_STYLE = {
  pass: { color: '#37E08A', bg: 'rgba(55,224,138,0.12)', border: 'rgba(55,224,138,0.5)', Icon: CheckCircle2, label: 'PASS' },
  warn: { color: '#FFC447', bg: 'rgba(255,196,71,0.12)', border: 'rgba(255,196,71,0.5)', Icon: AlertTriangle, label: 'WARN' },
  fail: { color: '#FF6677', bg: 'rgba(255,102,119,0.12)', border: 'rgba(255,102,119,0.5)', Icon: XCircle, label: 'FAIL' },
}
const styleFor = (s) => STATUS_STYLE[s] ?? STATUS_STYLE.fail
const fmt = (v, unit = '') => (v == null ? '–' : `${Math.round(v)}${unit}`)

// 4점 형상은 구역별(shapePerZone[행][열], 기본 'quad')로 지정한다(전역 shape 제거, 사용자 규칙 2026-07-03).
// 천장 Crane 기본 점 수 = 4점 (사용자 지시 2026-07-31). 3·4점 모두 선택 가능하지만 기본은 4점.
const defaultZoneConfig = (mode) => mode === 'ceiling'
  ? { bandAxis: 'y', bands: [1], pointsPerZone: [[4]], shapePerZone: [['quad']], includePipe: false, cogAnchor: true }
  : { bandAxis: 'y', bands: [1, 1], pointsPerZone: [[2], [2]], shapePerZone: [['quad'], ['quad']], includePipe: false, cogAnchor: true }

export default function HoistAutoResultModal({ onClose }) {
  const mode = useEditStore(s => s.hoistMode)
  const zoneSelect = useEditStore(s => s.zoneSelectHoistPositions)
  const autoSelect = useEditStore(s => s.autoSelectHoistPositions)
  const applyGroups = useEditStore(s => s.applyAutoHoistGroups)
  const exportPosture = useEditStore(s => s.exportPostureStabilityToFile)
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
  const [searchTrace, setSearchTrace] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [committed, setCommitted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [passOnly, setPassOnly] = useState(false)
  const [hideNarrow, setHideNarrow] = useState(false)
  // 기본 정렬 = 추천 점수(엔진 score) — 지지폭·면적·반듯함(축평행 직사각형/긴 축평행 직선)·축정렬 합산.
  const [sortBy, setSortBy] = useState('score')
  // '추천 기준' 안내 펼침 + 후보별 '왜 이 위치?' 상세 펼침(후보 id 집합).
  const [showCriteria, setShowCriteria] = useState(false)
  const [openExplainIds, setOpenExplainIds] = useState(() => new Set())
  const toggleExplain = (id) => setOpenExplainIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const optimizerRan = useRef(false)
  // 진행 중 평가 식별 토큰 — 취소/재실행/언마운트 시 늦게 도착한 결과가 전역 권상 그룹을 덮어쓰지 않게 한다.
  const runToken = useRef(0)
  const mountedRef = useRef(true)
  // ⚠️ StrictMode(dev) 는 mount 시 effect 를 setup→cleanup→setup 으로 이중 실행한다.
  //    setup 에서 반드시 true 로 복구해야, cleanup 이 false 로 만든 뒤에도 최종 상태가 true 로 남는다.
  //    (setup 이 복구하지 않으면 mount 직후 false 로 고정 → ingest 가드가 항상 걸려 결과가 버려지고
  //     '평가 중' 스피너가 영구 정지한다. 프로덕션 빌드는 이중 실행이 없어 영향 없음.)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const modelBBox = partitionInput?.bbox ?? null

  const snapshotRef = useRef(null)
  useEffect(() => {
    const s = useEditStore.getState()
    snapshotRef.current = { hoistMode: s.hoistMode, hoistGroupCount: s.hoistGroupCount, hoistGroups: s.hoistGroups, activeHoistGroupId: s.activeHoistGroupId }
  }, [])

  const restore = () => { if (snapshotRef.current) useEditStore.setState(snapshotRef.current) }
  const handleCancel = () => { if (confirming) return; runToken.current++; if (!committed) restore(); onClose() }
  // hover 미리보기 — 3D 뷰에만 반영하고 선택(selectedId)은 바꾸지 않는다.
  const showInScene = (c) => { if (c) applyGroups(toNodeGroups(c)) }
  // 행에서 마우스가 벗어나면 현재 선택 후보(없으면 원본)로 되돌린다.
  const revertToSelected = () => {
    const sel = candidates.find(x => x.id === selectedId)
    if (sel) showInScene(sel); else restore()
  }
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

  const ingest = (r, token) => {
    // 취소/재실행/언마운트로 무효화된 결과는 버린다(전역 그룹 오염·스피너 오작동 방지).
    if (token !== runToken.current || !mountedRef.current) return
    setRunning(false)
    if (!r.ok) { setError(r.error); setCandidates([]); setDiagnosis(null); setSearchTrace(null); return }
    setError(null)
    setCandidates(r.candidates)
    setDiagnosis(r.diagnosis ?? null)
    setSearchTrace(r.searchTrace ?? null)
    const first = r.candidates[0]
    if (first) previewCandidate(first)
    else setSelectedId(null)
  }

  const runZone = async () => {
    const token = ++runToken.current
    setError(null); setCandidates([]); setSelectedId(null); setDiagnosis(null); setSearchTrace(null); restore()
    setRunning(true); setProgress({ done: 0, total: 1 })
    try {
      const r = await zoneSelect(zoneConfig, { onProgress: (p) => { if (token === runToken.current && mountedRef.current) setProgress(p) } })
      ingest(r, token)
    } catch (e) {
      if (token !== runToken.current || !mountedRef.current) return
      setRunning(false); setCandidates([]); setDiagnosis(null); setSearchTrace(null)
      setError(`구역 지정안 평가 실패: ${e?.message ?? String(e)}`)
    }
  }

  const runOptimizer = async () => {
    const token = ++runToken.current
    setError(null); setCandidates([]); setSelectedId(null); setDiagnosis(null); setSearchTrace(null); restore()
    setRunning(true); setProgress({ done: 0, total: 1 })
    try {
      const r = await autoSelect({ onProgress: (p) => { if (token === runToken.current && mountedRef.current) setProgress(p) } })
      ingest(r, token)
    } catch (e) {
      if (token !== runToken.current || !mountedRef.current) return
      setRunning(false); setCandidates([]); setDiagnosis(null); setSearchTrace(null)
      setError(`완전 자동 평가 실패: ${e?.message ?? String(e)}`)
    }
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
  // 확정 · 저장 — 추천 후보를 적용한 뒤 STEP4 와 동일한 정식 저장/자세안정성 경로를 바로 이어 실행한다.
  // (모달 최적화와 STEP4 는 같은 ModuleAnalysis.Cli 엔진이라 PASS 판정은 중복이지만, 이 저장이
  //  최종 _posture.json + stabilityPath + 단계별 리포트(결과 패널·후속 구조해석 입력)를 생성한다.)
  const handleConfirmAndSave = async () => {
    const c = candidates.find(x => x.id === selectedId)
    if (!c) return
    const ar = applyGroups(toNodeGroups(c))
    if (!ar?.ok) { setError(ar?.error ?? '권상 위치 적용에 실패했습니다.'); return }
    setCommitted(true)
    setConfirming(true)
    // 실패해도 후보 적용까지는 성공한 상태 — 스냅샷 복원 없이 유지하고 STEP 4 수동 재실행을 안내한다.
    const FAIL_SUFFIX = ' (권상 위치는 적용된 상태입니다 — 패널 STEP 4에서 다시 실행하세요)'
    try {
      const r = await exportPosture()
      if (!r?.ok) { setError(`확정·저장 실패: ${r?.error ?? '알 수 없는 오류'}${FAIL_SUFFIX}`); return }
      if (r.stability && !r.stability.ok) {
        setError(`저장은 완료됐지만 해석 실행에 실패했습니다: ${r.stability.error ?? '알 수 없는 오류'}${FAIL_SUFFIX}`)
        return
      }
    } catch (e) {
      setError(`확정·저장 실패: ${e?.message ?? String(e)}${FAIL_SUFFIX}`); return
    } finally {
      setConfirming(false)
    }
    onClose()
  }

  const hasPass = candidates.some(c => c.overallStatus === 'pass')
  const selected = candidates.find(c => c.id === selectedId) ?? null
  // 0점(제외) 셀을 뺀 실제 권상 그룹 수 — 9구역(3×3) 중 일부만 활성화하는 흐름 지원.
  const groupCount = countActiveZones(zoneConfig.bands, zoneConfig.pointsPerZone)
  const zoneRunnable = !running && groupCount >= 1 && groupCount <= maxGroups

  // 화면에 보일 후보 — PASS만 필터 + 정렬(면적/점수/정사각형도). 상태(PASS>WARN>FAIL) 우선.
  const displayed = useMemo(() => {
    const key = sortKey[sortBy] ?? sortKey.span
    let list = passOnly ? candidates.filter(c => c.overallStatus === 'pass') : candidates.slice()
    if (hideNarrow) list = list.filter(c => !c.metrics?.supportSpanNarrow && !c.metrics?.groupSpanNarrow)
    list.sort((a, b) => statusOrder(a.overallStatus) - statusOrder(b.overallStatus) || (key(b) - key(a)))
    return list
  }, [candidates, passOnly, hideNarrow, sortBy])

  return (
    // 좌측 도킹 + 클릭-통과 배경: 모달이 뷰포트를 가리지 않아 후보를 3D 로 미리 보며 비교할 수 있다.
    // (배경 pointerEvents:none → 오른쪽 3D 뷰를 그대로 회전/확대 가능, 패널만 auto)
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none', display: 'flex', alignItems: 'stretch', justifyContent: 'flex-start' }}>
      <div style={{ pointerEvents: 'auto', width: 'min(520px, 96vw)', margin: 12, maxHeight: 'calc(100vh - 24px)', background: 'rgba(11,11,30,0.97)', border: '1px solid #25254a', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e1e38' }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: '#90E8FF' }}>권상 위치 추천 — 자세안정성 기반</span>
          <button onClick={handleCancel} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: '#8aa0b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
          <Tab active={tab === 'zone'} onClick={() => setTab('zone')}>구역 지정 · 권장</Tab>
          <Tab active={tab === 'optimizer'} onClick={() => setTab('optimizer')}>완전 자동</Tab>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ marginBottom: 12, fontSize: 11.5, lineHeight: 1.45, color: '#8aa0b8' }}>
            {tab === 'optimizer'
              ? '완전 자동 — 엔진이 그룹 수까지 스스로 스윕해 PASS 후보를 랭킹합니다. 구역을 직접 나누기 어려울 때만 가끔 사용하세요. 후보는 미리보기이며 확정 전까지 반영되지 않습니다.'
              : '주 사용 흐름 — 모델 평면을 구역으로 나누고 구역별 포인트 수를 지정하면, 자세안정성 PASS 위치를 찾아 추천합니다. 후보는 미리보기이며 확정 전까지 반영되지 않습니다.'}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#cad8e8', fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: 'hoistSpin 900ms linear infinite' }} />
                자세안정성 평가 중… {tab === 'optimizer' && progress.groupCount ? `(그룹수 ${progress.groupCount} · ${progress.done}/${progress.total})` : `(${progress.done}/${progress.total})`}
              </div>
              {/* 시각적 진행바 — AnalyzePanel ProgressLine 과 동일 톤. 최대 300초 자동최적화 진행률을 백분율로. */}
              <ProgressBar done={progress.done} total={progress.total} />
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

          {/* 구역 형상 불가 안내 — #1 이 찌그러진 4점을 보여주는 구역을 결과 최상단에 명확히 알린다 */}
          {!running && !error && searchTrace && (
            <QuadInfeasibleWarnings
              zones={Array.isArray(g(searchTrace, 'zones')) ? g(searchTrace, 'zones') : []}
              bandAxis={tab === 'zone' ? zoneConfig.bandAxis : undefined}
              prominent
            />
          )}

          {!running && !error && searchTrace && (
            <TracePanel trace={searchTrace} hasPass={hasPass} bandAxis={tab === 'zone' ? zoneConfig.bandAxis : undefined} />
          )}

          {!running && !error && candidates.length > 0 && (
            <>
              <div style={{ marginBottom: 8, fontSize: 11, color: '#7fd7ff', lineHeight: 1.45 }}>
                💡 카드에 마우스를 올리면 3D 뷰에 권상 위치가 <b>미리 표시</b>됩니다(패널 밖 3D 뷰는 그대로 회전·확대 가능). 클릭=선택, 벗어나면 선택 후보로 복원. 왼쪽 미니 도형은 평면도(↑X ←Y — 3D 평면 뷰 'A'와 동일 방향)입니다.
              </div>

              {/* 추천 기준 안내 — 왜 이런 형태를 우선하는지 한 번에 설명(펼침) */}
              <div style={{ marginBottom: 10, borderRadius: 8, background: '#0f0f22', border: '1px solid #2a2a4a', overflow: 'hidden' }}>
                <button onClick={() => setShowCriteria(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: '#90E8FF', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}>
                  <Info size={13} />
                  추천 기준 — 왜 이런 형태를 우선하나?
                  {showCriteria ? <ChevronDown size={14} style={{ marginLeft: 'auto' }} /> : <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
                </button>
                {showCriteria && (
                  <ul style={{ margin: 0, padding: '0 12px 10px 26px', fontSize: 11, color: '#9fb4cc', lineHeight: 1.55 }}>
                    {rankingCriteria().map((line, i) => <li key={i} style={{ marginBottom: 3 }}>{line}</li>)}
                  </ul>
                )}
              </div>

              {/* 툴바 — PASS만 필터 + 정렬 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#cad8e8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={passOnly} onChange={e => setPassOnly(e.target.checked)} style={{ accentColor: '#37E08A', cursor: 'pointer' }} />
                  PASS만
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#cad8e8', cursor: 'pointer' }} title="지지폭이 모델 대비 좁거나(50% 미만) 어느 그룹이 구역 대비 좁은(점 같은 직선 등) 후보를 숨깁니다.">
                  <input type="checkbox" checked={hideNarrow} onChange={e => setHideNarrow(e.target.checked)} style={{ accentColor: '#FF8A3D', cursor: 'pointer' }} />
                  좁음 제외
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#8aa0b8' }}>
                  정렬
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ background: '#0f0f22', color: '#cad8e8', border: '1px solid #2a2a4a', borderRadius: 6, padding: '3px 6px', fontSize: 11.5, cursor: 'pointer' }}>
                    <option value="score">추천 점수 순</option>
                    <option value="span">권상폭 넓은 순</option>
                    <option value="area">면적 큰 순</option>
                    <option value="square">정사각형도</option>
                  </select>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6a7a92' }}>{displayed.length}개 표시</span>
              </div>
            </>
          )}

          {!running && !error && candidates.length > 0 && displayed.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: '#8aa0b8' }}>PASS 후보가 없습니다. ‘PASS만’ 해제하고 차선 후보를 확인하세요.</div>
          )}

          {!running && !error && (
          <div onMouseLeave={revertToSelected}>
          {displayed.map((c, i) => {
            const st = styleFor(c.overallStatus)
            const active = c.id === selectedId
            const fp = c.footprint ?? {}
            // 추천(엔진 score) 순위 기준으로 설명 — 표시 정렬(면적/폭 등)과 무관하게 '왜 추천 순위가 이런가'를 설명.
            const recIndex = candidates.findIndex(x => x.id === c.id)
            const ex = explainCandidate(c, candidates, recIndex < 0 ? i : recIndex)
            const reasonLine = ex.comparison ?? ex.strengths[0] ?? null
            const open = openExplainIds.has(c.id)
            return (
              <div key={c.id} style={{ marginBottom: 8 }}>
              <button onClick={() => handlePreview(c)} onMouseEnter={() => showInScene(c)} style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: open ? '8px 8px 0 0' : 8, cursor: 'pointer', background: active ? st.bg : '#0f0f22', border: `1px solid ${active ? st.border : '#2a2a4a'}`, boxShadow: active ? `0 0 0 1px ${st.border}` : 'none' }}>
                <HoistCandidateThumbnail candidate={c} bbox={modelBBox} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <st.Icon size={15} color={st.color} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: st.color }}>#{i + 1} · {st.label}</span>
                    <span style={{ fontSize: 11, color: '#8aa0b8' }}>{c.groupCount}그룹 · 포인트 {c.groups.reduce((n, g) => n + g.nodeIds.length, 0)}개</span>
                  </div>
                  {/* 형상 지표 배지 — 면적/정사각형도/대변비(마주보는 변 길이 비율)/축정렬(직선 포함)/선길이 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <Badge label="면적" value={fmtArea(fp.areaM2)} accent="#7fd7ff" strong />
                    <Badge label="권상폭" value={c.metrics.supportSpanFraction != null ? `${Math.round(c.metrics.supportSpanFraction * 100)}%` : '–'} accent={(c.metrics.supportSpanNarrow || c.metrics.groupSpanNarrow) ? '#FF8A3D' : '#37E08A'} strong />
                    {fp.maxLineLenMm > 0 && (
                      <Badge label="선길이" value={`${(fp.maxLineLenMm / 1000).toFixed(1)}m`} accent="#7fd7ff" />
                    )}
                    <Badge label="정사각형" value={fp.minSquareness != null ? fp.minSquareness.toFixed(2) : '–'} accent={(fp.minSquareness ?? 0) >= 0.55 ? '#37E08A' : '#FFC447'} />
                    {fp.minSideEquality != null && (
                      <Badge label="대변비" value={fp.minSideEquality.toFixed(2)} accent={fp.minSideEquality >= 0.85 ? '#37E08A' : '#FFC447'} />
                    )}
                    <Badge label="축정렬" value={fp.maxAxisDevDeg != null ? `${Math.round(fp.maxAxisDevDeg)}°` : '–'} accent={(fp.maxAxisDevDeg ?? 99) <= 20 ? '#37E08A' : '#FFC447'} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10.5, color: '#9fb4cc' }}>
                    <span>여유 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.stage6MarginMm, 'mm')}</b></span>
                    <span>슬링각 <b style={{ color: '#cfe6ff' }}>{fmt(c.metrics.minSlingAngleDeg, '°')}</b></span>
                    <span>간섭 <b style={{ color: '#cfe6ff' }}>{c.metrics.wireConflictCount}</b></span>
                    <span>score <b style={{ color: '#cfe6ff' }}>{fmt(c.score)}</b></span>
                  </div>
                  {/* 추천 이유 한 줄 — 다른 형태 대비 왜 이 순위인지 즉시 보여준다. */}
                  {reasonLine && (
                    <div style={{ marginTop: 6, fontSize: 10.5, color: '#9fd8c4', lineHeight: 1.45 }}>💬 {reasonLine}</div>
                  )}
                </div>
              </button>
              {/* 왜 이 위치? — 채택 근거/감점·주의/형태 비교 상세(펼침). 카드(button) 밖에 두어 버튼 중첩 방지. */}
              <button onClick={() => toggleExplain(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '6px 12px', background: '#0c0c1c', border: '1px solid #2a2a4a', borderTop: 'none', borderRadius: open ? 0 : '0 0 8px 8px', color: '#8aa0b8', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                왜 이 위치인가? {open ? '접기' : '자세히'}
              </button>
              {open && <ExplanationDetail ex={ex} />}
              </div>
            )
          })}
          </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid #1e1e38' }}>
          <button onClick={handleCancel} disabled={confirming} style={{ padding: '8px 14px', borderRadius: 7, background: '#101024', border: '1px solid #2a2a4a', color: confirming ? '#5a6a82' : '#cad8e8', fontSize: 12, fontWeight: 700, cursor: confirming ? 'not-allowed' : 'pointer' }}>취소</button>
          {/* 적용만 — 노드만 채우고 닫기(이후 3D에서 수동 미세조정·STEP 4 직접 실행용) */}
          <button onClick={handleApply} disabled={!selected || confirming}
            title="권상 위치만 적용하고 닫습니다. 이후 3D에서 미세조정하거나 STEP 4에서 평가를 실행하세요."
            style={{ padding: '8px 14px', borderRadius: 7, background: '#101024', border: `1px solid ${selected && !confirming ? '#00D1FF66' : '#2a2a4a'}`, color: selected && !confirming ? '#90E8FF' : '#3a3a52', fontSize: 12, fontWeight: 700, cursor: selected && !confirming ? 'pointer' : 'not-allowed' }}>적용만</button>
          {/* 확정·평가 저장 — 주 CTA: 적용 → 정식 _posture 저장 → 해석 실행 → 결과 패널 */}
          <button onClick={handleConfirmAndSave} disabled={!selected || confirming}
            title="선택한 위치를 적용하고, 자세안정성 평가를 정식으로 저장·실행해 결과 패널을 엽니다."
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7, background: selected && !confirming ? 'linear-gradient(180deg, #1FA86A, #178A55)' : '#0a0a18', border: `1px solid ${selected && !confirming ? '#2BD380' : '#2a2a4a'}`, color: selected && !confirming ? '#F0FFF4' : '#3a3a52', fontSize: 12, fontWeight: 800, cursor: selected && !confirming ? 'pointer' : 'not-allowed' }}>
            {confirming && <Loader2 size={13} style={{ animation: 'hoistSpin 900ms linear infinite' }} />}
            {confirming ? '확정 · 평가 저장 중…' : '확정 · 평가 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 후보 '왜 이 위치?' 상세 — 채택 근거(강점)/감점·주의(약점)/형태 비교를 색으로 구분해 보여준다.
function ExplanationDetail({ ex }) {
  const row = { display: 'flex', gap: 6, fontSize: 10.5, lineHeight: 1.5, marginBottom: 4 }
  return (
    <div style={{ padding: '8px 12px 10px', background: '#0c0c1c', border: '1px solid #2a2a4a', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
      <div style={{ fontSize: 10.5, color: '#8aa0b8', marginBottom: 6 }}>{ex.headline}</div>
      {ex.strengths.length > 0 && (
        <div style={{ marginBottom: ex.cautions.length > 0 || ex.comparison ? 6 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#37E08A', marginBottom: 3 }}>채택 근거</div>
          {ex.strengths.map((s, i) => (
            <div key={i} style={{ ...row, color: '#a7d8c2' }}><span style={{ color: '#37E08A' }}>✓</span><span>{s}</span></div>
          ))}
        </div>
      )}
      {ex.cautions.length > 0 && (
        <div style={{ marginBottom: ex.comparison ? 6 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#FFC447', marginBottom: 3 }}>감점 · 주의</div>
          {ex.cautions.map((s, i) => (
            <div key={i} style={{ ...row, color: '#d8c9a0' }}><span style={{ color: '#FFC447' }}>!</span><span>{s}</span></div>
          ))}
        </div>
      )}
      {ex.comparison && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#7fd7ff', marginBottom: 3 }}>다른 형태 대비</div>
          <div style={{ ...row, color: '#a8c6dd', marginBottom: 0 }}><span style={{ color: '#7fd7ff' }}>▸</span><span>{ex.comparison}</span></div>
        </div>
      )}
    </div>
  )
}

// 자동 최적화 진행바 — done/total 백분율. total<=0 이면 0%. 스피너+텍스트와 함께 시각적 진행을 보강한다.
function ProgressBar({ done, total }) {
  const t = Number(total) > 0 ? Number(total) : 0
  const d = Math.max(0, Math.min(t, Number(done) || 0))
  const pct = t > 0 ? (d / t) * 100 : 0
  return (
    <div style={{
      position: 'relative', width: '100%', height: 6,
      background: 'rgba(255,255,255,0.06)', borderRadius: 6,
      overflow: 'hidden', border: '1px solid #2a2a4a',
    }}>
      <div style={{
        position: 'absolute', inset: 0, width: `${pct}%`,
        background: 'linear-gradient(90deg, #00d1ff 0%, #37E08A 100%)',
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function Badge({ label, value, accent = '#9fb4cc', strong = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '2px 7px', borderRadius: 5,
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent}55`,
      fontSize: strong ? 11.5 : 10.5, color: '#8aa0b8', whiteSpace: 'nowrap',
    }}>
      {label}<b style={{ color: accent, fontWeight: strong ? 900 : 800 }}>{value}</b>
    </span>
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

// searchTrace / zone 객체는 엔진 직렬화에 따라 camelCase 또는 PascalCase 로 도착한다 — 둘 다 읽는다.
const g = (o, k) => o?.[k] ?? o?.[k[0].toUpperCase() + k.slice(1)]
// 숫자 방어: 유한수만 통과, 그 외엔 0. 화면 표기는 천단위 구분자로.
const tnum = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : 0
const tint = (v) => tnum(v).toLocaleString()
// 단계 번호 → 라벨. 미지정 단계는 `{n}단계` 로 폴백한다.
const STAGE_LABELS = { 1: '입력/형상', 2: '형상 유효성', 3: '정점', 6: '전도' }
const traceTdStyle = { padding: '3px 6px', borderBottom: '1px solid #1c1c34', whiteSpace: 'nowrap' }

// regionId("zone-<band>-<sub>") → 미니맵과 동일한 구역 라벨("2열·1"). 해석 불가 시 "구역 N" 폴백.
function zoneLabel(z, bandAxis) {
  const rid = g(z, 'regionId')
  const m = typeof rid === 'string' ? rid.match(/^zone-(\d+)-(\d+)$/) : null
  if (m) {
    const unit = bandAxis === 'y' ? '행' : '열'
    return `${Number(m[1]) + 1}${unit}·${Number(m[2]) + 1}`
  }
  return `구역 ${g(z, 'groupId') ?? '?'}`
}

// #1(best) 후보가 어느 구역에서 '반듯한(대변비·축정렬 허용 내) 4점 사각형'을 만들지 못한 경우의 경고 목록.
// quadFeasible===false 는 "이 구역은 반듯한 사각형이 불가능해 현재 찌그러진 형태로 제안했다"는 뜻(엔진이
// #1 이 실제 보여주는 형상 기준으로 판정). 지표(대변비·축정렬)는 #1 이 지금 보여주는 그 형태의 값이다.
// prominent=true 면 결과 최상단에 눈에 띄게(제목·굵은 테두리) 띄운다.
function QuadInfeasibleWarnings({ zones, bandAxis, prominent = false }) {
  const bad = zones.filter(z => g(z, 'quadFeasible') === false)
  if (bad.length === 0) return null
  const box = prominent
    ? { marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,138,61,0.12)', border: '1.5px solid rgba(255,138,61,0.6)', fontSize: 11.5, color: '#FFB57A', lineHeight: 1.6 }
    : { marginTop: 8, padding: '8px 10px', borderRadius: 7, background: 'rgba(255,196,71,0.10)', border: '1px solid rgba(255,196,71,0.5)', fontSize: 11, color: '#FFC447', lineHeight: 1.55 }
  return (
    <div style={box}>
      {prominent && (
        <div style={{ fontWeight: 800, marginBottom: 5 }}>⚠ 일부 구역은 반듯한 4점 사각형을 만들 수 없습니다</div>
      )}
      {bad.map((z, i) => {
        const eq = g(z, 'quadBestSideEquality')
        const dev = g(z, 'quadBestAxisDevDeg')
        const detail = (eq != null && dev != null) ? ` — 제안 형태 대변비 ${Number(eq).toFixed(2)}·축정렬 ${Math.round(Number(dev))}° (기준 ≥0.85·≤20°)` : ''
        return (
          <div key={i} style={{ marginBottom: i < bad.length - 1 ? 4 : 0 }}>
            {prominent ? '• ' : '⚠ '}<b>{zoneLabel(z, bandAxis)}</b>: 이 구역은 반듯한 4점 사각형을 만들 수 없어 <b>현재 형태로 제안</b>합니다{detail}.
            구역 경계를 조정하거나 포인트 수를 <b>자동</b>(또는 2·3점)으로 바꾸면 개선될 수 있습니다.
          </div>
        )
      })}
    </div>
  )
}

/**
 * 엔진 hoist 옵티마이저의 searchTrace 를 렌더한다.
 *  - PASS 후보가 있으면(hasPass) 한 줄 요약 + 구역 형상 불가 경고.
 *  - 없으면 전역 통계 + 구역별 표 + 단계별 FAIL + note 를 펼쳐 원인 파악을 돕는다.
 * 모든 필드는 결측 가능하므로 방어적으로 읽는다(throw 금지).
 */
function TracePanel({ trace, hasPass, bandAxis }) {
  if (!trace) return null

  const threads = tnum(g(trace, 'threadsUsed'))
  const elapsed = tnum(g(trace, 'elapsedMs'))
  const scanned = tnum(g(trace, 'totalCombosScanned'))
  const assembled = tnum(g(trace, 'layoutsAssembled'))
  const bracketed = tnum(g(trace, 'layoutsBracketed'))
  const evaluated = tnum(g(trace, 'layoutsEvaluated'))
  const passCount = tnum(g(trace, 'passCount'))
  const warnCount = tnum(g(trace, 'warnCount'))
  const failCount = tnum(g(trace, 'failCount'))
  const note = g(trace, 'note')
  const zones = Array.isArray(g(trace, 'zones')) ? g(trace, 'zones') : []
  const hist = g(trace, 'stageFailHistogram')
  const histEntries = (hist && typeof hist === 'object')
    ? Object.entries(hist).filter(([, c]) => tnum(c) > 0)
    : []

  const wrap = { marginBottom: 12, padding: 12, borderRadius: 8, background: '#0f0f22', border: '1px solid #2a2a4a' }
  const title = { fontSize: 11.5, fontWeight: 800, color: '#90E8FF', marginBottom: 8 }

  if (hasPass) {
    return (
      <div style={wrap}>
        <div style={title}>탐색 리포트</div>
        <div style={{ fontSize: 11.5, color: '#9fb4cc', lineHeight: 1.5 }}>
          총 <b style={{ color: '#cfe6ff' }}>{tint(scanned)}</b>개 조합을 {threads}스레드로 평가 · {tint(elapsed)}ms · PASS <b style={{ color: '#37E08A' }}>{tint(passCount)}</b>개
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={title}>탐색 리포트</div>
      <div style={{ fontSize: 11.5, color: '#9fb4cc', lineHeight: 1.6, marginBottom: zones.length > 0 || histEntries.length > 0 || note ? 8 : 0 }}>
        조합 {tint(scanned)} · 조립 {tint(assembled)} · 브래킷 {tint(bracketed)} · 평가 {tint(evaluated)}
        {' · '}
        PASS <b style={{ color: '#37E08A' }}>{tint(passCount)}</b> / WARN <b style={{ color: '#FFC447' }}>{tint(warnCount)}</b> / FAIL <b style={{ color: '#FF6677' }}>{tint(failCount)}</b>
        {' · '}{threads}스레드 · {tint(elapsed)}ms
      </div>

      {zones.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: histEntries.length > 0 || note ? 8 : 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, color: '#9fb4cc' }}>
            <thead>
              <tr style={{ color: '#7a8ba3' }}>
                {['구역', '노드수', '요청점', 'Z레벨', '스캔', '유효형상', '채택', '비고'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '3px 6px', borderBottom: '1px solid #2a2a4a', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((z, i) => {
                const zNote = g(z, 'note')
                const req = tnum(g(z, 'requestedPoints'))
                return (
                  <tr key={g(z, 'groupId') ?? i}>
                    <td style={traceTdStyle}>{zoneLabel(z, bandAxis)}</td>
                    <td style={traceTdStyle}>{tint(g(z, 'allowedNodeCount'))}</td>
                    <td style={traceTdStyle}>{req === -1 ? '자동' : tint(req)}</td>
                    <td style={traceTdStyle}>{tint(g(z, 'zLevels'))}</td>
                    <td style={traceTdStyle}>{tint(g(z, 'combosScanned'))}</td>
                    <td style={traceTdStyle}>{tint(g(z, 'shapeValidCount'))}</td>
                    <td style={traceTdStyle}>{tint(g(z, 'keptForAssembly'))}</td>
                    <td style={{ ...traceTdStyle, color: '#8aa0b8', whiteSpace: 'normal' }}>{zNote || '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {histEntries.length > 0 && (
        <div style={{ fontSize: 11, color: '#FF99A6', lineHeight: 1.5, marginBottom: note ? 6 : 0 }}>
          단계별 FAIL: {histEntries.map(([stage, count]) => {
            const n = Number(stage)
            const label = STAGE_LABELS[n]
            return label ? `${n}단계 ${label} ${tint(count)}` : `${n}단계 ${tint(count)}`
          }).join(' · ')}
        </div>
      )}

      {note && (
        <div style={{ fontSize: 11, color: '#8aa0b8', lineHeight: 1.5 }}>{note}</div>
      )}
    </div>
  )
}
