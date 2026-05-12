# PRD — 뷰어 편집 모드 (Edit Mode)

> **버전**: 1.0
> **작성일**: 2026-04-29
> **대상 컴포넌트**: `viewer` (React + Three.js)
> **연계 파이프라인**: `ModuleUnitStudio` (BDF/CSV → StageData JSON 생성기)

---

## 1. 배경 (Background)

현재 `viewer`는 **읽기 전용 진단 도구**로서 `ModuleUnitStudio`가 생성한 StageData JSON을 시각화하고 단계 간 차이(DiffTable)·입력 감사(InputAuditPanel)를 수행한다.

실무에서 검증 중에 다음과 같은 편집 의도가 빈번하게 발생한다.
- 끊겨 있는 두 그룹(group)을 **rigid(RBE2)로 묶고 싶다**.
- 검증 대상에서 제외할 **그룹을 통째로 삭제**하고 싶다.

이를 BDF/CSV 원본을 직접 수정해서 처리하면 (1) 어디를 왜 바꿨는지 추적이 어렵고, (2) 시각적 결과를 본 뒤 다시 빌더를 돌려야 해 사이클이 길다.

## 2. 목적 (Goal)

뷰어 안에서 편집을 **시각적으로 미리보기**할 수 있게 하고, 실제 BDF 변환은 **`ModuleUnitStudio` 파이프라인**이 담당하도록 분리한다. 이를 위해 둘 사이의 매개체로 **`EditIntent` JSON**을 정의한다.

### 비목적 (Non-Goals)
- 뷰어 내부에서 BDF를 직접 쓰지 않는다.
- 노드 좌표 수정(geometry 편집)은 본 PRD 범위 밖.
- 엘리먼트 단면/재료 속성 변경은 추후 phase로 이관.
- 다중 사용자 동시 편집·서버 동기화는 범위 밖.

## 3. 데이터 흐름 (Data Flow)

```
[BDF/CSV 원본]
      │  ModuleUnitStudio
      ▼
[StageData JSON]  (단계별 phase A/B/C/...)
      │  로드
      ▼
┌─────────────────────────────────────┐
│ 뷰어 (Edit Mode 토글)                │
│  ├ StageData (불변)                  │
│  └ EditIntent[] (in-memory store)    │
│        ↑ 사용자 인터랙션              │
│        ↓ 미리보기 derived 씬          │
└─────────────────────────────────────┘
      │  Export
      ▼
[edit-intent.json]
      │  ModuleUnitStudio 재실행
      ▼
[새 BDF + 새 StageData JSON]
      │  뷰어 재로드 → 검증
      ▼
[원하는 결과면 commit, 아니면 추가 편집]
```

핵심 원칙: **`StageData`는 절대 변형하지 않는다.** 매 프레임 `StageData + EditIntent[]` 두 입력으로 derived 씬과 derived 진단(connectivity, healthMetrics 일부)을 다시 빌드한다.

## 4. EditIntent 스키마

### 4.1 파일 포맷
```json
{
  "schemaVersion": "1.0",
  "stageRef": {
    "phase": "C",
    "stageName": "C_Final",
    "sourceTimestamp": "20260429_103833"
  },
  "createdAt": "2026-04-29T13:42:00+09:00",
  "createdBy": "viewer",
  "intents": [
    {
      "id": "01H...",
      "kind": "addRigid",
      "createdAt": "2026-04-29T13:40:11+09:00",
      "params": {
        "independentNode": 1485,
        "dependentNodes": [1489, 1490, 1491],
        "remark": "UBOLT",
        "cm": "123456"
      },
      "validation": { "status": "ok", "warnings": [] }
    },
    {
      "id": "01H...",
      "kind": "deleteGroup",
      "createdAt": "2026-04-29T13:41:02+09:00",
      "params": {
        "groupId": 7,
        "memberNodeCount": 23
      },
      "validation": {
        "status": "warning",
        "warnings": ["RBE #102 의 독립노드 1485 가 삭제 대상에 포함됨"]
      }
    }
  ]
}
```

### 4.2 intent 종류 (Phase 1·2 범위)

