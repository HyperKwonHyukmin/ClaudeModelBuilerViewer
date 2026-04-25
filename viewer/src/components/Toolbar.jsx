import { useRef } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

const FREE_NODE_DEFS = [
  { key: 'normal', label: '다중 요소 Node', color: '#FF2222' },
  { key: 'free',   label: 'Free Node',      color: '#FFDD00' },
  { key: 'orphan', label: '고립 Node',      color: '#CC44FF' },
]

export default function Toolbar() {
  const { loading, error, loadStages } = useStageStore()
  const {
    viewports, addViewport, cameraLinked, toggleCameraLink,
    colorMode, setColorMode,
    freeNodeFilters, toggleFreeNodeFilter,
  } = useViewerStore()
  const fallbackRef = useRef(null)

  // ── Folder picker ─────────────────────────────────────────────────────
  const handleFolderClick = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
        const files = []
        for await (const [name, handle] of dirHandle) {
          if (handle.kind === 'file' && name.endsWith('.json')) {
            files.push(await handle.getFile())
          }
        }
        if (files.length) loadStages(files)
        else loadStages([])
      } catch (err) {
        if (err.name !== 'AbortError') console.error('[Toolbar] showDirectoryPicker error:', err)
      }
    } else {
      fallbackRef.current?.click()
    }
  }

  const handleFallbackChange = (e) => {
    if (e.target.files?.length) loadStages(e.target.files)
    e.target.value = ''
  }

  const canAddViewport = viewports.length < 4

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', background: '#12122a',
      borderBottom: '1px solid #2a2a4a', flexShrink: 0, flexWrap: 'wrap',
    }}>
      {/* File loader */}
      <button onClick={handleFolderClick} disabled={loading} style={btnStyle('#4682B4', loading)} title="JSON 파일이 있는 폴더를 선택하세요">
        📂 폴더 열기
      </button>
      <input ref={fallbackRef} type="file" accept=".json" multiple webkitdirectory="" onChange={handleFallbackChange} style={{ display: 'none' }} />

      {/* Add viewport */}
      <button onClick={addViewport} disabled={!canAddViewport} style={btnStyle(canAddViewport ? '#2a6a2a' : '#333')} title={canAddViewport ? '뷰포트 추가' : '최대 4개'}>
        + 뷰포트
      </button>

      {/* Camera sync */}
      <button onClick={toggleCameraLink} style={btnStyle(cameraLinked ? '#7c3aed' : '#444')} title="카메라 동기화">
        {cameraLinked ? '🔗 동기화 ON' : '🔗 동기화 OFF'}
      </button>

      {/* 모델 확인 콤보 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>모델 확인</span>
        <select
          value={colorMode}
          onChange={e => setColorMode(e.target.value)}
          style={{ background: '#1a1a3a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '3px 6px', fontSize: 11 }}
        >
          <option value="category">모델 확인</option>
          <option value="freeNode">Free Node 확인</option>
        </select>
      </div>

      {/* Free Node 필터 토글 (freeNode 모드일 때만) */}
      {colorMode === 'freeNode' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 4 }}>
          {FREE_NODE_DEFS.map(({ key, label, color }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11 }}>
              <input
                type="checkbox"
                checked={freeNodeFilters[key]}
                onChange={() => toggleFreeNodeFilter(key)}
                style={{ accentColor: color }}
              />
              <span style={{ color }}>{label}</span>
            </label>
          ))}
        </div>
      )}

      {loading && <span style={{ fontSize: 12, color: '#aaa', marginLeft: 4 }}>로딩 중...</span>}
      {error && <span style={{ fontSize: 12, color: '#FF4444', marginLeft: 4 }}>{error}</span>}
    </div>
  )
}

const btnStyle = (bg, disabled = false) => ({
  padding: '5px 12px', background: disabled ? '#333' : bg,
  color: disabled ? '#666' : '#fff', border: 'none',
  borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
})
