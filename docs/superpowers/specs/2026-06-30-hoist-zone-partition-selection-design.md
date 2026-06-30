# 구역 기반 권상 위치 선정 — 설계 문서

> 작성일: 2026-06-30 · 대상: Module Unit Studio (`apps/module-unit-studio`)
> 선행: `2026-06-30-hoist-position-auto-selection-rebuild-design.md` (C# `--optimize` 위임 방식 재구축)

## 1. 목적 / 배경

기존 "권상 위치 자동 선정"은 C# 옵티마이저(`--optimize`)에 노드 선택을 전적으로 위임한다. 동작은 검증됐으나,
사용자가 **어느 구역에서 몇 점을 어떻게 뽑을지 제어할 수 없고** 결과가 불투명하다.

본 설계는 **사용자가 XY 풋프린트를 구역으로 나누고, 각 구역에서 결정적(deterministic)으로 권상점을 선정**하는
2번째 방식을 추가한다. 핵심 요구:

1. XY 평면에서 **X축/Y축 기준으로 구역 분할** → 각 구역 = 한 권상 그룹.
   - 행별 가변 분할: 예) `1행 1구역 · 2행 2구역`, `2x2` 등.
2. 구역당 권상 포인트 **2~4개** 지정.
3. **배관 노드 포함 여부 토글**.
4. 각 구역에서 **되도록 넓은 XY 면적**을 쓰도록 권상점 제안.
5. **Z 우세 레벨 우선**: Z 허용오차 내 노드가 가장 많은 높이를 한 그룹으로 잡는다(Z 차이가 큰 노드를 한 그룹으로
   묶으면 자세안정성 오류 발생). 노드 많은 레벨 → 넓은 면적 확보에 유리.

**제약: C# 엔진은 변경하지 않는다.** 모든 분할·선택은 프론트(JS)에서 수행하고, 결과 검증만 기존 C# 자세안정성
파이프라인(`runStabilityAnalysis`)을 재사용한다.

## 2. 결정 사항 (브레인스토밍 합의)

| 결정 | 선택 |
|---|---|
| 구역 분할 모델 | **행별 가변 분할** (축 → 밴드 수 → 밴드별 하위구역 수) |
| 기존 옵티마이저와의 관계 | **두 방식 병행** — 모달에 탭 2개("구역 기반" 기본 / "옵티마이저 자동" 차선) |
| 결과 검증 | **검증 + 변형 스윕** — 포인트수 변형을 C# 파이프라인으로 검증·랭킹 |
| 포인트 개수 설정 | **전역 설정** (2/3/4), 변형은 자동 스윕 |
| 배관 기본값 | **제외** (토글 on 시 포함) |
| 배관 on/off 스윕 | **안 함** — 사용자 토글로만 제어(스윕은 포인트수만) |
| 3D 구역 경계 오버레이 | **이번 범위 제외** (후속 Phase 2) |

## 3. 확인된 코드 사실(피처 기반)

- **배관 노드 분류 가능(JS)**: `stage.elements[]`의 `e.category === 'Pipe'` → `stage.getProperty(e.propertyId)` →
  `getPipeOuterDiameter(prop)`(= Rod/Tube의 `dims[0]`mm). 요소의 `startNode`/`endNode`를 모으면 배관 노드 집합 생성.
  (`src/three/PipeDiameterOverlay.js:33-90`, `src/data/StageData.js`)
- **기하 API**: `stage.nodeMap: Map<id,{x,y,z,tags}>`(mm), `stage.bbox{minX,maxX,minY,maxY,minZ,maxZ}`,
  `stage.getNodePos(id): THREE.Vector3`(scene 좌표 m). 재사용 가능: `sortQuadConvex`, `computePlaneNormal`,
  `isCollinear`(`src/three/PolygonOverlay.js`). **면적/볼록껍질 유틸은 없음 → 신규 구현.**
- **단일 레이아웃 검증 리포트 형태**(옵티마이저와 다름): `report.stages[]` 각 `{ id, status, summary }`.
  - Stage4 `summary.minAngleDeg`; Stage5 `summary.conflictCount`,`minClearanceMm`;
    Stage6 `summary.isStable`,`deviationMm`,`thresholdMm`,`marginMm`. 전체 상태는 `report.overall?.status`
    또는 stages 상태에서 산출. (`src/store/useStabilityStore.js`, `src/components/StabilityReportPanel.jsx`)
  - 옵티마이저 후보 형태(랭커가 소비): `{ label, score, overallStatus, groupCount, groups[],
    metrics:{ stage6MarginMm, stage6DeviationMm, stage6Status, minSlingAngleDeg, wireConflictCount, failedStages[],
    evaluationMode } }` (`src/data/hoistCandidateRank.js`). **camelCase/PascalCase 모두 허용.**