| `kind`        | `params` 필드                                                  | 의미                                             |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `addRigid`    | `independentNode`, `dependentNodes[]`, `remark?`, `cm?`        | 새 RBE2 추가 (UBOLT 포함)                        |
| `deleteGroup` | `groupId`, `memberNodeCount`(참조용)                           | 해당 connectivity group 의 노드/엘리먼트 일괄 제거 |

> **주의**: intent 적용 순서는 배열 순서를 따른다 (`deleteGroup` 후 `addRigid`는 다른 의미가 될 수 있음). 파이프라인은 이 순서를 보존해야 한다.

## 5. 기능 요구사항 (Functional Requirements)

### 5.1 Edit Mode 토글
- 헤더 또는 사이드바에 **"편집 모드"** 토글 버튼 (`Sidebar.jsx` 확장).
- 진입 시: 뷰포트 좌상단에 `EDIT MODE` 워터마크, 헤더 색상 변화 (예: 좌측 보더 노란색).
- 최초 진입 시 1회 토스트:
  > "원본 데이터는 변경되지 않습니다. 변경 사항은 Export 후 ModuleUnitStudio 에서 적용됩니다."
- 진입/탈퇴는 `< 100 ms` 내 즉시 전환.

### 5.2 EditIntent 스토어
- 신규 파일: `viewer/src/store/useEditStore.js` (Zustand).
- 상태:
  ```js
  {
    enabled: boolean,
    intents: EditIntent[],
    selectedIntentId: string | null,
  }
  ```
- 액션:
  - `setEnabled(bool)`
  - `addIntent(intent)` — 검증 후 추가, 중복/충돌 차단
  - `removeIntent(id)`
  - `clearIntents()`
  - `selectIntent(id)`
  - `exportToFile()` — 파일 저장 다이얼로그 트리거

### 5.3 Rigid 연결 도구 (`addRigid`)
- 트리거: 편집 모드에서 노드 다중 선택 후 **"Rigid로 묶기"** 버튼.
- 노드 다중 선택: `Shift+Click` 또는 그룹 단위 선택(LayerPanel/3D).
- 다이얼로그:
  - 독립 노드 선택(라디오 또는 첫 클릭 노드)
  - `remark` 입력 (placeholder: `UBOLT`)
  - `cm` 입력 (placeholder: `123456`, 1~6 자리 숫자 검증)
- 미리보기:
  - `buildRigidMesh` 를 합성 RBE 레코드로 한 번 더 호출하여 overlay
  - 색상: 노란 점선 (`#FFD740`, `THREE.LineDashedMaterial`)
  - 기존 RBE 와 시각적으로 구분
- 추가 후 connectivity 재계산 → LayerPanel 의 group count 갱신.

### 5.4 그룹 삭제 도구 (`deleteGroup`)
- 트리거: 편집 모드에서 그룹 선택 후 **"그룹 삭제"** 버튼.
- 그룹 선택: LayerPanel 그룹 리스트 또는 3D 뷰포트 노드 클릭 → 소속 그룹 자동 식별.
- 미리보기:
  - 해당 그룹의 노드/엘리먼트를 빨간색 dim 처리 (alpha 0.3, 채도 ↓)
  - 삭제 시 끊기게 되는 RBE 를 노란 강조선으로 표시
  - 삭제 결과 고립되는 노드(다른 RBE 의 종속이 되는 등)를 별도 강조
- 충돌 검증(§5.6) 결과를 다이얼로그에서 사용자에게 노출.

### 5.5 EditIntent 패널
- 위치: 사이드바 하단 또는 InspectorPanel 옆 별도 탭.
- 표시 항목 (각 intent 행):
  - kind 아이콘 (rigid / trash)
  - 요약 라벨 (`RBE: 1485 ↔ 1489,1490 (UBOLT)`, `그룹 #7 삭제 (23 노드)`)
  - 검증 상태 배지 (`OK` / `WARN` / `ERROR`)
  - 액션: 카메라 포커스, 삭제(취소)
- 헤더 액션: `전체 초기화`, `Export`, intent 카운트.

### 5.6 충돌 / 유효성 검증
intent 추가 시점에 동기적으로 검증 후 `validation` 필드에 결과 저장.

