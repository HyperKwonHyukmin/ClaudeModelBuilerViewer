import { useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ViewportContainer from './components/ViewportContainer.jsx'
import InspectorPanel from './components/InspectorPanel.jsx'
import BottomReviewDock from './components/BottomReviewDock.jsx'
import UnitStructuralResultDock from './components/UnitStructuralResultDock.jsx'
import { useStageStore } from './store/useStageStore.js'
import { useViewerStore } from './store/useViewerStore.js'
import { useEditStore } from './store/useEditStore.js'
import { getHost } from './host/host.js'

export default function App() {
  // Workbench(Electron) 호스트가 부팅 시점에 폴더를 자동 주입하면 즉시 로드한다.
  // Web 단독 모드에서는 host.getInitialFolder() 가 항상 null 이므로 no-op.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const initial = await getHost().getInitialFolder()
        if (cancelled || !initial || initial.files.length === 0) return
        useStageStore.getState().setSourceFolderRef(initial.folderRef)
        useStageStore.getState().loadStages(initial.files)
      } catch (e) {
        console.error('[App] 자동 폴더 로드 실패:', e)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Esc 글로벌 단축키 — 현재 선택된 node/element/rigid/mass + 권상 그룹 노드 모두 해제.
  // 권상 도형(직선/삼각형/사각형) 미리보기는 hoistGroups 에서 파생되므로 그룹을 비우면 자동으로 사라진다.
  // 입력 필드(input/textarea/contenteditable)에 포커스가 있을 때는 무시해 폼 동작과 충돌하지 않도록 함.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      useViewerStore.getState().clearPickedEntity()
      const editState = useEditStore.getState()
      for (const id of [1, 2, 3, 4]) editState.clearHoistGroup(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0d0d1a', color: '#e0e0e0', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <ViewportContainer />
        <UnitStructuralResultDock />
        <BottomReviewDock />
      </div>
      <InspectorPanel />
    </div>
  )
}
