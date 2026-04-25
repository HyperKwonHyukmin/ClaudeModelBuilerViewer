import { useState, useCallback } from 'react'
import ThreeViewport from './components/ThreeViewport.jsx'
import { loadFiles } from './data/fileLoader.js'

export default function App() {
  const [stages, setStages] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [layers, setLayers] = useState({
    structure: true, pipe: true, nodes: false,
    rigids: true, masses: true, boundaries: true, welds: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileChange = useCallback(async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const loaded = await loadFiles(files)
      if (loaded.length === 0) {
        setError('JSON 파일을 찾을 수 없습니다.')
        return
      }
      setStages(loaded)
      setActiveIndex(0)
    } catch (err) {
      setError(`로드 실패: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleLayer = useCallback((key) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const currentStage = stages[activeIndex] ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#1a1a2e', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#12122a', borderBottom: '1px solid #333', flexShrink: 0 }}>
        <label style={{ cursor: 'pointer', padding: '6px 14px', background: '#4682B4', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
          📂 폴더 열기
          <input
            type="file"
            accept=".json"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>

        {stages.length > 0 && (
          <select
            value={activeIndex}
            onChange={e => setActiveIndex(Number(e.target.value))}
            style={{ background: '#222', color: '#e0e0e0', border: '1px solid #444', borderRadius: 6, padding: '5px 10px', fontSize: 13 }}
          >
            {stages.map((s, i) => (
              <option key={i} value={i}>
                {String(i + 1).padStart(2, '0')} {s.meta?.stageName ?? `Stage ${i + 1}`}
              </option>
            ))}
          </select>
        )}

        {loading && <span style={{ fontSize: 13, color: '#aaa' }}>로딩 중...</span>}
        {error && <span style={{ fontSize: 13, color: '#FF4444' }}>{error}</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {[
            { key: 'structure', label: '구조', color: '#4682B4' },
            { key: 'pipe', label: '배관', color: '#FF8C00' },
            { key: 'nodes', label: '노드', color: '#888888' },
            { key: 'rigids', label: 'RBE', color: '#FF00FF' },
            { key: 'masses', label: '질량', color: '#FFD700' },
            { key: 'boundaries', label: '경계', color: '#00AA00' },
            { key: 'welds', label: '용접', color: '#FF4444' },
          ].map(({ key, label, color }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={() => toggleLayer(key)}
              />
              <span style={{ color }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Viewport area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {stages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#666' }}>
            <div style={{ fontSize: 48 }}>🏗️</div>
            <p style={{ fontSize: 16 }}>파이프라인 JSON 폴더를 선택하세요</p>
            <p style={{ fontSize: 13 }}>csv/01/20260424_172924/ 와 같은 단계별 JSON 폴더</p>
          </div>
        ) : (
          <ThreeViewport
            stageData={currentStage}
            layers={layers}
          />
        )}
      </div>

      {/* Status bar */}
      {currentStage && (
        <div style={{ display: 'flex', gap: 20, padding: '4px 16px', background: '#12122a', borderTop: '1px solid #333', fontSize: 12, color: '#888', flexShrink: 0 }}>
          <span>단계: <strong style={{ color: '#e0e0e0' }}>{currentStage.meta?.stageName}</strong></span>
          <span>노드: <strong style={{ color: '#e0e0e0' }}>{currentStage.healthMetrics?.totals?.nodeCount?.toLocaleString()}</strong></span>
          <span>요소: <strong style={{ color: '#e0e0e0' }}>{currentStage.healthMetrics?.totals?.elementCount?.toLocaleString()}</strong></span>
          <span>단위: {currentStage.meta?.unit}</span>
        </div>
      )}
    </div>
  )
}
