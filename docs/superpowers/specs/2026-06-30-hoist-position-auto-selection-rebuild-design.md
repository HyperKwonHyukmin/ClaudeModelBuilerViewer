# 권상 위치 자동 선정 재구축 — 설계 명세

- 날짜: 2026-06-30
- 대상 레포: `C:\Coding\WorkBenchSubModule\ModuleUnitStudio` (apps/module-unit-studio)
- 브랜치: `feat/hoist-candidate-nodes`
- 관련 엔진(무수정): `C:\Coding\WorkBenchSubModule\ModuleUnitAnalysis` (`ModuleAnalysis.Cli.exe`)

## 1. 문제 정의

Hoist 리본의 **"권상 위치 자동 선정"** 이 자세안정성 평가에 쓸 수 없는 임의 지점을
즉석에서 뽑는다. 사용자는 "사용할 수 없을 정도로 엉망"이라고 평가했다.

## 2. 진단 (근본 원인)

ModuleUnitAnalysis 엔진에는 **이미 물리 기반 권상위치 최적화기**
(`src/ModuleAnalysis.Stability/Optimizer/HoistPositionOptimizer.cs`)가 존재하며,
실제 Stage 0~6 자세안정성 파이프라인 자체를 점수함수로 사용한다:

- **Stage 6 (전복 판정, 결정적)**: COG 투영이 그룹 apex(=그룹 중심) 다각형 안에 들어오는가.
  1그룹→점(±100mm), 2그룹→선(±100mm), **3그룹↑→다각형(여유 큼)**.
- **Stage 4**: 슬링각 ≥ 60° (얕으면 장력 급증)
- **Stage 5**: 와이어-구조 간섭
- **노드 엄선** (`SelectStructurallyUsefulNodes`): 상위 ~45% 높이(상현재) + 연결도 ≥2 + 단면강성 상위
- **점수** (`Score`): `pass=1e6` 지배 + Stage6 여유 + 슬링각 − (간섭/실패 패널티), 동점 시 **최소 그룹 우선**
- 이미 `viewer:optimizeHoistPositions` IPC → 백엔드 `task_optimize_module_hoist_positions`
  → `ModuleAnalysis.Cli.exe --optimize` 로 **배선·배포 완료**.

반면 프론트(`hoistAutoLayout.js` + `useEditStore.optimizeHoistGroups`)는 이 엔진을 무력화한다:

1. `optimizeHoistGroups`가 **JS seed를 먼저 그대로 적용**(`applyAutoHoistGroups(seed)`) → 즉석 임의점 노출.
2. 옵티마이저에 **`desiredGroupCount`/`pointsPerGroup`을 JS 구역 개수로 강제** → 2구역이면 Line 모드로
   묶여 Stage 6 거의 항상 실패.
3. PASS 후보를 못 찾으면 **에러만 내고 JS 임의점을 그대로 방치**.
4. JS 선정 자체가 구조·Z·대칭·COG 전복과 무관한 순수 2D 기하(반지름40% 원→최근접 스냅→볼록껍질 면적).

핵심 분기(`HoistPositionOptimizer.BuildCandidateLayouts`):
- `DesiredGroupCount > 0` → 그 그룹수로만 후보(강한 노드 선정기 사용).
- `Regions` 있음 → 구역 제약 후보.
- 둘 다 없음 → `BuildLegacyCandidateLayouts`(그룹수 자동 스윕하지만 **Z-상위만**의 약한 노드 선정).

→ "자동 그룹수"와 "강한 노드 선정"이 현재 C#에선 한쪽만 된다.

## 3. 결정 사항 (사용자 승인)

- **범위**: 프론트 재배선 위주. **C# 엔진 무수정**(재빌드·서버 배포 불필요).
- **그룹 수**: 옵티마이저 자동 결정 — 프론트가 방식별 그룹수를 스윕(**Approach B**).
- **PASS 실패 시**: 검증된 것만 적용 + 차선 제시. 검증 안 된 임의점은 절대 적용/표시하지 않음.

### Approach B 채택 이유
"자동 그룹수"와 "강한 노드 선정"을 둘 다 얻으려면, 프론트가 그룹수 k마다
`desiredGroupCount=k`로 `--optimize`를 호출(→ 매 호출이 강한 노드 선정기 사용)하고
전체 결과를 병합·재랭킹한다. C# 위험 0, 품질 최고. 비용은 호출 수 회(진행률로 흡수).

## 4. 원칙

- 단일 진실 소스 = C# `HoistPositionOptimizer`. 프론트는 자체 선정을 하지 않는다.
- 검증(Stage 0~6 평가)된 레이아웃만 사용자에게 보이고, 사용자가 명시 선택할 때만 적용.

## 5. 새 사용자 흐름

1. STEP1에서 **권상 방식 선택(필수)** → "권상 위치 자동 선정" 클릭 (방식 없으면 버튼 비활성).
2. **결과 모달**이 열리며 즉시 스윕 실행 — 진행률 표시("그룹수 4 평가 중 → 3 → 2 …").
3. 결과 표시:
   - PASS 후보가 있으면 최고안을 3D **미리보기**(아직 미적용) + 지표 카드.
   - **랭킹 리스트**: 후보별 배지(PASS/WARN/FAIL · 그룹수 · 포인트수 · Stage6 여유mm · 최소 슬링각° ·
     간섭수 · score). 클릭 시 3D 미리보기 전환.
   - PASS 없음이면 상단에 명확한 경고 + 차선 후보들(WARN/FAIL 사유) + 안내(권상방식/그룹수 조정 권장).
     자동 적용 없음.