| 검증 룰                                                          | 레벨    |
| ---------------------------------------------------------------- | ------- |
| `addRigid`: 독립=종속 노드가 동일                                  | error   |
| `addRigid`: 종속 노드가 비어 있음                                  | error   |
| `addRigid`: 동일 (독립, 종속) 조합이 이미 존재 (원본 또는 기존 intent) | warning |
| `addRigid`: 참조 노드가 StageData에 존재하지 않음                  | error   |
| `addRigid`: `cm` 형식이 1~6 자리 숫자 아님                         | error   |
| `deleteGroup`: 그룹 ID가 connectivity에 존재하지 않음              | error   |
| `deleteGroup`: 삭제 대상 노드가 다른 RBE 의 독립노드               | warning |
| `deleteGroup`: 결과적으로 isolated 노드가 발생                    | warning |

`error` 는 추가 차단, `warning` 은 사용자 확인 후 추가 허용.

### 5.7 Export
- `Export` 버튼 클릭 → 파일 저장 (브라우저 download).
- 파일명: `edit-intent_<phase>_<YYYYMMDD_HHmmss>.json` (예: `edit-intent_C_20260429_134200.json`).
- 스키마: §4.1.
- Export 직전 `warning` 인 intent 가 있으면 요약 다이얼로그 표시.

### 5.8 Import (선택, Phase 4)
- 이전에 Export 한 intent JSON 을 다시 로드.
- `stageRef` 가 현재 로드된 StageData 와 일치하지 않으면 거절(또는 경고 후 강제 진행).
- 부분 편집 후 다시 Export 가능.

## 6. 비기능 요구사항 (Non-Functional)

| 항목                | 목표                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| 성능 — 미리보기 FPS | 노드 100k+ 모델에서도 30 FPS 유지                                     |
| 성능 — connectivity | 5.6k 노드/5.7k 요소에서 `computeDeleteMask` 평균 **0.556 ms** (16 ms 프레임 예산의 3 %). Web Worker offload 불필요. 100k+ 모델에서도 O(N)이라 16 ms 안. 100만 노드 이상이면 재측정 필요. |
| 메모리              | derived 씬은 dispose 가능, 편집 모드 탈퇴 시 모든 overlay 메모리 해제 |
| 안정성              | EditIntent 검증 실패 시 절대 StageData 가 오염되지 않음               |
| 테스트              | 모든 검증 룰에 단위 테스트, addRigid/deleteGroup 통합 테스트 필수     |

## 7. UX 가드레일

- **편집 모드 워터마크**: 항상 보이게.
- **원본 보존 명시**: 진입 시 토스트, EditIntent 패널 헤더에 항상 "원본 데이터는 변경되지 않습니다" 작은 안내.
- **Export 전 요약**: 미해결 warning 카운트 노출, 사용자가 수긍 후 진행.
- **취소 흐름**: intent 단건 삭제, 전체 초기화 모두 1-click 가능. 실수로 모드를 끄면 intent 는 메모리에 남아 있고 다시 켜면 복구된다.

## 8. 단계별 구현 계획 (Phases)

### Phase 1 — 인프라
- [ ] `useEditStore.js` (Zustand) + EditIntent 타입 정의 (JSDoc)
- [ ] 편집 모드 토글 + 워터마크
- [ ] EditIntent 패널 (목록·삭제·초기화)
- [ ] Export to JSON
- [ ] 단위 테스트: store 액션, 직렬화 round-trip

### Phase 2 — 그룹 삭제
- [ ] LayerPanel 에서 그룹 선택 인터랙션
- [ ] `deleteGroup` intent 생성 + 검증 룰
- [ ] 미리보기 렌더링 (dim, 끊김 강조, 고립 노드 강조)
- [ ] connectivity derived 재계산 (debounce)
- [ ] 통합 테스트: 그룹 삭제 → group count 변화 확인

### Phase 3 — Rigid 연결
- [ ] 노드 다중 선택 (Shift+Click) UX
- [ ] `addRigid` 다이얼로그 (remark, cm 입력 + 검증)
- [ ] 점선 overlay (`buildRigidMesh` 재사용, 색상 분기)
- [ ] 검증 룰 + 다이얼로그 인라인 경고
- [ ] 통합 테스트: addRigid 후 connectivity merge 확인

