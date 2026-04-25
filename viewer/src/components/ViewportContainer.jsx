import { useRef, useCallback, useState } from 'react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'
import ThreeViewport from './ThreeViewport.jsx'
import PickTooltip from './PickTooltip.jsx'
import LayerPanel from './LayerPanel.jsx'
import useCameraSync from '../hooks/useCameraSync.js'

/**
 * Dynamic viewport grid.
 * 1 viewport → full area
 * 2 viewports → 1×2 row
 * 3-4 viewports → 2×2 grid
 *
 * LayerPanel floats over the grid (bottom-left overlay).
 */
export default function ViewportContainer() {
  const { viewports, removeViewport, setViewportStage, setActiveViewport, activeViewportId, layers, cameraLinked, setPickedEntity, colorMode, freeNodeFilters } = useViewerStore()
  const { stages } = useStageStore()

  const viewportApiRefs = useRef({})

  const handleReady = useCallback((id, api) => {
    viewportApiRefs.current[id] = api
  }, [])

  useCameraSync(viewportApiRefs, cameraLinked, viewports)

  const [tooltip, setTooltip] = useState({ pickInfo: null, position: null })

  const handlePick = useCallback((pickInfo, e) => {
    setPickedEntity(pickInfo)
    setTooltip(pickInfo ? { pickInfo, position: { x: e.clientX, y: e.clientY } } : { pickInfo: null, position: null })
  }, [setPickedEntity])

  const count = viewports.length
  const cols = count <= 1 ? 1 : 2
  const rows = count <= 2 ? 1 : 2

  if (stages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#555' }}>
        <div style={{ fontSize: 48 }}>🏗️</div>
        <p style={{ fontSize: 15 }}>파이프라인 JSON 파일을 선택하세요</p>
        <p style={{ fontSize: 12, color: '#444' }}>csv/01/20260424_172924/ 폴더의 JSON 파일들</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <PickTooltip pickInfo={tooltip.pickInfo} position={tooltip.position} />

      {/* Viewport grid */}
      <div style={{
        width: '100%', height: '100%',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 2,
      }}>
        {viewports.map((vp) => {
          const stage = stages[vp.stageIndex] ?? null
          const isActive = vp.id === activeViewportId

          return (
            <div
              key={vp.id}
              onClick={() => setActiveViewport(vp.id)}
              style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: isActive ? '2px solid #4682B4' : '2px solid transparent',
                background: '#0d0d1a',
              }}
            >
              {/* Viewport header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '3px 8px', background: '#12122a', flexShrink: 0,
              }}>
                <select
                  value={vp.stageIndex}
                  onChange={e => setViewportStage(vp.id, Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, background: '#1a1a3a', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}
                >
                  {stages.map((s, i) => (
                    <option key={i} value={i}>
                      {String(i + 1).padStart(2, '0')} {s.meta?.stageName ?? `Stage ${i + 1}`}
                    </option>
                  ))}
                </select>

                {stage && (
                  <span style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>
                    N:{stage.healthMetrics?.totals?.nodeCount?.toLocaleString()} E:{stage.healthMetrics?.totals?.elementCount?.toLocaleString()}
                  </span>
                )}

                {viewports.length > 1 && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      delete viewportApiRefs.current[vp.id]
                      removeViewport(vp.id)
                    }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    title="뷰포트 닫기"
                  >×</button>
                )}
              </div>

              {/* Three.js canvas */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ThreeViewport
                  stageData={stage}
                  layers={layers}
                  onReady={(api) => handleReady(vp.id, api)}
                  onPick={handlePick}
                  colorMode={colorMode}
                  freeNodeFilters={freeNodeFilters}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating layer panel — bottom-left over all viewports */}
      <LayerPanel />
    </div>
  )
}
