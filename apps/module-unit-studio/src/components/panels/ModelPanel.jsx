import Sidebar from '../Sidebar.jsx'

// Model 모드 좌측 패널.
// 기존 Sidebar(파일/검색/뷰포트/렌더/레이어/단계/초기화 섹션)를 그대로 재사용한다.
// '편집' 토글 섹션은 Sidebar 에서 제거되어 Edit 모드(EditPanelDock)로 이동했다.
// 폭 리사이즈·setSidebarWidth publish·handleReset 등 모든 로직은 Sidebar 내부에 그대로 유지된다.
export default function ModelPanel() {
  return <Sidebar />
}
