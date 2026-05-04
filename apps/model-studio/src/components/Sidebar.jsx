import { useRef, useState, useCallback } from 'react'
import { Box, FileJson, FolderOpen, Link, Plus, RotateCcw, Search } from 'lucide-react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useEditStore } from '../store/useEditStore.js'
import { getHost } from '../host/host.js'
import EditModeToggle from './EditModeToggle.jsx'

const LAYER_DEFS = [
  { key: 'nodes',        label: 'Node',         color: '#FF4455' },
  { key: 'structure',    label: '구조',         color: '#5BA8E5' },
  { key: 'pipe',         label: '배관',         color: '#FFAA22' },
  { key: 'rigids',       label: 'RBE',          color: '#FF44FF' },
  { key: 'masses',       label: '질량',         color: '#FF99BB' },
  { key: 'boundaries',   label: '경계조건',     color: '#22DD66' },
  { key: 'uboltMarkers', label: 'U-bolt 위치',  color: '#00E5FF' },
  { key: 'uboltDof',     label: 'U-bolt DOF',   color: '#FFE066' },
  { key: 'cog',          label: '무게중심',     color: '#FFD700' },
]

const MIN_WIDTH = 130
const MAX_WIDTH = 320
const DEFAULT_WIDTH = 190

export default function Sidebar() {
  // Workbench(Electron) 임베드 시에는 폴더가 호스트로부터 자동 주입되므로
  // "파일 열기" / "폴더 열기" 버튼을 숨겨 사용자 혼동을 방지한다.
  // (브라우저 단독 실행 시에는 그대로 노출되어 수동 폴더 선택 가능)
  const isEmbeddedHost = getHost().name === 'electron'

  const { loading, error, loadStages, loadSummary, stages, reset: resetStages } = useStageStore()
  const {
    viewports, addViewport,
    cameraLinked, toggleCameraLink,
    renderMode, setRenderMode,
    layers, toggleLayer,
    reset: resetViewer,
  } = useViewerStore()

  const resetEdit = useEditStore(s => s.reset)

  const handleReset = useCallback(() => {
    resetStages()
    resetViewer()
    resetEdit()
  }, [resetStages, resetViewer, resetEdit])

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

  const canAddViewport = viewports.length < 4

  return (
    <div style={{
      width, flexShrink: 0, position: 'relative',
      background: '#0b0b1e',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* hidden inputs */}
      <input ref={fileInputRef} type="file" accept=".json" multiple style={{ display: 'none' }} onChange={handleFileInput} />

      {/* ── 섹션 1: 파일 ─────────────────────────────── */}
      <Section label="파일">
        {!isEmbeddedHost && (
          <>
            <SideBtn onClick={() => { if (guardLoad()) fileInputRef.current?.click() }} disabled={loading} accent="#4a8cc4">
              <FileJson size={14} /> 파일 열기
            </SideBtn>
            <SideBtn onClick={handleFolderOpen} disabled={loading} accent="#2e6a94">
              <FolderOpen size={14} /> 폴더 열기
            </SideBtn>
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

      {/* ── 섹션 1.5: ID 검색 (데이터 로드 후만 표시) ─── */}
      {stages.length > 0 && <SearchSection />}

      {/* ── 섹션 2: 뷰포트 ───────────────────────────── */}
      <Section label="뷰포트">
        <SideBtn onClick={addViewport} disabled={!canAddViewport} accent="#2a6a3a">
          <Plus size={14} />
          <span style={{ flex: 1 }}>뷰 추가</span>
          <CountBadge active={canAddViewport}>{viewports.length}/4</CountBadge>
        </SideBtn>
        <ToggleBtn active={cameraLinked} onClick={toggleCameraLink} activeColor="#7c3aed" label="카메라 동기화" icon={<Link size={13} />} />
      </Section>

      {/* ── 섹션 3: 렌더 ─────────────────────────────── */}
      <Section label="렌더">
        <ToggleBtn
          active={renderMode === 'section3d'}
          onClick={() => setRenderMode(renderMode === 'section3d' ? 'cylinder' : 'section3d')}
          activeColor="#b06828"
          label="3D 단면"
          icon={<Box size={13} />}
        />
      </Section>

      {/* ── 섹션 4: 레이어 ───────────────────────────── */}
      <Section label="레이어">
        {LAYER_DEFS.map(({ key, label, color }) => {
          const on = layers[key] ?? true
          return (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              title={on ? `${label} 숨기기` : `${label} 표시`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: on ? `${color}20` : '#0f0f22',
                color: on ? '#f0f0f0' : '#7070a0',
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
              <span style={{ fontSize: 8, fontWeight: 800, color: on ? color + 'cc' : '#505070' }}>
                {on ? 'ON' : 'OFF'}
              </span>
            </button>
          )
        })}
      </Section>

      {/* ── 섹션 5: 편집 모드 ────────────────────────── */}
      <Section label="편집">
        <EditModeToggle />
      </Section>

      {/* ── 섹션 6: 단계 정보 ────────────────────────── */}
      {stages.length > 0 && (
        <Section label="단계">
          <div style={{
            background: '#0f0f22', border: '1px solid #1e1e36', borderRadius: 6,
            padding: '6px 10px', display: 'flex', alignItems: 'baseline', gap: 4,
          }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#5BA8E5' }}>{stages.length}</span>
            <span style={{ fontSize: 10, color: '#404060' }}>단계</span>
          </div>
        </Section>
      )}

      {/* ── 초기화 버튼 (단계 섹션 바로 아래) ─────────── */}
      <div style={{ padding: '10px 8px', borderBottom: '1px solid #1e1e38' }}>
        <button
          onClick={handleReset}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '8px 10px',
            background: 'transparent',
            color: '#7070a0',
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
            e.currentTarget.style.color = '#7070a0'
            e.currentTarget.style.borderColor = '#2e2e50'
          }}
          title="모든 데이터와 설정을 초기화합니다"
        >
          <RotateCcw size={13} />
          초기화
        </button>
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

// ── ON/OFF 토글 버튼 ──────────────────────────────────────────────────────

function ToggleBtn({ active, onClick, activeColor, label, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        background: active ? `${activeColor}28` : '#0f0f22',
        color: active ? '#f0f0f0' : '#7070a0',
        border: `1px solid ${active ? activeColor + 'aa' : '#2e2e50'}`,
        borderRadius: 6,
        padding: '7px 10px',
        fontSize: 11, fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        width: '100%', textAlign: 'left',
        boxShadow: active ? `0 0 8px ${activeColor}30` : 'none',
      }}
    >
      <span style={{ fontSize: 11, lineHeight: 1 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 8, fontWeight: 800, color: active ? activeColor + 'ee' : '#505070' }}>
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

function CountBadge({ active, children }) {
  return (
    <span style={{ fontSize: 9, color: active ? '#6aaa7a' : '#444', fontWeight: 700 }}>
      {children}
    </span>
  )
}

function StatusText({ color, children }) {
  return (
    <div style={{ fontSize: 9, color, padding: '1px 2px', lineHeight: 1.4, wordBreak: 'break-all' }}>
      {children}
    </div>
  )
}

// ── ID 검색 ─────────────────────────────────────────────────────────────
//
// 입력 형식:
//   "1234"        → auto: 요소 → 노드 → RBE 우선순위로 탐색
//   "E1234"       → 요소 ID 전용 (대소문자 무관, "#" 구분자 허용: "E#1234")
//   "N1234"       → 노드 ID 전용
//   "R1234" / "RBE1234" → RBE ID 전용
//
// 동작: 마지막 stage 기준으로 검색 → setPickedEntity + focusPickedEntity (3D 카메라 이동).
//       해당 ID 가 마지막 stage 에 없으면 "찾을 수 없음" 메시지.
function SearchSection() {
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState(null)
  const stages = useStageStore(s => s.stages)
  const setPickedEntity = useViewerStore(s => s.setPickedEntity)
  const focusPickedEntity = useViewerStore(s => s.focusPickedEntity)

  const handleSearch = () => {
    const text = input.trim()
    if (!text) { setFeedback(null); return }
    if (stages.length === 0) {
      setFeedback({ type: 'error', text: '먼저 데이터를 로드하세요' })
      return
    }
    const parsed = parseSearchInput(text)
    if (!parsed) {
      setFeedback({ type: 'error', text: '형식 오류 (예: 1234, E1234, N5678, R10)' })
      return
    }
    const stage = stages[stages.length - 1]
    const found = findEntityById(stage, parsed)
    if (!found) {
      const label = parsed.type === 'auto' ? '#' : `${labelOf(parsed.type)}#`
      setFeedback({ type: 'error', text: `${label}${parsed.id} 찾을 수 없음` })
      return
    }
    setPickedEntity(found.entity)
    setTimeout(focusPickedEntity, 0)
    setFeedback({ type: 'ok', text: `${found.label}#${parsed.id} 선택됨` })
  }

  return (
    <Section label="검색">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
        placeholder="ID (예: E1234, N5678, R10)"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#0f0f22',
          border: '1px solid #2e2e50',
          borderRadius: 6,
          padding: '6px 9px',
          fontSize: 11, fontWeight: 500,
          color: '#ccd8e8',
          outline: 'none',
          fontFamily: 'inherit',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#4a8cc488' }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = '#2e2e50' }}
      />
      <SideBtn onClick={handleSearch} disabled={!input.trim()} accent="#4a8cc4">
        <Search size={13} /> 찾기
      </SideBtn>
      {feedback && (
        <StatusText color={feedback.type === 'ok' ? '#6ac58f' : '#FF5566'}>
          {feedback.text}
        </StatusText>
      )}
    </Section>
  )
}

function parseSearchInput(s) {
  // RBE 접두사 (longest match) 우선
  const mRbe = /^rbe\s*#?\s*(\d+)$/i.exec(s)
  if (mRbe) return { type: 'rigid', id: parseInt(mRbe[1], 10) }
  // E / N / R 단일 문자 접두사
  const m = /^([enr])\s*#?\s*(\d+)$/i.exec(s)
  if (m) {
    const t = m[1].toLowerCase()
    return {
      type: t === 'e' ? 'element' : t === 'n' ? 'node' : 'rigid',
      id: parseInt(m[2], 10),
    }
  }
  // 숫자만 → 자동 탐색
  if (/^\d+$/.test(s)) return { type: 'auto', id: parseInt(s, 10) }
  return null
}

function labelOf(type) {
  return type === 'element' ? 'E' : type === 'node' ? 'N' : 'RBE'
}

function findEntityById(stage, parsed) {
  const tryElement = () => {
    const e = stage.elements?.find(x => x.id === parsed.id)
    if (!e) return null
    return {
      label: 'E',
      entity: { type: 'element', id: e.id, category: e.category, startNode: e.startNode, endNode: e.endNode, propertyId: e.propertyId },
    }
  }
  const tryNode = () => {
    if (!stage.nodeMap?.has(parsed.id)) return null
    return { label: 'N', entity: { type: 'node', nodeId: parsed.id } }
  }
  const tryRigid = () => {
    const r = stage.rigids?.find(x => x.id === parsed.id)
    if (!r) return null
    return {
      label: 'RBE',
      entity: { type: 'rigid', id: r.id, independentNode: r.independentNode, dependentNodes: r.dependentNodes ?? [] },
    }
  }

  if (parsed.type === 'element') return tryElement()
  if (parsed.type === 'node')    return tryNode()
  if (parsed.type === 'rigid')   return tryRigid()
  // auto — 우선순위: 요소 → 노드 → RBE
  return tryElement() ?? tryNode() ?? tryRigid()
}

