# 구역 미니맵 + 구역별 포인트 수 — 설계 (Design Spec)

> 선행 기능: `2026-06-30-hoist-zone-partition-selection-design.md` (v0.0.78, 구역 기반 권상 위치 선정). 본 문서는 그 위에 두 가지 사용자 요청을 더한다.

## 1. 목표 (Goal)

구역 기반 권상 위치 선정(모달 "구역 기반" 탭)에 다음 두 가지를 추가한다.

1. **구역 분할 시각화** — 사용자가 분할 축(X/Y)·밴드 구성을 바꿀 때 "전체 풋프린트가 어떻게 나뉘는지"(어디가 1행/2행/1열/2열인지)를 즉시 눈으로 확인할 수 있어야 한다.
2. **구역별 포인트 수 개별 지정** — 포인트 수를 전역 1개 값이 아니라 **구역마다 따로**(2/3/4) 지정할 수 있어야 한다.

## 2. 제약 / 비목표 (Constraints / Non-goals)

- **C# 엔진·자세안정성 파이프라인 무변경.** 본 작업은 100% 프론트엔드(JS/JSX).
- **3D 뷰포트 무변경.** 설정 모달이 전체 화면을 덮는 구조라 3D 오버레이는 보이지 않으므로, 시각화는 **모달 안 2D SVG 도식(미니맵)** 으로 한다. (3D 오버레이·모달의 사이드패널 재구조화는 비목표.)
- **변형 스윕 폐기.** 전역 포인트 수를 2/3/4로 자동 탐색하던 `zoneVariantPointCounts` 흐름은 구역별 명시 카운트로 대체되어 의미를 잃으므로 제거한다. 구역 탭은 "설계한 레이아웃을 결정적으로 1회 검증"하는 흐름이 되며 **후보는 1개**가 된다(다중 탐색은 옵티마이저 탭이 담당).
- 새 기하 수학 없음 — 기존 `partitionZones`가 구역 사각형을 모두 산출한다.

## 3. 데이터 모델 변경

설정 객체에서 스칼라 `pointsPerGroup`을 **ragged 배열 `pointsPerZone`** 으로 교체한다.

```
config = {
  bandAxis:   'y' | 'x',
  bands:      number[],        // 밴드별 하위구역 수 (구조 정의)
  pointsPerZone: number[][],   // pointsPerZone[bandIndex][subIndex] = 그 셀의 포인트 수(2~4)
  includePipe: boolean,
}
```

- `pointsPerZone`의 모양은 항상 `bands`와 일치한다: `pointsPerZone[i].length === bands[i]`.
- 유효 포인트 값: 일반 모드 `[2,3,4]`, ceiling 모드 `[3,4]`(직선 2점 불가). 기본값 `3`.
- `bands`가 바뀌면(밴드 추가/삭제, 하위구역 수 변경) `pointsPerZone`를 모양에 맞춰 재조정한다 — 기존 값은 위치별로 보존, 새 셀은 기본 3점, 유효 범위로 클램프.

## 4. 컴포넌트 / 함수 설계

### 4.1 순수 함수 (`src/data/hoistZonePartition.js`에 추가/변경)

- **`reconcilePointsPerZone(bands, prev, validPoints, defaultPoints) → number[][]`** (신규, 순수)
  - 각 밴드 `i`에 대해 길이 `bands[i]`의 배열 생성. `prev[i][j]`가 있으면 유효성 검사 후 사용, 없으면 `defaultPoints`. 모든 값은 `validPoints`로 클램프(가장 가까운 유효값).

- **`zoneCountFor(config, bandIndex, subIndex, defaultPoints) → number`** (신규, 순수)
  - `config.pointsPerZone?.[bandIndex]?.[subIndex] ?? defaultPoints`. 안전 접근자.

- **`buildZonePartitionView(bbox, config, nodeEntries, pipeNodes, opts?) → ViewModel`** (신규, 순수)
  - `partitionZones(bbox, config)` + `assignNodesToZones`로 셀별 노드 수 계산.
  - 반환:
    ```
    {
      viewBox: { x, y, w, h },                 // SVG 좌표계(좌상단 원점, Y 아래로). 모델 XY(mm)→viewBox 매핑.
      cells: [{ bandIndex, subIndex, x, y, w, h, label, points, nodeCount, thin }],
                                               // x,y,w,h = SVG 좌표. label 예: "1행·1". points = zoneCountFor.
                                               // thin = nodeCount < points (옅은 경고).
      dots:  [{ x, y, pipe }],                 // SVG 좌표 노드 점. pipe = pipeNodes.has(id). 최대 ~2000개로 다운샘플.
    }
    ```
  - 축 매핑: X→오른쪽, Y→위. SVG는 Y가 아래로 증가하므로 `svgY = (bbox.maxY - modelY) / spanY * h`로 뒤집는다. `spanX/spanY`가 0이면 1로 보정(degenerate bbox 가드).
  - 라벨: `bandAxis==='y'` → `${bandIndex+1}행·${subIndex+1}`, `bandAxis==='x'` → `${bandIndex+1}열·${subIndex+1}`.