- **단일 레이아웃 실행 패턴**: `_posture.json`을 구체 그룹으로 저장 → `host.runStabilityAnalysis(posturePath)`
  → `{ ok, report, stabilityPath, exitCode, stderr }`. 페이로드는 `buildPostureStabilityPayload(state, hoisting,
  stage, editedFileName)` (`hoistOptimization` 블록 없이 = 고정 레이아웃 평가). (`useEditStore.js:665-736`,
  `:1043-` )

## 4. 컴포넌트 / 파일 구조

| 파일 | 유형 | 책임 (한 가지) |
|---|---|---|
| `src/data/hoistZonePartition.js` | 신규(순수) | 풋프린트→구역 분할, 노드 배정, 배관 필터, Z 우세 레벨, 면적 최대화 점 선택 |
| `src/data/hoistStabilityAdapter.js` | 신규(순수) | 단일 레이아웃 `report` → `hoistCandidateRank`가 소비하는 후보 형태로 변환 |
| `src/store/useEditStore.js` | 수정 | `zoneSelectHoistPositions(config)` 액션 추가 (기존 `autoSelectHoistPositions`와 병렬, `applyAutoHoistGroups` 재사용) |
| `src/components/HoistZoneConfig.jsx` | 신규 | 구역 설정 폼 (밴드축·밴드 수·밴드별 하위구역·포인트수·배관 토글) |
| `src/components/HoistAutoResultModal.jsx` | 수정 | 탭 2개로 재구성 — 결과 리스트/미리보기/적용 공유 |

순수 모듈(`hoistZonePartition`, `hoistStabilityAdapter`)은 네트워크/스토어/three 의존 없이 단위테스트 가능하게 둔다.
(three의 `sortQuadConvex` 등 순수 벡터 유틸만 선택적으로 사용 — 불가하면 자체 2D 셰이프 정렬로 대체.)

## 5. 자료 구조

```js
// 구역 설정 (HoistZoneConfig → zoneSelectHoistPositions)
ZoneConfig = {
  bandAxis: 'x' | 'y',          // 밴드를 자르는 축. 'y'면 Y범위를 가로 행으로 분할
  bands: number[],              // 각 밴드의 하위구역 수. 예) [1, 2] = 1행1구역·2행2구역, [2,2]=2x2
  pointsPerGroup: 2 | 3 | 4,    // 전역 포인트 수(스윕 기준값)
  includePipe: boolean,         // 배관 노드 후보 포함 여부
}
// 파생: groupCount = sum(bands)  (≤ maxGroups(mode) 강제)

// 구역(셀)
Zone = { id, bandIndex, subIndex, xMin, xMax, yMin, yMax }

// 한 변형의 결과
ZoneLayout = { pointsPerGroup, groups: number[][] }  // groups[zoneIndex] = nodeId[]
```

## 6. 알고리즘 상세

### 6.1 구역 분할 (`partitionZones(stage, config)`)
1. 풋프린트 = `stage.bbox`의 XY 범위 `[minX,maxX] × [minY,maxY]`.
2. `bandAxis`로 풋프린트를 `bands.length`개 **등간격 밴드**로 자른다.
   - `bandAxis==='y'` → Y범위를 밴드 수만큼 등분(행). `bandAxis==='x'` → X범위 등분(열).
3. 각 밴드를 **직교축으로** 그 밴드의 하위구역 수만큼 등분 → 셀.
4. 셀 목록(=Zone[])을 밴드 순서·하위 순서로 안정 정렬. 각 Zone에 0-based `id` 부여.
5. 노드 배정: 각 노드의 XY가 속하는 셀에 매핑(경계는 하한 포함·상한 미만, 마지막 셀은 상한 포함).

### 6.2 배관 필터 (`pipeNodeIds(stage)`)
`stage.elements`를 순회하며 `category==='Pipe'`인 요소의 `startNode`/`endNode`를 Set에 모은다.
`includePipe===false`면 구역 후보 풀에서 이 Set을 제외(구조 노드는 항상 포함).

### 6.3 Z 우세 레벨 (`dominantZLevel(nodes, tolMm, minCount)`)
1. 구역 후보 노드를 Z 오름차순 정렬.
2. **1D 클러스터링**: 인접 노드의 |Δz| ≤ `tolMm`면 같은 레벨로 묶는다(누적은 레벨 시작 기준이 아니라
   "직전 멤버 기준 체이닝"이 아니라 **레벨 대표 Z(첫 멤버) 기준 ±tol**로 묶어 드리프트 방지).
3. `minCount`(= pointsPerGroup) 이상인 레벨 중 **멤버 수 최다** 레벨 채택. 동률이면 멤버의 XY 스팬
   (bbox 대각 길이) 큰 레벨. 그래도 동률이면 Z 작은 레벨.
