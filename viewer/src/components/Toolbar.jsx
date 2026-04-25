import { useStageStore } from '../store/useStageStore.js'
import { useViewerStore } from '../store/useViewerStore.js'

export default function Toolbar() {
  const { loading, error, loadStages } = useStageStore()
  const { viewports, addViewport, cameraLinked, toggleCameraLink } = useViewerStore()

  // showDirectoryPicker API (Chrome/Edge ≥ 86) — no fallback input needed
  const handleFolderClick = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('이 브라우저는 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 사용하세요.')
      return
    }
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
  }

  const canAddViewport = viewports.length < 4

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', background: '#12122a',
      borderBottom: '1px solid #2a2a4a', flexShrink: 0, flexWrap: 'wrap',
    }}>
      <button onClick={handleFolderClick} disabled={loading} style={btnStyle('#4682B4', loading)} title="JSON 파일이 있는 폴더를 선택하세요">
        📂 폴더 열기
      </button>

      <button onClick={addViewport} disabled={!canAddViewport} style={btnStyle(canAddViewport ? '#2a6a2a' : '#333')} title={canAddViewport ? '뷰포트 추가' : '최대 4개'}>
        + 뷰포트
      </button>

      <button onClick={toggleCameraLink} style={btnStyle(cameraLinked ? '#7c3aed' : '#444')} title="카메라 동기화">
        {cameraLinked ? '🔗 동기화 ON' : '🔗 동기화 OFF'}
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