- **`buildZoneLayout(input, config) → {ok,groups} | {ok:false,reason}`** (변경: 3번째 인자 `pointsPerGroup` 제거)
  - 각 구역 `z`에 대해 `count = zoneCountFor(config, z.bandIndex, z.subIndex, 3)`를 사용해 `dominantZLevel(cand, tolMm, count)` → `selectWidestPoints(level.members, count)`.
  - 나머지 동작(배관 필터, `ids.length>=2`만 채택, 전부 실패 시 `ok:false`)은 동일.

### 4.2 미니맵 컴포넌트 (`src/components/ZonePartitionMap.jsx`, 신규)

- presentational. props: `{ view, validPoints, onCycle(bandIndex, subIndex) }`.
- `view`(= `buildZonePartitionView` 결과)만 보고 SVG를 그린다: 풋프린트 외곽 → 셀 사각형(테두리+라벨+`N점` 배지+노드수, `thin`이면 옅은 경고색) → 노드 점(배관 노드는 `includePipe=false`일 때 흐리게) → 축 라벨(X→, Y↑) → 하단 `총 그룹 N / 최대 M`.
- **셀 클릭 → `onCycle(bandIndex, subIndex)`**: 포인트 수를 `validPoints` 안에서 순환(2→3→4→2, ceiling은 3↔4).
- store 비의존. three 비의존.

### 4.3 설정 폼 (`src/components/HoistZoneConfig.jsx`, 변경)

- props에 `partitionInput`(= `{bbox, nodeEntries, pipeNodes}`) 추가. 나머지(`value, onChange, mode, maxGroups`) 유지. **store 비의존 유지.**
- 기존 "구역당 포인트" Row와 하단 groupCount 줄을 제거하고 그 자리에 `ZonePartitionMap`을 둔다(분할 축 토글·밴드 스텝퍼는 위에 그대로).
- `partitionInput`이 있으면 `buildZonePartitionView(...)`로 `view`를 만들어 맵에 전달. 없으면(모델 미로드) 맵 자리에 안내 문구.
- 밴드 편집(`setBand/addBand/removeBand`) 시 `onChange`에 새 `bands`와 함께 `reconcilePointsPerZone`로 맞춘 `pointsPerZone`을 같이 실어 보낸다.
- 셀 클릭 `onCycle(bi, si)` → `pointsPerZone` 깊은 복사 후 해당 셀을 다음 유효값으로 바꿔 `onChange`.

### 4.4 스토어 (`src/store/useEditStore.js`, 변경)

- **`buildHoistPartitionInput(stage, tolMm) → {bbox, nodeEntries, pipeNodes, tolMm}`** (신규 순수 헬퍼, export)
  - `zoneSelectHoistPositions`에서 쓰던 입력 구성을 추출. `nodeEntries = [...stage.nodeMap]`, `pipeNodes = pipeNodeIds(stage.elements ?? [])`.
- **`getZonePartitionInput()`** (신규 store getter/action)
  - `currentStage()` + `hoistToleranceMm ?? auto`로 `buildHoistPartitionInput`을 호출해 반환. 모델 없으면 `null`. 모달이 미니맵용으로 호출.
- **`zoneSelectHoistPositions(config, opts)`** (변경)
  - variants 루프 제거 → `buildHoistPartitionInput`으로 input 구성 → `buildZoneLayout(input, config)` 1회.
  - `!layout.ok`면 `{ok:false, error:layout.reason}`.
  - hoisting/payload/saveJsonArtifact/`runStabilityAnalysis` 1회 → `adaptStabilityReportToCandidate(report, { groups: layout.groups, label })`. `label = \`구역 ${layout.groups.length}그룹 · ${totalPoints}점\`` (totalPoints = 그룹 노드 수 합).
  - `rankHoistCandidates([{candidates:[cand]}])` → 후보 1개. `onProgress`는 `{done:0,total:1}` → `{done:1,total:1}`.
- **`zoneVariantPointCounts` export 제거**(및 관련 테스트 삭제).

### 4.5 모달 (`src/components/HoistAutoResultModal.jsx`, 변경)

