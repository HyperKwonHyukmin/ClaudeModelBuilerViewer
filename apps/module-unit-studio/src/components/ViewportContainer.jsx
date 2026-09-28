import { useRef, useCallback, useEffect, useState } from 'react'
import { useViewerStore } from '../store/useViewerStore.js'
import { useStageStore } from '../store/useStageStore.js'
import { useStabilityStore } from '../store/useStabilityStore.js'
import ThreeViewport from './ThreeViewport.jsx'
import PickTooltip from './PickTooltip.jsx'
import EditModeWatermark from './EditModeWatermark.jsx'
import HoistInstructionOverlay from './HoistInstructionOverlay.jsx'
import HoistGuideToast from './HoistGuideToast.jsx'
import ViewportShortcutsHelp from './ViewportShortcutsHelp.jsx'
import ViewportEmptyState from './ViewportEmptyState.jsx'
import ViewportHintBar from './shell/ViewportHintBar.jsx'
import StabilityReportPanel from './StabilityReportPanel.jsx'
import { getStabilityIssueElementIds } from '../three/StabilityIssueOverlay.js'
import { useEditStore } from '../store/useEditStore.js'
import useCameraSync from '../hooks/useCameraSync.js'

/**
 * Dynamic viewport grid.
 * 1 viewport → full area
 * 2 viewports → 1×2 row
 * 3-4 viewports → 2×2 grid
 *
 * Each viewport has its own LayerPanel overlay (bottom-left).
 */