### Phase 4 — 완성도
- [ ] Import intent JSON
- [ ] 충돌 요약 패널 (모든 warning 한눈에)
- [ ] 인앱 가이드 툴팁
- [ ] 큰 모델용 Web Worker offload (필요 시)

## 9. 파이프라인 측 요구사항 (ModuleUnitStudio)

뷰어 PRD 범위는 아니지만 같이 정해두어야 할 항목.

- intent JSON 을 입력으로 받는 새 명령 (예: `--apply-edit-intent <path>`)
- intent 종류별 BDF 변환 로직:
  - `addRigid` → 새 `RBE2` 카드 삽입 (UBOLT 면 그에 맞는 SET ID/property 조립 규칙 따름)
  - `deleteGroup` → 그룹 멤버 노드의 GRID + 참조 엘리먼트 + 의존 RBE 카드 제거
- 적용 결과를 `trace` 에 카드 단위로 기록 (단계비교에서 가시화)
- 실패 정책: 한 intent 라도 error 면 **전체 롤백** 권장 (부분 적용 금지)
- 적용 전후 BDF 의 byte-level diff 가 가능하도록, 손대지 않은 카드는 원본 그대로 유지

## 10. 위험 요소 (Risks)

| 위험                                                | 완화책                                                       |
| --------------------------------------------------- | ------------------------------------------------------------ |
| BDF rewrite 시 NASTRAN 카드 포맷 깨짐               | 빌더 측에 카드 포맷 보존 단위 테스트, golden file 비교       |
| 매우 큰 모델에서 connectivity 재계산 비용           | debounce, Web Worker, 증분 갱신 검토                         |
| intent 적용 순서 의존성으로 결과가 달라짐           | 배열 순서 보존을 스키마/문서/구현 모두에서 못박음            |
| 뷰어 미리보기 ≠ 파이프라인 실제 적용 결과           | Phase 2/3 종료 시 골든 케이스로 양측 결과 일치 검증         |

## 11. 성공 지표 (Success Metrics)

- 시각적 미리보기와 파이프라인 실제 적용 결과가 동일 케이스에서 **일치** (자동 비교 테스트 통과).
- 편집 1회 사이클 (preview → export → 빌더 재실행 → 재로드 검증) **5분 이내** 가능.
- intent JSON 이 git diff/PR 리뷰에서 사람이 읽고 검토 가능한 수준의 가독성.
- 편집 모드 진입/탈퇴 시 메모리 누수 0 (`disposeScene` 후 Three.js 인스턴스 카운트 변화 없음).

---

## 부록 A — 파일 변경 / 신규 목록 (Phase 1 기준 예상)

| 파일                                              | 상태 | 역할                              |
| ------------------------------------------------- | ---- | --------------------------------- |
| `viewer/src/store/useEditStore.js`                | 신규 | EditIntent 상태 + 액션            |
| `viewer/src/data/EditIntent.js`                   | 신규 | 타입·검증 함수                    |
| `viewer/src/components/EditPanel.jsx`             | 신규 | EditIntent 목록 패널              |
| `viewer/src/components/EditModeToggle.jsx`        | 신규 | 모드 진입 토글 + 워터마크         |
| `viewer/src/components/Sidebar.jsx`               | 수정 | 토글·패널 마운트                  |
| `viewer/src/components/ThreeViewport.jsx`         | 수정 | 다중 선택, derived 씬 마운트      |
| `viewer/src/three/SceneBuilder.js`                | 수정 | EditIntent 입력 받아 overlay 빌드 |
| `viewer/src/three/RigidMesh.js`                   | 수정 | 점선 색상 옵션 추가               |
| `viewer/src/store/useEditStore.test.js`           | 신규 | 단위 테스트                       |

## 부록 B — 향후 확장 후보 (Out of Scope, 메모용)

- `moveNode` (좌표 이동) intent
- `editElementProperty` (단면/재료 변경) intent
- `splitGroup` / `mergeGroup` intent
- intent 그룹화·라벨링 (변경 세트 단위 관리)
- 빌더 적용 결과의 trace 를 다시 뷰어에 끌고 와 단계비교에 인라인 표기
