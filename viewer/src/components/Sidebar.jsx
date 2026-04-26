import { useRef, useState, useCallback } from 'react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'

const LAYER_DEFS = [
  { key: 'structure',  label: '구조',    color: '#5BA8E5' },
  { key: 'pipe',       label: '배관',    color: '#FFAA22' },
  { key: 'nodes',      label: '노드',    color: '#FF4455' },
  { key: 'rigids',     label: 'RBE',     color: '#FF44FF' },
  { key: 'masses',     label: '질량',    color: '#FF99BB' },
  { key: 'boundaries', label: '경계조건', color: '#22DD66' },
]

const MIN_WIDTH = 130
const MAX_WIDTH = 320
const DEFAULT_WIDTH = 190

export default function Sidebar() {
  const { loading, error, loadStages } = useStageStore()
  const {
    viewports, addViewport,
    cameraLinked, toggleCameraLink,
    renderMode, setRenderMode,
    layers, toggleLayer,
  } = useViewerStore()
  const { stages } = useStageStore()

  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragRef = useRef(null)  // { startX, startWidth }

  const fileInputRef = useRef(null)

  const handleFolderOpen = async () => {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      const files = []
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          const file = await entry.getFile()
          files.push(file)
        }
      }
      if (files.length > 0) loadStages(files)
    } catch (err) {
      if (err.name !== 'AbortError') console.error('폴더 열기 실패:', err)
    }
  }

  const handleFileInput = (e) => {
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
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* hidden inputs */}
      <input ref={fileInputRef} type="file" accept=".json" multiple style={{ display: 'none' }} onChange={handleFileInput} />

      {/* ── 섹션 1: 파일 ─────────────────────────────── */}
      <Section label="파일">
        <SideBtn onClick={() => fileInputRef.current?.click()} disabled={loading} accent="#4a8cc4">
          <BtnIcon>📄</BtnIcon> 파일 열기
        </SideBtn>
        <SideBtn onClick={handleFolderOpen} disabled={loading} accent="#2e6a94">
          <BtnIcon>📂</BtnIcon> 폴더 열기
        </SideBtn>
        {loading && <StatusText color="#7a8aaa">로딩 중…</StatusText>}
        {error   && <StatusText color="#FF5566">{error}</StatusText>}
      </Section>

      {/* ── 섹션 2: 뷰포트 ───────────────────────────── */}
      <Section label="뷰포트">
        <SideBtn onClick={addViewport} disabled={!canAddViewport} accent="#2a6a3a">
          <BtnIcon style={{ fontWeight: 900 }}>+</BtnIcon>
          <span style={{ flex: 1 }}>뷰 추가</span>
          <CountBadge active={canAddViewport}>{viewports.length}/4</CountBadge>
        </SideBtn>
        <ToggleBtn active={cameraLinked} onClick={toggleCameraLink} activeColor="#7c3aed" label="카메라 동기화" icon="🔗" />
      </Section>

      {/* ── 섹션 3: 렌더 ─────────────────────────────── */}
      <Section label="렌더">
        <ToggleBtn
          active={renderMode === 'section3d'}
          onClick={() => setRenderMode(renderMode === 'section3d' ? 'cylinder' : 'section3d')}
          activeColor="#b06828"
          label="3D 단면"
          icon="⬡"
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

      {/* ── 섹션 5: 단계 정보 ────────────────────────── */}
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

function BtnIcon({ children, style }) {
  return <span style={{ fontSize: 11, lineHeight: 1, flexShrink: 0, ...style }}>{children}</span>
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
