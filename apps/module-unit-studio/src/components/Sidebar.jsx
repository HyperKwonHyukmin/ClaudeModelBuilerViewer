import { useRef, useState, useCallback } from 'react'
import { Droplet, FileJson, FolderOpen, RotateCcw } from 'lucide-react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore, computeMassFallback } from '../store/useEditStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { getHost } from '../host/host.js'
import Tooltip from './Tooltip.jsx'
import { collectPipeMaterialIds, isPipeFluidEmpty, PIPE_STEEL_RHO } from '../data/pipeFluid.js'
import RotateModelDialog from './RotateModelDialog.jsx'

const LAYER_DEFS = [
  { key: 'nodes',        label: 'Node',         color: '#E65F6A', desc: '모든 노드 점 표시. 배관 토글이 OFF 면 배관 전용 노드는 자동 숨김 (이 토글을 OFF→ON 하면 다시 모두 표시).' },
  { key: 'structure',    label: '구조',         color: '#7FB3D5', desc: 'Structure 카테고리 BEAM 표시 (보·형강 등 구조 부재).' },
  { key: 'pipe',         label: '배관',         color: '#D7A04A', desc: 'Pipe 카테고리 BEAM 표시. OFF 시 배관 전용 노드도 함께 숨겨집니다.' },
  { key: 'rigids',       label: 'RBE',          color: '#C77DFF', desc: 'RBE2 강체 연결 표시 (independent ↔ dependent 라인).' },
  { key: 'masses',       label: '질량',         color: '#E59AB3', desc: 'CONM2 집중질량 마커 (구슬 형태).' },
  { key: 'boundaries',   label: '경계조건',     color: '#5DD39E', desc: '경계조건 노드 (Boundary 태그) 다이아몬드 마커. 검증 단계에서 사용.' },
  { key: 'uboltMarkers', label: 'U-bolt 위치',  color: '#00E5FF', desc: 'U-bolt 위치 마커. 위치 검토 시에만 켜는 것을 권장.' },
  { key: 'uboltDof',     label: 'U-bolt DOF',   color: '#FFE066', desc: 'U-bolt DOF 라벨 오버레이. 자유도 검증 필요할 때만.' },
  { key: 'cog',          label: '무게중심',     color: '#FFD700', desc: '모델 전체 무게중심 (00_StageSummary.json 또는 _COG.json) 표시.' },
]

const MIN_WIDTH = 130
const MAX_WIDTH = 432
const DEFAULT_WIDTH = 301   // 좌측 패널 기본 폭 (228 → +20% → +10% ≈ 301)