- `defaultZoneConfig(mode)`: `pointsPerGroup` 대신 `pointsPerZone` 산출 — 일반 `bands:[1,1]→pointsPerZone:[[3],[3]]`, ceiling `bands:[1]→pointsPerZone:[[3]]`.
- `getZonePartitionInput()`로 `partitionInput`을 얻어(useMemo, stage 의존) `HoistZoneConfig`에 전달.
- `groupCount`(밴드 합)·`zoneRunnable`·후보 카드 로직은 그대로. 진행 표시 total=1로 자연스럽게 동작.

## 5. 데이터 흐름

```
HoistZoneConfig (분할축·밴드 편집, 셀 클릭 포인트수)
   └─(onChange)→ 모달 zoneConfig state {bandAxis,bands,pointsPerZone,includePipe}
모달 getZonePartitionInput() → partitionInput {bbox,nodeEntries,pipeNodes}
   └→ HoistZoneConfig → buildZonePartitionView → ZonePartitionMap (SVG 도식)
[구역 기반 평가 실행]
   └→ zoneSelectHoistPositions(config)
        → buildHoistPartitionInput → buildZoneLayout(input, config)  // per-zone count
        → payload → host.runStabilityAnalysis → adaptStabilityReportToCandidate
        → rankHoistCandidates([{candidates:[cand]}]) → 후보 1개
   └→ 모달이 미리보기/적용(applyAutoHoistGroups) — 기존 흐름 그대로
```

## 6. 에러 / 엣지 케이스

- degenerate bbox(폭 0): viewBox span 0 → 1로 보정, 0 나눗셈 방지.
- 노드 과다: dots 다운샘플(stride)로 최대 ~2000점.
- `pointsPerZone` 누락/형상 불일치: `zoneCountFor`가 기본 3으로 폴백, `buildZoneLayout`는 구역 단위 부분 실패 허용(기존).
- 모델 미로드: `getZonePartitionInput()` null → 맵 대신 안내. 평가 실행은 기존 가드(`모델이 로드되지 않았습니다`)로 차단.
- ceiling: 밴드 1개 고정, validPoints `[3,4]`, 셀 클릭 3↔4.

## 7. 테스트 전략

기존 컨벤션(순수 로직 단위테스트, JSX는 얇게)을 따른다.

- `hoistZonePartition.test.js`: `reconcilePointsPerZone`(보존·기본·클램프·형상), `zoneCountFor`(폴백), per-zone `buildZoneLayout`(구역마다 다른 카운트로 그룹 크기 달라짐), `buildZonePartitionView`(셀 수·라벨·Y뒤집기·degenerate·다운샘플).
- `useEditStore.test.js`: `zoneSelectHoistPositions` 단일 경로(host 1회 호출, 후보 1개), 레이아웃 불가 시 `ok:false`+host 미호출, `getZonePartitionInput` 반환, `buildHoistPartitionInput` 순수. **`zoneVariantPointCounts` 테스트 삭제.**

## 8. 마무리

- 전체 테스트 green + eslint clean + build exit 0 확인.
- 버전 범프 `0.0.78 → 0.0.79` (package.json만).
- `npm run package` → `module-unit-studio-0.0.79.zip`(+`.sha256`).
- StudioProgram 2곳 복사: 백엔드-로컬 `HiTessWorkBenchBackEnd\StudioProgram\`(1순위 스캔), UNC 아카이브. sha256 검증.
- 서버(145) 반영은 zip 수동 복사만(프론트엔드 전용 — git pull·C# 재시작 불필요). 본 작업은 별도 환경(145)이라 사용자 확인 후 수동.

## 9. 영향 파일 요약

| 파일 | 변경 |
|------|------|
| `src/data/hoistZonePartition.js` | `reconcilePointsPerZone`·`zoneCountFor`·`buildZonePartitionView` 추가, `buildZoneLayout` per-zone로 변경 |
| `src/data/hoistZonePartition.test.js` | 신규 함수 + per-zone buildZoneLayout 테스트 |
| `src/components/ZonePartitionMap.jsx` | 신규 — SVG 미니맵(셀 클릭 포인트수 순환) |
| `src/components/HoistZoneConfig.jsx` | "구역당 포인트" Row → 미니맵, pointsPerZone 재조정 |
| `src/store/useEditStore.js` | `buildHoistPartitionInput`·`getZonePartitionInput` 추가, `zoneSelectHoistPositions` 스윕 제거, `zoneVariantPointCounts` 제거 |
| `src/store/useEditStore.test.js` | 단일 경로 테스트로 갱신, zoneVariantPointCounts 테스트 삭제 |
| `src/components/HoistAutoResultModal.jsx` | `defaultZoneConfig` pointsPerZone, partitionInput 전달 |
