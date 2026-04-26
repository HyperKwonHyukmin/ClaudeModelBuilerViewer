import { useRef } from 'react'
import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

export default function Toolbar() {
  const { loading, error, loadStages } = useStageStore()
  const { viewports, addViewport, cameraLinked, toggleCameraLink, renderMode, setRenderMode } = useViewerStore()
  const folderInputRef = useRef(null)
  const fileInputRef   = useRef(null)

  // Folder picker — webkitdirectory collects all .json files recursively
  const handleFolderClick = () => folderInputRef.current?.click()
  const handleFolderInput = (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.json'))
    loadStages(files)
    e.target.value = ''
  }

  // Individual JSON file picker
  const handleFileClick = () => fileInputRef.current?.click()
  const handleFileInput = (e) => {
    const files = Array.from(e.target.files)
    loadStages(files)
    e.target.value = ''
  }

  const canAddViewport = viewports.length < 4

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', background: '#12122a',
      borderBottom: '1px solid #2a2a4a', flexShrink: 0, flexWrap: 'wrap',
    }}>
      {/* hidden folder input — webkitdirectory collects all .json files recursively */}
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderInput}
      />
      {/* hidden file input — .json only, multi-select */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
      <button onClick={handleFileClick} disabled={loading} style={btnStyle('#4682B4', loading)} title="JSON 파일을 개별 선택">
        📄 파일 열기
      </button>
      <button onClick={handleFolderClick} disabled={loading} style={btnStyle('#2a6088', loading)} title="폴더를 선택하면 내부 JSON을 모두 불러옵니다">
        📂 폴더 열기
      </button>

      <button onClick={addViewport} disabled={!canAddViewport} style={btnStyle(canAddViewport ? '#2a6a2a' : '#333')} title={canAddViewport ? '뷰포트 추가' : '최대 4개'}>
        + 뷰포트
      </button>

      <button onClick={toggleCameraLink} style={btnStyle(cameraLinked ? '#7c3aed' : '#444')} title="카메라 동기화">
        {cameraLinked ? '🔗 동기화 ON' : '🔗 동기화 OFF'}
      </button>

      <button
        onClick={() => setRenderMode(renderMode === 'section3d' ? 'cylinder' : 'section3d')}
        style={btnStyle(renderMode === 'section3d' ? '#a06020' : '#444')}
        title="실제 단면 형상으로 렌더링 (Bar/Rod/Tube/L/H)"
      >
        {renderMode === 'section3d' ? '⬡ 3D단면 ON' : '⬡ 3D단면'}
      </button>

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