export default function ViewportContainer() {
  const { viewports, removeViewport, setActiveViewport, setViewportStage, activeViewportId, layers, cameraLinked, setPickedEntity, pickedEntity, focusSelectionRequest, isolateSelection, renderMode, displayStyle, pickFilters, activeMode } = useViewerStore()
  // 권상 픽킹(Shift+Node)·권상 오버레이는 상단 Hoist 탭에서만 활성화한다.
  // (hoistMode 가 설정된 채 다른 탭에서 Shift+클릭하면 권상 픽킹이 Edit 의 다중선택을 가로채는 것을 방지)
  const hoistActive = activeMode === 'hoist'
  // 가서포트(보강) 픽킹은 Edit 탭에서만 — 버튼이 Edit 좌측 패널로 옮겨졌다.
  const editActive = activeMode === 'edit'
  const supportPickActive = useEditStore(s => s.supportPickActive)
  const { stages } = useStageStore()
  const stabilityReport = useStabilityStore(s => s.report)
  const editEnabled = useEditStore(s => s.enabled)
  const activeVp = viewports.find(v => v.id === activeViewportId)
  const editTargetActive = editEnabled && stages.length > 0 && activeVp != null && activeVp.stageIndex === stages.length - 1

  const viewportApiRefs = useRef({})

  const handleReady = useCallback((id, api) => {
    viewportApiRefs.current[id] = api
  }, [])

  // 여러 뷰를 띄웠을 때 카메라를 함께 움직인다(우측 도크 '동기화' 토글).
  useCameraSync(viewportApiRefs, cameraLinked, viewports)

  const [tooltip, setTooltip] = useState({ pickInfo: null, position: null })
  const [hoverTooltip, setHoverTooltip] = useState({ pickInfo: null, position: null })

  const handlePick = useCallback((pickInfo, e) => {
    setPickedEntity(pickInfo)
    setTooltip(pickInfo ? { pickInfo, position: { x: e.clientX, y: e.clientY } } : { pickInfo: null, position: null })
    // 클릭이 발생하면 hover tooltip 즉시 해제 — selection tooltip 으로 자연스럽게 인계.
    setHoverTooltip({ pickInfo: null, position: null })
  }, [setPickedEntity])

  // 호버 tooltip — 마우스를 element/node 등에 올려두는 동안 실시간 표시.
  // 큰 모델 성능을 위해 ThreeViewport 가 RAF throttle 로 frame 당 최대 1회만 알려준다.
  const handleHover = useCallback((pickInfo, position) => {
    if (!pickInfo) setTooltip({ pickInfo: null, position: null })
    setHoverTooltip(pickInfo ? { pickInfo, position } : { pickInfo: null, position: null })
  }, [])

  // 우선순위: hover 가 있으면 hover (마우스 따라다님), 없으면 selection(click) tooltip.
  const activeTooltip = hoverTooltip.pickInfo ? hoverTooltip : tooltip

  useEffect(() => {
    if (!focusSelectionRequest || !pickedEntity) return
    viewportApiRefs.current[activeViewportId]?.focusEntity?.(pickedEntity)
  }, [focusSelectionRequest, pickedEntity, activeViewportId])

  useEffect(() => {
    if (!stabilityReport || stages.length === 0) return
    const issueElementId = getStabilityIssueElementIds(stabilityReport)[0]
    if (!issueElementId) return
    const stage = stages[stages.length - 1]
    const elem = stage?.elements?.find(e => e.id === issueElementId)
    if (!elem) return
    setPickedEntity({
      type: 'element',
      id: elem.id,
      category: elem.category,
      startNode: elem.startNode,
      endNode: elem.endNode,
      propertyId: elem.propertyId,
      source: 'stabilityIssue',
    })
    window.setTimeout(() => viewportApiRefs.current[activeViewportId]?.focusEntity?.({
      type: 'element',
      id: elem.id,
      startNode: elem.startNode,
      endNode: elem.endNode,
    }), 0)
  }, [stabilityReport, stages, activeViewportId, setPickedEntity])

  if (stages.length === 0) return <ViewportEmptyState />

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <PickTooltip pickInfo={activeTooltip.pickInfo} position={activeTooltip.position} editEnabled={editTargetActive} />
      <EditModeWatermark />
      {hoistActive && <HoistInstructionOverlay />}
      {/* 질량·COG 카드와 선택 정보(인스펙터)는 우측 도크 '정보' 탭으로 이주했다 —
          3D 위에 상시 떠 있던 창 두 개가 모델을 가리지 않게. */}
      <ViewportHintBar />

      {/* Viewport grid — 1개면 전폭, 2개면 좌우, 3~4개면 2×2 */}
      <div style={{
        width: '100%', height: '100%',
        display: 'grid',
        gridTemplateColumns: `repeat(${viewports.length <= 1 ? 1 : 2}, 1fr)`,
        gridTemplateRows: `repeat(${viewports.length <= 2 ? 1 : 2}, 1fr)`,
        gap: 2,
      }}>
        {viewports.map((vp) => {
          const stage = stages[vp.stageIndex] ?? null
          const isActive = vp.id === activeViewportId
          // 편집 의도는 "마지막 단계(보통 Validation)" 기준으로만 적용된다.
          // 다른 단계를 보는 viewport 에서는 미리보기 미적용 + LayerPanel trash 비활성.
          const isEditTargetStage = stages.length > 0 && vp.stageIndex === stages.length - 1

          return (
            <div
              key={vp.id}
              onClick={() => setActiveViewport(vp.id)}
              style={{
                position: 'relative',
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
                {/* 단계가 2개 이상일 때만 viewport 별 단계 선택 dropdown 노출 (원본↔편집모델 비교 등) */}
                {stages.length > 1 && (
                  <select
                    value={vp.stageIndex}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setViewportStage(vp.id, Number(e.target.value))}
                    style={{
                      flex: 1, minWidth: 0, fontSize: 10,
                      background: '#0d0d1a', color: '#9fb4cc',
                      border: '1px solid #2a2a4a', borderRadius: 4,
                      padding: '1px 4px', cursor: 'pointer',
                    }}
                    title="이 뷰포트에 표시할 단계 선택"
                  >
                    {stages.map((s, i) => (
                      <option key={i} value={i}>
                        {String(i + 1).padStart(2, '0')} · {s.sourceFileName || `단계 ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                {stage && (
                  <span style={{ flex: stages.length > 1 ? '0 0 auto' : 1, fontSize: 10, color: '#8aa0b8', whiteSpace: 'nowrap' }}>
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
                    style={{ background: 'none', border: 'none', color: '#8aa0b8', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    title="뷰포트 닫기"
                    aria-label="뷰포트 닫기"
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
                  onHover={handleHover}
                  colorMode={vp.colorMode}
                  freeNodeFilters={vp.freeNodeFilters}
                  groupFilters={vp.groupFilters}
                  selectedEntity={pickedEntity}
                  isolateSelection={isolateSelection}
                  renderMode={renderMode}
                  displayStyle={displayStyle}
                  pickFilters={pickFilters}
                  isEditTargetStage={isEditTargetStage}
                  hoistPickEnabled={hoistActive}
                  supportPickEnabled={editActive && supportPickActive}
                />
              </div>

              {/* 모델 확인(LayerPanel)은 Model 사이드바(Sidebar)로 이주 — 더 이상 뷰포트 floating 아님. */}
              {/* 권상 위치 설정 패널은 좌측 Hoist 도크(LeftDock)로 이주 — 더 이상 뷰포트 floating 아님. */}
              {isEditTargetStage && hoistActive && <HoistGuideToast />}
              {/* 자세안정성 결과 패널은 Hoist 탭에서만 표시(사용자 요청). Analyze 탭은 구조 해석 화면이라
                  이 창이 남아 있으면 뷰를 가린다. panelOpen 은 store 에 남으므로 Hoist 로 돌아오면 다시 보인다.
                  (Analyze 의 "결과 보기" 버튼은 Hoist 탭으로 전환하며 이 패널을 연다.) */}
              {isEditTargetStage && hoistActive && <StabilityReportPanel />}
            </div>
          )
        })}
      </div>


      {/* 단축키 발견성 — 뷰포트 우하단 고정 버튼/팝오버(순수 표시용). 전체 뷰포트 영역에 1개만 렌더. */}
      <ViewportShortcutsHelp />
    </div>
  )
}
