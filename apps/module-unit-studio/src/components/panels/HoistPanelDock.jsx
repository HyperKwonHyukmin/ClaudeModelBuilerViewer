// Hoist 모드 좌측 패널의 panels/ 경로 진입점.
// 실제 구현은 components/HoistPositionPanel.jsx 에 있다(권상 방식·그룹·노드 칩·Wire 길이·
// 배관 외경 임계·"자세안정성 평가 실행"). 이전에는 3D 뷰포트에 floating 으로 떠 있었으나
// 상단 Hoist 탭 도입으로 좌측 도크(190px)로 이주했다(내부 store/단축키 로직 변경 0 — 외곽만 변경).
// LeftDock 의 import 계약('./panels/HoistPanelDock.jsx')을 만족시키기 위해 그대로 재export 한다.
export { default } from '../HoistPositionPanel.jsx'
