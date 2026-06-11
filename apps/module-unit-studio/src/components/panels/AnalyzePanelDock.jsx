// Analyze 모드 좌측 패널의 panels/ 경로 진입점.
// 실제 구현은 components/AnalyzePanel.jsx 에 있으며(StabilityReportPanel/UnitStructuralPanel 진입·요약),
// LeftDock 의 import 계약('./panels/AnalyzePanelDock.jsx')을 만족시키기 위해 그대로 재export 한다.
// (해석 실행/IPC 로직은 기존 플로팅 패널에 보존 — 위임만 수행)
export { default } from '../AnalyzePanel.jsx'
