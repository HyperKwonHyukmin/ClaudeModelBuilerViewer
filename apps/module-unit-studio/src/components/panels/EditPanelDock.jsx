// Edit 모드 좌측 패널의 panels/ 경로 진입점.
// 실제 구현은 components/EditModePanel.jsx 에 있으며(EditModeToggle + EditPanel 재배치),
// LeftDock 의 import 계약('./panels/EditPanelDock.jsx')을 만족시키기 위해 그대로 재export 한다.
// (내부 store/단축키 로직은 EditModePanel 및 그 하위 컴포넌트에 보존 — 위임만 수행)
export { default } from '../EditModePanel.jsx'