4. 어떤 레벨도 `minCount` 미만 → `null` 반환(이 구역은 해당 변형 불가).
5. `tolMm` = `state.hoistToleranceMm`(사용자값) 우선, 없으면 `autoHoistToleranceMm(modelHeightMm)`.

### 6.4 면적 최대화 점 선택 (`selectWidestPoints(levelNodes, n)`)
대상 = 우세 레벨 노드의 XY 좌표. `n`개를 XY 면적/스팬 최대가 되게 그리디로 고른다.
- `n===2`: 최원(最遠) 쌍.
- `n===3`: 최원 쌍 + 삼각형 면적(shoelace) 최대화 1점.
- `n===4`: n=3 결과 + 사각형 면적 최대화 1점. 최종 4점은 `sortQuadConvex`로 볼록 정렬(보타이 방지);
  정렬 후 `isCollinear`면 1점 교체 재시도, 불가하면 3점으로 강등.
- 후보 노드 수 < n → 가능한 만큼만 반환(상위에서 변형 불가 처리).
- 면적 계산은 자체 `polygonArea2D(points)`(shoelace, 절댓값) 신규 구현.

### 6.5 레이아웃 빌드 (`buildZoneLayout(stage, config, n)`)
각 Zone마다 (후보 풀 → 6.2 배관 필터 → 6.3 우세 레벨 → 6.4 점 선택) → `groups[zoneId]`.
어떤 Zone이 `null`(불가)이면 그 변형은 **부분 실패**: 빈 그룹은 제외하고 남은 그룹으로 빌드하되,
모드 최소 그룹/노드 요건 미달이면 그 변형 자체를 스킵(상위에서 사유 기록).

## 7. 검증 + 랭킹 (`zoneSelectHoistPositions(config, {onProgress})`)

1. 가드: `mode` 필요, `host.runStabilityAnalysis` 필요(없으면 안내 에러), 모델 로드 필요.
2. `groupCount = sum(config.bands)`가 `maxGroups(mode)` 초과면 에러(상위 UI가 우선 차단).
3. **변형 집합** = 모드 유효 포인트수: Hydro/Goliat `[2,3,4]`, Ceiling `[3,4]`. 단, `config.pointsPerGroup`를
   맨 앞에 두어 사용자가 고른 값을 우선 평가(나머지는 차선 변형).
4. 편집 intents 있으면 `_edited.json` 1회 저장(기존 패턴 동일).
5. 각 변형 `n`:
   - `layout = buildZoneLayout(stage, config, n)`; 빌드 불가면 스킵(사유 기록, progress 갱신).
   - `hoisting = getHoistExport`-호환 구조에 `layout.groups`를 넣어 구성(모드/와이어 길이 포함).
   - `payload = buildPostureStabilityPayload(state, hoisting, stage, editedFileName)` (옵티마이저 블록 없음).
   - `_posture.json` 저장 → `posturePath` 확정(backend remotePath / folder join) → `host.runStabilityAnalysis`.
   - 성공 시 `report` → `adaptStabilityReportToCandidate(report, { groups: layout.groups, pointsPerGroup: n })`
     → 후보 1건. 실패 시 사유 기록.
6. **랭킹은 기존 `rankHoistCandidates` 재사용**: 각 어댑터 후보를 `{ candidates: [cand] }` 형태의 의사(pseudo)
   report로 감싸 배열로 만들고 `rankHoistCandidates([...])`에 넘긴다. `rankHoistCandidates`가 내부에서
   `normalizeCandidate`(camel/Pascal·shape 멱등) + 시그니처 중복제거 + `compareCandidates` 정렬 + 안정 id 부여를
   모두 수행하므로 옵티마이저 탭과 **동일한 랭킹/식별 로직**을 공유한다.
   - **랭킹 우선순위**(기존 `compareCandidates`): PASS>WARN>FAIL → Stage6 여유(margin) 큰 순 → 그룹 수 적은 순
     → score 큰 순. (구역 기반은 변형 간 그룹 수가 같을 수 있어 사실상 margin·score가 결정.)
7. 반환 `{ ok, candidates, hasPass, error }`. 후보 0건이면 `{ ok:false, error: 마지막 사유 }`.
8. **적용은 호출 측이 `applyAutoHoistGroups(toNodeGroups(후보))`로 수행. 비-PASS 자동 적용 없음.**

### 7.1 어댑터 (`adaptStabilityReportToCandidate(report, ctx)`)
- `stages` 배열에서 stage id로 stage4/5/6 추출(`status`,`summary`). camelCase/PascalCase 모두 대응.
- 매핑:
  - `metrics.stage6Status` ← stage6.status; `stage6MarginMm` ← summary.marginMm;
    `stage6DeviationMm` ← summary.deviationMm; `evaluationMode` ← summary.evaluationMode.
  - `minSlingAngleDeg` ← stage4.summary.minAngleDeg.
  - `wireConflictCount` ← stage5.summary.conflictCount(없으면 0).
  - `failedStages` ← status==='fail'인 stage id 목록.
