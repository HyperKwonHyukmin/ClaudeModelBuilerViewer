import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

export default function Toolbar() {
  const { loading, error, loadStages } = useStageStore()
  const { viewports, addViewport, cameraLinked, toggleCameraLink, colorMode, setColorMode } = useViewerStore()

  const handleFileChange = (e) => {
    if (e.target.files?.length) loadStages(e.target.files)
  }

  const canAddViewport = viewports.length < 4

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', background: '#12122a',
      borderBottom: '1px solid #2a2a4a', flexShrink: 0, flexWrap: 'wrap',
    }}>
      {/* File loader */}
      <label style={btnStyle('#4682B4', loading)}>
        📂 폴더 열기
        <input type="file" accept=".json" multiple webkitdirectory="" onChange={handleFileChange} style={{ display: 'none' }} />
      </label>

      {/* Add viewport */}
      <button
        onClick={addViewport}
        disabled={!canAddViewport}
        style={btnStyle(canAddViewport ? '#2a6a2a' : '#333')}
        title={canAddViewport ? '뷰포트 추가' : '최대 4개'}
      >
        + 뷰포트
      </button>

      {/* Camera sync */}
      <button
        onClick={toggleCameraLink}
        style={btnStyle(cameraLinked ? '#7c3aed' : '#444')}
        title="카메라 동기화"
      >
        {cameraLinked ? '🔗 동기화 ON' : '🔗 동기화 OFF'}
      </button>

      {/* Color by */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#888' }}>색상:</span>
        <select
          value={colorMode}
          onChange={e => setColorMode(e.target.value)}
          style={{ background: '#1a1a3a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '3px 6px', fontSize: 11 }}
        >
          <option value="category">카테고리</option>
          <option value="propertyId">속성 ID</option>
          <option value="shapeType">단면 형상</option>
        </select>
      </div>

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
