# 현장 권상 배치 안내 — 0.0.141

## 범위

현장 초기 배치 검토용 안내이며 정밀 평형해석/작업 승인을 대체하지 않는다.
Strict OFF의 기존 형상 WARN, 간섭 경고, 슬링각 완화 정책은 변경하지 않았다.

1. Hoist 뷰포트에 COG, 권상 정점 XY 투영(점/선/영역), 편심 화살표, COG 오차 범위를 표시한다.
2. 그룹 중심 미리보기와 엔진 정점을 구분한다. 엔진 정점은 모드/높이/그룹/노드 좌표가 현재 입력과 맞을 때만 사용한다. Goliat 미리보기는 Trolley 분할 미반영임을 표시한다.
3. 기준 COG와 공차 고려 최악 코너를 구분한다. 다점 영역 내부를 실제 경사 0°라고 표시하지 않는다. 미입력 공차는 미고려라고 표시한다.
4. 모델 축 기준 이동 방향, G번호 위치 보기, 평면으로 확인, 슬링각·간섭 재확인 안내를 제공한다. 삭제/중복/직접 연결 부재 없는 노드도 안내한다.
5. 추천은 기존 PASS > WARN > FAIL 계층을 유지한다. 같은 계층에서는 영역 밖 COG 또는 간이 경사 1° 이상 등의 확인 사항이 없는 후보가 먼저다. 이후 기존 엔진 점수·형상 비교를 유지한다. 1°는 추천 참고값이고 안전 승인 기준이 아니다. 새 엔진 metric이 없는 구버전 후보는 기존 순서로 처리한다.
6. 그룹 좌표 평균 라벨을 실제 질량중심과 구분하기 위해 '기하 중심'으로 바꿨다.

청록 면은 COG 높이에서 보는 XY 투영이며 물리적인 지지판이 아니다. 경계 여유가 권상 폭의 5% 미만이면 주의 안내하되 판정에는 반영하지 않는다. 모델 질량을 바꾸는 미반영 편집이 있으면 저장/재로드 전까지 안내를 보류한다. 이미 StageData에 반영된 유체 비움/회전은 재계산된 COG로 표시한다.

## 연동 엔진

ModuleAnalysis.Stability v0.1.1:
- WithGroups에서 COG 공차/모델 로드 상태 전달 누락 수정.
- 모든 공차 코너가 내부이면 실제 경계 여유가 가장 작은 코너를 보고.
- 후보에 fieldReviewPriority, tiltAngleDeg, cogInsideHull, cogEnvelopeApplied, interiorMarginMm 전달.
- 다각형 경계상/외부의 표시 여유를 양수 허용오차로 오해하지 않도록 수정.
- 기존 Stage 판정 기준은 유지.

## 검증

- Studio: 676 tests PASS, 변경 대상 ESLint clean, Vite build PASS.
- 엔진: GoldenCaseTests를 제외한 173 tests PASS (StrictEvaluationRelaxation 포함).
- 실제 A505080 입력에 대해 기존/신규 CLI의 Stage 0~7 상태 동일.
- 실제 모델을 연결한 임시 로컬 개발 페이지: 평면/3D, COG 공차, G1 위치 보기, 가이드 숨김/접기 확인. 콘솔 오류 없음.
- 기본 파일 업로드 자동화는 Chrome 확장 파일 URL 권한 때문에 미검증. 임시 QA 페이지와 모델 복사본은 삭제했고 배포에 포함하지 않는다.
- WorkBench frontend build PASS. 원격 운영 서버 업로드/Electron 설치 후 전체 흐름은 별도 확인 필요.

## 복귀 기준

- 최초 요청 시 Studio 전체 체크포인트: `0139173f59af193d81c52c20b4e6e9186a7aed0c` (0.0.139).
- 엔진 개선 전 HEAD: `e3ee71e`.
- WorkBench 페이지 버전 변경 전 체크포인트: `18298cb` (0.0.140).
- 기존 `StudioProgram/module-unit-studio-0.0.140.zip`은 보존.
- 배포 엔진 원본 백업: `C:/Coding/WorkBenchSubModule/ModuleUnitAnalysis/artifacts/rollback-pre-field-guide-20260909.zip`.

가장 안전한 소스 비교는 `git worktree add <새 비교 폴더> 0139173`로 별도 폴더를 만드는 것이다. 현 작업 폴더에 다른 변경이 있으면 reset/checkout으로 덮어쓰지 않는다. 기능을 되돌릴 때는 이번 기능 커밋만 revert하고 다시 빌드한다. 설치 프로그램까지 되돌릴 때는 Studio 버전 핀과 엔진 백업을 함께 복원해야 한다. 다른 세션의 가서포트 UI 변경은 수정/되돌리지 않았다.
