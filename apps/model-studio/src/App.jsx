import { useEffect } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ViewportContainer from './components/ViewportContainer.jsx'
import InspectorPanel from './components/InspectorPanel.jsx'
import BottomReviewDock from './components/BottomReviewDock.jsx'
import { useStageStore } from './store/useStageStore.js'
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

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#0d0d1a', color: '#e0e0e0', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <ViewportContainer />
        <BottomReviewDock />
      </div>
      <InspectorPanel />
    </div>
  )
}
