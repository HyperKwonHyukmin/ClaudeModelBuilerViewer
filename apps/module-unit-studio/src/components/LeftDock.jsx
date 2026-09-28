import { useViewerStore } from '../store/useViewerStore.js'
import ModelPanel from './panels/ModelPanel.jsx'
import ModelCheckPanelDock from './panels/ModelCheckPanelDock.jsx'
import EditPanelDock from './panels/EditPanelDock.jsx'
import HoistPanelDock from './panels/HoistPanelDock.jsx'
import AnalyzePanelDock from './panels/AnalyzePanelDock.jsx'
import SavePanel from './panels/SavePanel.jsx'

// 좌측 도크: activeMode 에 따라 좌측 패널 본문을 분기한다.
// 참조 MooringFittingStudio 의 LeftDock(activeTab 분기) 패턴을 따르되,
// 폭/리사이즈/배경은 각 패널(ModelPanel=Sidebar 재사용, Edit/Analyze 패널)이 책임진다.
// LeftDock 자체는 스크롤/폭 컨테이너를 만들지 않고 '내용 분기'만 담당한다.
export default function LeftDock() {
  const activeMode = useViewerStore(s => s.activeMode)
  if (activeMode === 'modelCheck') return <ModelCheckPanelDock />
  if (activeMode === 'edit')    return <EditPanelDock />
  if (activeMode === 'hoist')   return <HoistPanelDock />
  if (activeMode === 'analyze') return <AnalyzePanelDock />
  if (activeMode === 'save')    return <SavePanel />
  return <ModelPanel />   // 기본 model
}