export default function Sidebar() {
  const { loading, error, loadStages, loadSummary, stages, reset: resetStages } = useStageStore()
  const {
    layers, toggleLayer,
    reset: resetViewer,
  } = useViewerStore()

  const resetEdit = useEditStore(s => s.reset)
  const resetStability = useStabilityStore(s => s.reset)
  const resetUnitStructural = useUnitStructuralStore(s => s.reset)
  const clearRotateModelIntents = useEditStore(s => s.clearRotateModelIntents)
  // 실제 회전 상태(단일 진실) — '회전 초기화' 버튼 노출 및 표시 정합에 사용.
  const modelRotated = useStageStore(s => s.modelRotated)

  // Workbench(Electron) 호스트에서는 백엔드가 폴더를 자동 주입하므로
  // 사용자가 직접 파일/폴더를 여는 입력은 노출하지 않는다.
  const isHosted = getHost().name === 'electron'

  // Studio 가 처음 열린 상태로 완전히 복귀.
  // - 단계/뷰어/편집 의도 초기화 (기존)
  // - 자세안정성 평가 결과 초기화
  // - Unit 구조 해석 결과/입력값 초기화 → 실행 버튼 다시 활성, 결과 dock 숨김
  // - Workbench 호스트면 초기 폴더(=처음 부팅 시 백엔드가 주입한 모델)를 자동 재로드.
  //   Web 단독 모드는 getInitialFolder() 가 null 이라 비운 상태 유지.
  const handleReset = useCallback(() => {
    // 파괴적 동작 — 잃을 작업이 있으면 삭제 영향을 구체적으로 보여주고 확인받는다.
    // (Undo 가 없으므로 오클릭 1회로 편집·권상·해석 결과가 소실되는 것을 방지.)
    const edit = useEditStore.getState()
    const intentCount = edit.intents?.length ?? 0
    const hoistGroups = edit.hoistGroups ?? {}
    const hoistNodeCount = Object.values(hoistGroups)
      .reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
    const hoistGroupCount = Object.values(hoistGroups)
      .filter(arr => Array.isArray(arr) && arr.length > 0).length
    const stab = useStabilityStore.getState()
    const hasStability = !!stab.overallStatus || !!stab.report
    const struct = useUnitStructuralStore.getState()
    const hasStructural = struct.status === 'Success' || !!struct.result
    const hasLoaded = useStageStore.getState().stages.length > 0

    if (hasLoaded || intentCount > 0 || hoistNodeCount > 0 || hasStability || hasStructural) {
      const lines = ['전체 초기화하면 아래 작업 내용이 모두 삭제되고 되돌릴 수 없습니다.', '']
      if (intentCount > 0)     lines.push(`• 편집 의도 ${intentCount}건 (RBE·삭제·가서포트 등)`)
      if (hoistNodeCount > 0)  lines.push(`• 권상 위치 ${hoistGroupCount}개 그룹 · 노드 ${hoistNodeCount}개`)
      if (hasStability)        lines.push('• 자세안정성 평가 결과')
      if (hasStructural)       lines.push('• Unit 구조 해석 결과')
      lines.push('', '정말 초기화하시겠습니까?')
      if (!window.confirm(lines.join('\n'))) return
    }

    resetStages()
    resetViewer()
    resetEdit()
    resetStability()
    resetUnitStructural()

    ;(async () => {
      try {
        const initial = await getHost().getInitialFolder()
        if (!initial || initial.files.length === 0) return
        useStageStore.getState().setSourceFolderRef(initial.folderRef)
        useStageStore.getState().loadStages(initial.files)
      } catch (e) {
        console.error('[Sidebar] 초기화 후 자동 폴더 재로드 실패:', e)
      }
    })()
  }, [resetStages, resetViewer, resetEdit, resetStability, resetUnitStructural])

  const pipeFluidEmptied = useStageStore(s => s.pipeFluidEmptied)
  const [emptyResult, setEmptyResult] = useState(null) // { delta:number|null, count:number }
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  const [rotateResult, setRotateResult] = useState(null) // { axis, angleDeg, changedNodeCount, invalidatedStability }
  const [rotateReset, setRotateReset] = useState(null)   // { undoneCount, invalidatedStability } — '회전 초기화' 직후 안내

  // 누적 회전 전체 해제 — 역순 역회전으로 원좌표 복원 + modelRotated=false + rotateModel provenance 제거 +
  // 결과 무효화. (rotateModel intent 를 목록 X/Ctrl+Z 로 지워도 형상이 안 돌아오는 착시를 여기서만 해제.)
  const handleResetRotation = useCallback(() => {
    if (!useStageStore.getState().modelRotated) return
    const ok = window.confirm(
      '적용된 모델 회전을 모두 해제하고 원래 방향으로 되돌립니다.\n' +
      '형상이 바뀌므로 기존 자세안정성/구조해석 결과는 초기화됩니다. 계속할까요?'
    )
    if (!ok) return
    const r = useStageStore.getState().resetRotation()
    clearRotateModelIntents()
    setRotateResult(null)
    setRotateReset({ undoneCount: r.undoneCount, invalidatedStability: r.invalidatedStability })
  }, [clearRotateModelIntents])

  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null
  const pipeMaterialCount = lastStage ? collectPipeMaterialIds(lastStage).size : 0
  // 로드된 모델의 모든 배관 material 이 이미 순수 강재(7.85e-9)면 '유체 비움 완료' 로 인식.
  // (사용자가 직접 비운 pipeFluidEmptied 와 합쳐서 버튼을 완료 상태로 표시)
  const pipeFluidAlreadyEmpty = isPipeFluidEmpty(lastStage)
  const isEmptied = pipeFluidEmptied || pipeFluidAlreadyEmpty

  const handleTogglePipeFluid = useCallback(() => {
    const st = useStageStore.getState()
    const cur = st.stages
    if (!cur.length) return

    if (pipeFluidEmptied) {
      const ok = window.confirm(
        '배관(Pipe) 내부에 유체를 다시 채웁니다 (원래 밀도로 복원).\n' +
        '무게중심이 원래대로 복구되므로 기존 해석 결과는 초기화됩니다. 계속할까요?'
      )
      if (!ok) return
      st.restorePipeFluid()

      // editStore 에서 emptyPipeFluid 인텐트 제거
      const editState = useEditStore.getState()
      const targetIntent = editState.intents.find(i => i.kind === 'emptyPipeFluid')
      if (targetIntent) {
        editState.removeIntent(targetIntent.id)
      }
      setEmptyResult(null)
    } else {
      const ok = window.confirm(
        '모든 배관(Pipe) material 의 밀도를 7.85e-9 로 바꿔 내부 유체 중량을 제거합니다.\n' +
        '무게중심이 바뀌므로 기존 자세안정성 평가 결과는 초기화되고, 다시 평가해야 합니다.\n' +
        '계속할까요?'
      )
      if (!ok) return
      const last = cur[cur.length - 1]
      const before = computeMassFallback(last)?.totalMassTon ?? null
      const { materialIds, changedCount, invalidatedStability } = st.emptyPipeFluid()
      const after = computeMassFallback(last)?.totalMassTon ?? null
      useEditStore.getState().addIntent({
        kind: 'emptyPipeFluid',
        params: { materialIds, targetRho: PIPE_STEEL_RHO },
      })
      const delta = (before != null && after != null) ? (before - after) : null
      setEmptyResult({ delta, count: changedCount, invalidated: invalidatedStability })
    }
  }, [pipeFluidEmptied])

  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef(null)  // { startX, startWidth }

  const fileInputRef = useRef(null)

  const setSourceFolderRef = useStageStore(s => s.setSourceFolderRef)

  // 기존 데이터가 남아 있는 상태에서 새 파일/폴더 로딩을 시도하면 차단한다.
  // 사용자가 의도치 않게 다른 폴더 데이터와 섞이는 것을 방지 — 반드시 "초기화" 후 다시 시도.
  const guardLoad = () => {
    if (stages.length > 0) {
      window.alert(
        '이미 데이터가 로드되어 있습니다.\n' +
        '좌측 하단의 "초기화" 버튼을 눌러 먼저 비운 뒤 다시 시도해 주세요.'
      )
      return false
    }
    return true
  }

  const handleFolderOpen = async () => {
    if (!guardLoad()) return
    try {
      const r = await getHost().pickFolder()
      if (r.cancelled) return
      if (r.files.length > 0) {
        setSourceFolderRef(r.folderRef)
        loadStages(r.files)
      }
    } catch (err) {
      console.error('폴더 열기 실패:', err)
    }
  }

  const handleFileInput = (e) => {
    // 파일 picker 가 열린 사이에 다른 경로로 데이터가 들어왔을 가능성에 대한 마지막 안전장치
    if (stages.length > 0) {
      window.alert('이미 데이터가 로드되어 있습니다. 초기화 후 다시 시도해 주세요.')
      e.target.value = ''
      return
    }
    loadStages(Array.from(e.target.files))
    e.target.value = ''
  }

  // ── Resize drag handle ──────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((e) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: width }

    const onMouseMove = (ev) => {
      const delta = ev.clientX - dragRef.current.startX
      const next  = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + delta))
      setWidth(next)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [width])

  return (
    <div style={{
      width, flexShrink: 0, position: 'relative',
      background: '#0b0b1e',
      borderRight: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* hidden inputs — 단독 웹 모드에서만 의미가 있음 */}
      {!isHosted && (
        <input ref={fileInputRef} type="file" accept=".json" multiple style={{ display: 'none' }} onChange={handleFileInput} />
      )}

      {/* ── 섹션 1: 파일 ─────────────────────────────── */}
      {/* Workbench(Electron) 호스트에서는 백엔드가 초기 폴더를 주입하므로
          사용자가 직접 파일/폴더를 여는 입력은 노출하지 않는다.
          상태(로딩/에러/요약)가 없으면 섹션 헤더도 표시하지 않아 화면을 깔끔히 유지. */}
      {(!isHosted || loading || error || loadSummary.loaded > 0) && (
        <Section label="파일">
          {!isHosted && (
            <>
              <Tooltip placement="right" content={<><strong style={{ color: '#90E8FF' }}>JSON 파일 열기</strong><br/>여러 phase JSON 을 한 번에 선택해서 로드합니다. 폴더 단위로 한꺼번에 보려면 옆의 "폴더 열기" 를 사용하세요.</>}>
                <SideBtn onClick={() => { if (guardLoad()) fileInputRef.current?.click() }} disabled={loading} accent="#4a8cc4">
                  <FileJson size={14} /> 파일 열기
                </SideBtn>
              </Tooltip>
              <Tooltip placement="right" content={<><strong style={{ color: '#90E8FF' }}>폴더 열기</strong><br/>폴더 안의 모든 phase JSON / 00_StageSummary / _COG / 00_InputAudit 을 자동 인식해 로드합니다. 편집/평가 결과 파일도 같은 폴더에 저장됩니다.</>}>
                <SideBtn onClick={handleFolderOpen} disabled={loading} accent="#2e6a94">
                  <FolderOpen size={14} /> 폴더 열기
                </SideBtn>
              </Tooltip>
            </>
          )}
          {loading && <StatusText color="#7a8aaa">로딩 중…</StatusText>}
          {error   && <StatusText color="#FF5566">{error}</StatusText>}
          {loadSummary.loaded > 0 && (
            <StatusText color={loadSummary.failed > 0 ? '#FFAA55' : '#6ac58f'}>
              JSON {loadSummary.loaded}/{loadSummary.json}개 로드
              {loadSummary.failed > 0 ? `, 실패 ${loadSummary.failed}개` : ''}
              {loadSummary.skipped > 0 ? `, 제외 ${loadSummary.skipped}개` : ''}
            </StatusText>
          )}
        </Section>
      )}

      {/* "3D 단면" 토글은 뷰어 좌상단 뷰 툴바(ThreeViewport)로 옮겼다 —
          단면 형상을 보려던 사용자가 사이드바까지 시선을 옮길 필요 없이 뷰포트에서 바로 켜고 끈다. */}

      {/* ── 섹션 2: 레이어 ───────────────────────────── */}
      <Section label="레이어">
        {LAYER_DEFS.map(({ key, label, color, desc }) => {
          const on = layers[key] ?? true
          return (
            <Tooltip
              key={key}
              placement="right"
              maxWidth={300}
              content={
                <>
                  <strong style={{ color }}>{label} 레이어 {on ? '(ON)' : '(OFF)'}</strong><br/>
                  {desc}
                </>
              }>
              <button
                onClick={() => toggleLayer(key)}
                aria-label={on ? `${label} 숨기기` : `${label} 표시`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: on ? `${color}20` : '#0f0f22',
                  color: on ? '#f0f0f0' : '#9a9ad0',
                  border: `1px solid ${on ? color + 'aa' : '#2e2e50'}`,
                  borderRadius: 6,
                  padding: '7px 10px',
                  fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s ease', width: '100%',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: on ? color : '#3a3a58',
                  boxShadow: on ? `0 0 5px ${color}cc` : 'none',
                  transition: 'all 0.15s ease',
                }} />
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: on ? color : '#8aa0b8' }}>
                  {on ? 'ON' : 'OFF'}
                </span>
              </button>
            </Tooltip>
          )
        })}
      </Section>

      {/* ── 편집 모드 토글은 Edit 모드 좌측 패널(EditPanelDock)로 이동 ── */}
      {/* ── 모델 확인(색상 기준·노드/그룹 필터)은 Model Check 리본(ModelCheckPanelDock)으로 분리 ── */}

      {/* ── 섹션: 모델 조작 ─────────────────────────── */}
      <Section label="모델 조작">
        <Tooltip placement="right" content={
          pipeFluidEmptied ? (
            <>
              <strong style={{ color: '#6ee7b7' }}>Pipe 내부 유체 채우기</strong><br/>
              모델 로드 시 <b>기본값으로 유체를 비운 상태</b>입니다. 이 버튼을 누르면 배관 내부
              유체(물) 중량을 원래대로 다시 채웁니다. 모델 중량·무게중심이 재계산됩니다.
            </>
          ) : (
            <>
              <strong style={{ color: '#7ab2d4' }}>Pipe 내부 유체 비우기</strong><br/>
              모든 배관 material 의 밀도를 순수 강재(7.85e-9)로 되돌려 내부 물 중량을 제거합니다.
              모델 중량·무게중심이 즉시 재계산되고, 구조해석(Nastran) BDF 에도 반영됩니다.
            </>
          )
        }>
          <button
            type="button"
            onClick={handleTogglePipeFluid}
            disabled={(!pipeFluidEmptied && pipeFluidAlreadyEmpty) || pipeMaterialCount === 0 || stages.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '7px 10px', borderRadius: 7,
              cursor: ((!pipeFluidEmptied && pipeFluidAlreadyEmpty) || pipeMaterialCount === 0) ? 'default' : 'pointer',
              fontSize: 12, fontWeight: 700,
              background: isEmptied ? 'rgba(110,231,183,0.10)' : 'rgba(122,178,212,0.12)',
              color: isEmptied ? '#6ee7b7' : '#bcd6e8',
              border: `1px solid ${isEmptied ? 'rgba(110,231,183,0.45)' : 'rgba(122,178,212,0.35)'}`,
              opacity: (pipeMaterialCount === 0 && !isEmptied) ? 0.5 : 1,
            }}
          >
            <Droplet size={14} />
            {isEmptied ? (pipeFluidEmptied ? 'Pipe 내부 유체 채우기' : '유체 비움 완료 ✓') : 'Pipe 내부 유체 비우기'}
          </button>
        </Tooltip>
        {/* 로드 직후 자동 적용된 기본값임을 밝힌다 — 사용자가 누른 적 없는데 '비움' 상태인 이유. */}
        {pipeFluidEmptied && !emptyResult && (
          <div style={{ fontSize: 10, color: '#9fd0b6', marginTop: 4, lineHeight: 1.4 }}>
            기본값으로 배관 내부 유체를 비운 상태입니다. 유체를 포함해 평가하려면 위 버튼으로 채우세요.
          </div>
        )}
        {/* 모델이 없을 때 "배관 부재가 없습니다"라고 단정하면 모델에 배관이 없다는 뜻으로
            읽힌다. 실제로는 아직 아무것도 안 읽은 상태다 — 두 경우를 구분해 말한다. */}
        {pipeMaterialCount === 0 && !isEmptied && (
          <div style={{ fontSize: 10, color: '#7a8aaa', marginTop: 4 }}>
            {stages.length === 0 ? '모델을 먼저 열어 주세요.' : '이 모델에는 배관 부재가 없습니다.'}
          </div>
        )}
        {/* 이미 비워진 채 로드된 모델 — 사용자가 비운 게 아님을 구분해 안내(혼란 방지) */}
        {pipeFluidAlreadyEmpty && !pipeFluidEmptied && (
          <div style={{ fontSize: 10, color: '#9fd0b6', marginTop: 4 }}>
            이미 순수 강재 밀도입니다 (내부 유체 없음).
          </div>
        )}
        {emptyResult && (
          <div style={{ fontSize: 10, color: '#9fd0b6', marginTop: 4 }}>
            material {emptyResult.count}개 비움{emptyResult.delta != null ? ` · −${emptyResult.delta.toFixed(1)} ton` : ''}, 무게중심 갱신됨
          </div>
        )}
        {emptyResult?.invalidated && (
          <div style={{ fontSize: 10, color: '#ffcc66', marginTop: 4, lineHeight: 1.4 }}>
            ⚠ 무게중심이 바뀌어 자세안정성 평가 결과를 초기화했습니다. 자세안정성 평가를 다시 실행하세요.
          </div>
        )}
        <Tooltip placement="right" content="모델을 X/Y/Z 축 중심(무게중심 기준)으로 회전합니다. 회전된 모델로 자세안정성·구조해석·BDF 출력이 모두 수행됩니다.">
          <button
            onClick={() => setShowRotateDialog(true)}
            disabled={!lastStage}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', marginTop: 6,
              background: lastStage ? '#12122c' : '#0c0c1c',
              border: '1px solid #2e2e50', borderRadius: 6,
              color: lastStage ? '#cad8e8' : '#54546e',
              fontSize: 11, fontWeight: 700, cursor: lastStage ? 'pointer' : 'not-allowed',
            }}
          >
            <RotateCcw size={13} /> 모델 회전
          </button>
        </Tooltip>
        {rotateResult && (
          <div style={{ fontSize: 10, color: '#9fd0ff', marginTop: 4, lineHeight: 1.4 }}>
            ↻ {rotateResult.axis}축 {rotateResult.angleDeg}° 회전 적용 ({rotateResult.changedNodeCount} 노드)
          </div>
        )}
        {rotateResult?.invalidatedStability && (
          <div style={{ fontSize: 10, color: '#ffcc66', marginTop: 2, lineHeight: 1.4 }}>
            ⚠ 형상이 바뀌어 자세안정성/구조해석 결과를 초기화했습니다. 자세안정성 평가를 다시 실행하세요.
          </div>
        )}
        {/* 회전 초기화 — 실제 회전 상태(modelRotated)일 때만 노출. 개별 회전 되돌리기는 불가하며 여기서만 전체 해제. */}
        {modelRotated && (
          <Tooltip placement="right" content="적용된 모델 회전을 모두 해제하고 원래 방향으로 되돌립니다. 회전은 개별 되돌리기가 불가하며, 이 버튼으로만 전체 해제됩니다.">
            <button
              onClick={handleResetRotation}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 10px', marginTop: 6,
                background: 'rgba(255,184,0,0.10)',
                border: '1px solid rgba(255,184,0,0.45)', borderRadius: 6,
                color: '#FFE6A8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} /> 회전 초기화
            </button>
          </Tooltip>
        )}
        {rotateReset && (
          <div style={{ fontSize: 10, color: '#9fd0b6', marginTop: 4, lineHeight: 1.4 }}>
            ↺ 회전 {rotateReset.undoneCount}건 해제 — 원래 방향으로 복원됨
            {rotateReset.invalidatedStability ? ' · 해석 결과 초기화됨' : ''}
          </div>
        )}
      </Section>

      {/* ── 초기화 버튼 ─────────── */}
      <div style={{ padding: '10px 8px', borderBottom: '1px solid #1e1e38' }}>
        <Tooltip
          placement="right"
          maxWidth={280}
          content={
            <>
              <strong style={{ color: '#e07070' }}>전체 초기화</strong><br/>
              로드한 단계, 뷰포트 설정, 편집 의도, 권상 위치, 자세안정성/Unit 구조 해석 결과를
              모두 비우고 Studio 가 처음 열린 상태로 돌아갑니다.
              새 폴더/파일 로드 전, 또는 처음부터 다시 분석을 시작할 때 사용하세요.
            </>
          }>
          <button
            onClick={handleReset}
            aria-label="전체 초기화"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '8px 10px',
              background: 'transparent',
              color: '#9a9ad0',
              border: '1px solid #2e2e50',
              borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(200,60,60,0.12)'
              e.currentTarget.style.color = '#e07070'
              e.currentTarget.style.borderColor = '#7a3a3a'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#9a9ad0'
              e.currentTarget.style.borderColor = '#2e2e50'
            }}
          >
            <RotateCcw size={13} />
            초기화
          </button>
        </Tooltip>
      </div>

      {showRotateDialog && (
        <RotateModelDialog
          onClose={() => setShowRotateDialog(false)}
          onApplied={(res) => { setRotateResult(res); setRotateReset(null) }}
        />
      )}

      {/* ── 리사이즈 핸들 ─────────────────────────────────────────────── */}
      <div
        onMouseDown={onResizeMouseDown}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 5,
          cursor: 'col-resize',
          background: 'transparent',
          transition: 'background 0.15s ease',
          zIndex: 10,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(70,130,180,0.35)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        title="드래그하여 너비 조절"
      />
    </div>
  )
}

// ── 섹션 래퍼 ─────────────────────────────────────────────────────────────

function Section({ label, children }) {
  return (
    <div style={{
      padding: '11px 8px 10px',
      borderBottom: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{
        fontSize: 10, color: '#7ab2d4', letterSpacing: 1.5,
        textTransform: 'uppercase', fontWeight: 800,
        marginBottom: 3, paddingLeft: 2,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ── 일반 액션 버튼 ────────────────────────────────────────────────────────

function SideBtn({ onClick, disabled, accent, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: disabled ? '#0f0f1e' : `${accent}22`,
        color: disabled ? '#5a5a80' : '#ccd8e8',
        border: `1px solid ${disabled ? '#2a2a40' : accent + '88'}`,
        borderRadius: 6,
        padding: '7px 10px',
        fontSize: 11, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
        width: '100%', textAlign: 'left',
      }}
    >
      {children}
    </button>
  )
}

function StatusText({ color, children }) {
  return (
    <div style={{ fontSize: 10, color, padding: '1px 2px', lineHeight: 1.4, wordBreak: 'break-all' }}>
      {children}
    </div>
  )
}