4. 사용자가 후보 선택 후 **"이 안 적용"** 을 누를 때만 `hoistGroups`에 커밋(+ `groupCount` 설정).
   이후 기존 STEP2 칩/Shift-클릭 수동 미세조정 가능, STEP4로 재평가.

## 6. 아키텍처 (제거 / 추가 / 수정)

### 제거 (조잡한 JS 선정 일체)
- `src/data/hoistAutoLayout.js` (반지름40%·스냅·볼록껍질 점수) + 해당 테스트
- `src/store/useHoistLayoutStore.js` (구역/분할/제안 상태)
- `src/components/HoistAutoLayoutEditor.jsx` (구역 분할 SVG 모달)

### 추가
- `src/store/useEditStore.js` → `autoSelectHoistPositions({ mode, wireLengthM, onProgress })`
  Approach B 스윕 오케스트레이터. 방식별 그룹수 k마다:
  - posture JSON 작성(`hoistOptimization.desiredGroupCount=k`, `allowedNodeIds`=유효 전체노드,
    `pointsPerGroup`=방식 기본). **그룹 미리 채울 필요 없음**(평가 경로와 분리).
  - `host.optimizeHoistPositions(posturePath)` 호출 → report 수집.
  - k별 posture stem 분리(임시 candidate 파일 충돌 방지), **순차 호출**.
  반환: 병합·정렬된 후보 리스트 + best.
- `src/data/hoistCandidateRank.js` → **순수 함수** `rankHoistCandidates(reports)`:
  여러 호출의 candidates 병합·중복제거·정렬(PASS → Stage6 여유 → 최소그룹 → score). 단위테스트 대상.
- `src/components/HoistAutoResultModal.jsx` → 진행/랭킹/미리보기/적용 모달.
  3D 미리보기는 기존 그룹 색상·`HoistCandidateNodes` 하이라이트 재사용.

### 수정
- `src/components/HoistPositionPanel.jsx` — 자동선정 버튼이 새 모달을 열도록, 방식 선택 필수화,
  옛 "자동 선정 N구역" 요약 줄(`useHoistLayoutStore` 의존) 제거.
- `src/store/useEditStore.js` — 즉석 seed를 적용하던 `optimizeHoistGroups`는 제거/대체.
  커밋은 기존 `applyAutoHoistGroups(선택후보.nodeGroups)` 재사용.

## 7. 그룹수 스윕 범위 (HOIST_MODES.maxGroups 재사용)

- hydro(Hook): k ∈ {1,2,3,4}, 그룹당 기본 3~4점
- goliat(Trolley): k ∈ {1,2,3}, 그룹당 4점(엔진이 Trolley 3점 거부)
- ceiling(Crane): k = 1, 그룹당 3~4점

최대 4회 순차 호출. 진행률 표시로 체감(~수초) 흡수.

## 8. 데이터 계약

- 입력 posture(`buildPostureStabilityPayload` 확장/재사용): `model`(bbox/COG/mass/massSource),
  `hoisting`(mode/wireLengthM), `hoistOptimization`(desiredGroupCount=k, pointsPerGroup, allowedNodeIds).
- 출력 report(엔진): `{ best, candidates[] }`. 각 평가: `score`, `groupCount`, `overallStatus`,
  `metrics`(stage6Status/marginMm/deviationMm/minAngleDeg/conflicts), `groups[].nodeIds`.
  ※ 정확한 JSON 프로퍼티 표기는 구현 시 리포트 DTO로 최종 확인.
- 커밋: 선택 후보의 `groups[].nodeIds` → `applyAutoHoistGroups(nodeGroups)`.

## 9. 에러 / PASS-실패 처리

- 옵티마이저 채널 없음(구버전 WorkBench): 명확한 안내, **아무것도 적용 안 함**.
- 모든 k가 PASS 0: "PASS 후보 없음" 경고 + 차선 N개(사유 포함) 제시, 사용자 명시 선택 시에만 적용(경고 배지).
- COG/질량 unavailable: 평가 불가 사유 안내(기존 massSource 게이트 활용).

## 10. 테스트

- `rankHoistCandidates` 순수함수 단위테스트: 정렬·동점·PASS우선·빈 입력·중복제거.
- `autoSelectHoistPositions`: host mock으로 k회 호출·병합·실패경로 검증(기존 useEditStore.test 패턴).
- 빌드(`npm run build`) 그린 확인.

## 11. 선택적 확장 (코어 이후)

- **평면도(top-view)**: 선택 후보의 COG(G)와 그룹 apex 다각형을 그려
  "COG가 다각형 안에 들어오는지"(Stage 6 핵심 판정)를 시각 확인. 검증 가치 큼.
  코어(랭킹+3D 미리보기) 안정화 후 별도 단계로 추가.

## 12. 범위 밖 / 위험

- C# `ModuleUnitAnalysis` 무수정. 수동 권상 흐름(STEP1~4)·`exportPostureStabilityToFile`·결과패널 유지.
- 위험: 다회 호출 지연(진행률 완화), preload `optimizeHoistPositions` 미노출 구버전(안내 처리),
  병렬 호출 시 임시 candidate 파일 충돌 → **순차 + stem 분리**로 회피.