- `overallStatus` ← `report.overall?.status` 우선, 없으면 stages 중 최악(fail>warn>pass).
- `groups` ← `ctx.groups`(우리가 보낸 구체 그룹). `groupCount` ← groups.length. `score`는 없으면 0.
- `label` ← `구역 ${groupCount}그룹 · ${ctx.pointsPerGroup}점`.

## 8. UI (HoistAutoResultModal 재구성)

- 헤더 아래 **탭 바**: `[ 구역 기반 ] [ 옵티마이저 자동 ]`. 기본 활성 = 구역 기반.
- **구역 기반 탭**: 상단 `HoistZoneConfig` 폼 →
  - 밴드축 토글(X/Y), 밴드 수 stepper, 밴드별 하위구역 수 입력(밴드마다 1~maxGroups 내),
    포인트수 라디오(2/3/4, 모드별 유효값만 활성), 배관 포함 토글.
  - `groupCount = Σ하위구역` 실시간 표시 + `maxGroups(mode)` 초과 시 경고·실행 비활성.
  - "구역 기반 평가 실행" 버튼 → `zoneSelectHoistPositions` (진행률 표시) → 결과 리스트.
- **옵티마이저 탭**: 활성화(첫 진입) 시 기존 `autoSelectHoistPositions` 스윕 실행(기존 동작 보존).
- **공유 영역**: 랭킹 결과 리스트(PASS/WARN/FAIL 배지·Stage6 여유·슬링각·간섭·score), 클릭 미리보기
  (`applyAutoHoistGroups` + 스냅샷, 취소 시 복원), "이 안 적용". PASS 없음 배너(차선 안내) 재사용.
- 모드 제약: Ceiling이면 구역 탭은 밴드[1] 고정(1그룹)·포인트수 3/4만. 옵티마이저 탭 그대로.

## 9. 에러 / 엣지 처리

| 상황 | 처리 |
|---|---|
| `host.runStabilityAnalysis` 미지원(구버전 앱/Web) | 구역 탭 실행 시 안내 에러, 크래시 없음 |
| 구역의 모든 Z레벨이 N점 미만 | 그 변형 스킵, 사유 기록. 모든 변형 실패면 `ok:false` |
| 빈/희소 셀(노드 0~소수) | 해당 그룹 제외 후 빌드; 모드 최소 그룹 미달이면 변형 스킵 |
| `groupCount > maxGroups(mode)` | UI에서 실행 비활성 + 경고 문구 |
| PASS 후보 없음 | 차선 후보 노출 + 조정 권장 배너(자동 적용 금지) |
| 4점이 공선(collinear) | 1점 교체 재시도 → 불가 시 3점 강등 |

## 10. 테스트 (TDD)

### `hoistZonePartition.test.js`
- `partitionZones`: `bandAxis='y'`,`bands=[1,2]` → 셀 3개(행1 전폭, 행2 좌/우); `[2,2]` → 2x2 4셀; `bandAxis='x'` 대칭.
- 노드 배정: 경계값·마지막 셀 상한 포함.
- `pipeNodeIds`: category 'Pipe' 요소의 양 끝 노드 수집; 'Structure'는 제외.
- `dominantZLevel`: 레벨 군집 + 최다 멤버 선택 + 동률 XY 스팬 타이브레이크 + minCount 미달 시 null.
- `selectWidestPoints`: n=2 최원쌍, n=3 최대삼각형, n=4 볼록 사각형(보타이 방지), 후보<n.
- `polygonArea2D`: 사각형/삼각형 면적 검증.
- 엣지: 희소 셀 → 부분 실패.

### `hoistStabilityAdapter.test.js`
- `report.stages[].summary`(camelCase) → 후보 metrics 매핑.
- PascalCase 리포트도 동일 결과(회귀 방지).
- `overall` 없을 때 stages 최악으로 overallStatus 산출.
- stage4/5 누락 시 안전 기본값(각도 null, 간섭 0).

### `useEditStore` (zone action 통합 테스트, mock host)
- 변형 스윕 → 후보 랭킹(PASS 우선).
- PASS 없음 → 차선만.
- `host.runStabilityAnalysis` 미지원 → ok:false 안내.
- `groupCount > maxGroups` → 에러.
- 비-PASS 자동 적용 안 함(액션은 후보만 반환).

## 11. 범위 밖 (후속)

- 3D 뷰포트 구역 경계 격자 오버레이(plan view 시각화).
- 구역별 포인트수 개별 지정.
- 배관 on/off 자동 스윕.
- 노드 수 기준(quantile) 분할(현재는 좌표 등간격 분할).
