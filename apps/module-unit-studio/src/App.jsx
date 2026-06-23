import { useEffect } from 'react'
import TopMenuBar from './components/TopMenuBar.jsx'
import LeftDock from './components/LeftDock.jsx'
import ViewportContainer from './components/ViewportContainer.jsx'
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

  // Esc 글로벌 단축키 — 현재 선택된 node/element/rigid/mass 해제 (전 모드 공통).
  // 권상 그룹 비우기는 파괴적 동작이므로 Hoist 탭(activeMode === 'hoist')에서만 수행한다.
  // (표준 §16: Esc 같은 단축키는 관련 편집 모드에서만 제한적으로 동작) — 다른 탭에서 Esc 로
  // 권상 선택이 통째로 날아가던 over-broad 동작을 막는다.
  // 권상 도형(직선/삼각형/사각형) 미리보기는 hoistGroups 에서 파생되므로 그룹을 비우면 자동으로 사라진다.
  // 입력 필드(input/textarea/contenteditable)에 포커스가 있을 때는 무시해 폼 동작과 충돌하지 않도록 함.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      useViewerStore.getState().clearPickedEntity()
      if (useViewerStore.getState().activeMode === 'hoist') {
        const editState = useEditStore.getState()
        for (const id of [1, 2, 3, 4]) editState.clearHoistGroup(id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 상단 메뉴바 activeMode <-> editStore.enabled 동기화.
  // activeMode 가 'edit' 면 편집 모드 ON, 그 외 모드면 OFF.
  // setEnabled(멱등)만 호출하므로 중복 렌더에도 안전하고, EditModeToggle 의 기존 toggle 동작과 충돌하지 않는다.
  // (사용자가 Edit 탭 안에서 토글을 끄는 것은 허용 — 다음 activeMode 변경 시 다시 동기화된다.)
  const activeMode = useViewerStore(s => s.activeMode)
  useEffect(() => {
    const setEnabled = useEditStore.getState().setEnabled
    setEnabled(activeMode === 'edit')
  }, [activeMode])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0d0d1a', color: '#e0e0e0', overflow: 'hidden' }}>
      <TopMenuBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftDock />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* 우측 인스펙터(InspectorPanel)는 dock 컬럼에서 빠지고 ViewportContainer 내부의
              뷰포트 위 floating 정보 창으로 이동했다 — 뷰어가 가로 전폭을 사용한다. */}
          <ViewportContainer />
          <UnitStructuralResultDock />
          <BottomReviewDock />
        </div>
      </div>
    </div>
  )
}
