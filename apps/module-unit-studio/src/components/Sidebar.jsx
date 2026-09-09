import { useRef, useState, useCallback } from 'react'
import { FileJson, FolderOpen, RotateCcw } from 'lucide-react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import { useUnitStructuralStore } from '../store/useUnitStructuralStore.js'
import { getHost } from '../host/host.js'
import Tooltip from './Tooltip.jsx'

const LAYER_DEFS = [
  { key: 'nodes',        label: 'Node',         color: '#FF4455', desc: '전체 보기에서도 6px 밝은 적색으로 선명하게 표시하고, 확대·Node 선택·편집·권상 작업에서는 7~8px로 자동 강조. 배관 토글이 OFF면 배관 전용 Node도 숨깁니다.' },
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


