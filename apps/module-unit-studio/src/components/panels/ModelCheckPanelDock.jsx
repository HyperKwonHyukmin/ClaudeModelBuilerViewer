import { useViewerStore } from '../../store/useViewerStore.js'
import { useStageStore } from '../../store/useStageStore.js'
import LayerPanel from '../LayerPanel.jsx'

// Model Check 모드 좌측 도크 — 색상 기준(Default / Node Check / Group)·노드/그룹 필터·해석 결과 토글.
// 기존엔 Model 사이드바(Sidebar)에 embedded 로 붙어 있던 "모델 확인"을, ModelBuilderStudio 처럼
// 독립 리본(Model Check)으로 분리한다. 내용·로직은 LayerPanel 을 그대로 재사용해 동작 변경 0.
export default function ModelCheckPanelDock() {
  const activeViewportId = useViewerStore(s => s.activeViewportId)
  const stages = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null

  return (
    <div style={{
      width: 274, flexShrink: 0,
      background: '#0b0b1e',
      borderRight: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflowY: 'auto', overflowX: 'hidden',
    }}>
      {lastStage ? (
        <LayerPanel viewportId={activeViewportId} stageData={lastStage} isEditTargetStage embedded />
      ) : (
        <div style={{ margin: '14px 10px', padding: 12, color: '#7a8aaa', fontSize: 12, lineHeight: 1.6 }}>
          파일을 로드하면 색상 기준(Default / Node Check / Group)과 노드·그룹 필터가 여기에 표시됩니다.
        </div>
      )}
    </div>
  )
}
