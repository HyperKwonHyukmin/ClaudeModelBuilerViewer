import { useViewerStore } from '../../store/useViewerStore.js'
import { useStageStore } from '../../store/useStageStore.js'
import LayerPanel from '../LayerPanel.jsx'
import ModelHealthPanel from '../ModelHealthPanel.jsx'

// Model Check 모드 좌측 도크 — 색상 기준(Default / Group / Node Check)·노드 필터·해석 결과 토글(LayerPanel).
// ModelBuilderStudio 처럼 독립 리본으로 분리한 "모델 확인" 전용 도크.
// 그룹 삭제·새로고침 같은 편집 행위는 Edit 리본(GroupManager)으로 일원화하고,
// 여기서는 색상 기준 'Group' 모드로 그룹 확인만 한다(중복 그룹 관리 패널 제거).
export default function ModelCheckPanelDock() {
  const activeViewportId = useViewerStore(s => s.activeViewportId)
  const stages = useStageStore(s => s.stages)
  const lastStage = stages.length > 0 ? stages[stages.length - 1] : null

  return (
    <div style={{
      width: 301, flexShrink: 0,
      background: '#0b0b1e',
      borderRight: '1px solid #1e1e38',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflowY: 'auto', overflowX: 'hidden',
    }}>
      {lastStage ? (
        <>
          <ModelHealthPanel />
          <LayerPanel viewportId={activeViewportId} stageData={lastStage} isEditTargetStage embedded readOnly />
        </>
      ) : (
        <div style={{ margin: '14px 10px', padding: 12, color: '#7a8aaa', fontSize: 12, lineHeight: 1.6 }}>
          파일을 로드하면 색상 기준(Default / Group / Node Check)·노드 필터와 해석 결과 표시가 여기에 나타납니다.
        </div>
      )}
    </div>
  )
}
