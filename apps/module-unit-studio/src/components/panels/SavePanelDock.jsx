// Save 모드 좌측 패널의 panels/ 경로 진입점.
// 실제 구현은 components/SavePanel.jsx 에 있으며(편집 요약 + Nastran BDF 출력),
// LeftDock 의 import 계약('./panels/SavePanelDock.jsx')을 만족시키기 위해 그대로 재export 한다.
export { default } from '../SavePanel.jsx'
