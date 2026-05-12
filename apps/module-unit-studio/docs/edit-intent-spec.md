# EditIntent — ModuleUnitStudio 통합 구현 지침 v1.1

> **대상**: `ModuleUnitStudio` 작업자 — 본 문서만 보고 구현이 가능하도록 작성됨.
> **요약**: viewer(`ModuleUnitStudio`)가 마지막 단계(보통 06_Validation) 폴더에 `<원본>_edit.json` 파일로 편집 의도를 기록한다. 빌더는 그 폴더를 입력으로 받아 `_edit.json` 의 명령을 BDF/CSV 에 적용해 새 결과물을 생성한다.

---

## 0. 한눈에 (TL;DR)

```
[사용자]  viewer 에서 폴더 열기 → 그룹 삭제·Rigid 추가 → "최종 모델 출력"
            ↓
[저장]    같은 폴더에 06_Validation_edit.json 생성
            ↓
[빌더]    ModuleUnitStudio --apply-edit-intent <폴더경로>
            ↓
[검사]    같은 폴더에서 *_edit.json 자동 발견 + 마지막 stage JSON 매칭
            ↓
[적용]    intents[] 순서대로 BDF 변환 (deleteGroup / addRigid)
            ↓
[출력]    <폴더>/edited/  하위에 새 BDF + 새 단계 JSON + 적용 trace.json
```

빌더 구현은 **3 가지 핵심 책임**:
1. `_edit.json` 발견 + 스키마/stageRef 검증
2. `intents[]` 순서대로 적용 (BDF 카드 변환 규칙은 §5)
3. 적용 결과를 trace 와 함께 출력 (롤백 정책 §7)

---

## 1. 데이터 흐름과 입력 파일

### 1.1 viewer 측 export (구현 완료, 빌더는 변경 불가)

사용자는 viewer 에서 `폴더 열기` 로 파이프라인 결과 폴더를 연다. 폴더 구조는 일반적으로:
```
20260429_075027/                 ← 사용자가 viewer 에 연 폴더
├── 00_InputAudit.json
├── 01_Preprocess.json
├── 02_ElementSplit.json
├── 03_NodeMerge.json
├── 04_Connectivity.json
├── 05_RigidPostProc.json
├── 06_Validation.json           ← "마지막 단계" stage JSON (= 편집 대상)
├── 06_Validation.bdf            ← 마지막 단계 BDF (이 BDF 를 베이스로 편집)
└── ...                          ← bdf/f04/f06/op2/log 등 다른 산출물
```

viewer 가 "최종 모델 출력" 클릭 시 **같은 폴더에** 다음 파일을 직접 쓴다:
```
20260429_075027/06_Validation_edit.json
```

파일명 규칙:
- 마지막 단계 stage JSON 의 파일명에서 `.json` 을 떼고 `_edit.json` 을 붙임
- 예: `06_Validation.json` → `06_Validation_edit.json`
- viewer 는 `FileSystemDirectoryHandle.getFileHandle({create: true})` 로 같은 폴더에 직접 쓰므로, 다운로드 폴더가 아닌 **원본 stage JSON 옆에** 항상 위치한다.

### 1.2 빌더 측 진입

**입력**: 위와 같은 폴더 경로 1개.
**자동 검출**:
1. 폴더 안에서 `*_edit.json` 패턴 파일을 찾는다 (보통 1개).
2. 그 파일명에서 `_edit.json` 을 떼면 베이스 stage 파일명: `06_Validation.json`.
3. 그 파일명에서 `.json` 을 떼고 `.bdf` 로 바꾸면 베이스 BDF: `06_Validation.bdf`.

**없으면**: 편집 의도 없음 → 정상 종료(또는 명령이 잘못 호출됐음을 알림).

**둘 이상이면**: 가장 늦게 수정된 것 1개 사용 + 경고 로그.

---

## 2. `_edit.json` JSON 스키마 (고정)

```json
{
  "schemaVersion": "1.0",
  "stageRef": {
    "phase":           "C",
    "stageName":       "Validation",
    "sourceTimestamp": "20260429_075027"
  },
  "createdAt": "2026-04-29T15:42:00+09:00",
  "createdBy": "viewer",
  "intents": [
    {
      "id":         "<uuid 또는 timestamp 기반 fallback>",
      "kind":       "deleteGroup" | "addRigid",
      "createdAt":  "<ISO 8601>",
      "params":     { ... },
      "validation": {
        "status":   "ok" | "warning" | "error",
        "warnings": [ "<문장>" ],
        "errors":   [ "<문장>" ]
      }
    }
  ]
}
```

### 2.1 최상위 필드

| 필드            | 의미                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| `schemaVersion` | 스펙 버전. 빌더는 `"1.0"` 만 처리. 다르면 **error 로 종료** (호환성 깨질 수 있음). |
| `stageRef`      | 의도가 묶인 단계의 지문. `phase` 는 단계 그룹("A"/"B"/"C"), `stageName` 은 단계 이름(예: "Validation"). `sourceTimestamp` 는 폴더 timestamp 와 동일. |
| `createdAt`     | viewer 가 export 한 시각.                                                       |
| `createdBy`     | 항상 `"viewer"`.                                                                |
| `intents[]`     | 적용할 편집 명령의 **순서 있는** 리스트.                                          |

### 2.2 intent 종류별 `params`

| `kind`        | params                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| `deleteGroup` | `{ groupId: int, memberNodeCount?: int }`                                       |
| `addRigid`    | `{ independentNode: int, dependentNodes: int[], remark?: string, cm?: string }` |

**ID 의미** (모두 `stageRef` 가 가리키는 단계의 ID 체계):
- `groupId` → 그 단계 stage JSON 의 `connectivity.groups[i].id` (정수)
- `independentNode` / `dependentNodes` → `nodes[i].id` (정수)
- `remark` → RBE2 카드 식별 태그 (`UBOLT` 등). 없으면 일반 RBE.
- `cm` → RBE2 카드의 CM 필드 (1~6자리, 각 자리 1~6). 없거나 빈 문자열이면 빌더 default 사용.

### 2.3 `validation` 필드

viewer 가 의도 추가 시점에 검증한 결과. 빌더는 다음과 같이 다룬다:
- `status === 'error'` → 빌더는 **즉시 실패 종료** (의도 1개라도 error 면 전체 거절)
- `status === 'warning'` → 진행 가능, 단 trace 에 `INTENT_VALIDATION_WARNING` 으로 기록
- `status === 'ok'` → 정상 진행

빌더는 자체 검증을 **다시 한 번** 수행해야 한다 (viewer 가 본 단계 이후 BDF 가 변했을 가능성). 자체 검증의 error 가 viewer 의 ok 를 덮을 수 있다.

---

## 3. 빌더가 알아야 할 stage JSON 데이터 컨텍스트

`stageRef` 가 가리키는 단계의 JSON 파일 안에서 빌더가 사용해야 할 핵심 필드:

### 3.1 `nodes[]`
```json
{ "id": 1485, "x": 1234.5, "y": 0.0, "z": 0.0, "tags": ["Spc","Boundary"] }
```
- `id` 는 정수 (BDF GRID 카드의 GID 와 1:1).
- `tags` — 빌더가 이 단계에서 분류해 둔 메타. 편집 적용 시 직접 참조하지는 않음.

### 3.2 `elements[]`
```json
{ "id": 100, "type": "BEAM", "category": "Pipe", "startNode": 1, "endNode": 2, "propertyId": 5, "sourceName": "..." }
```
- 편집 의도는 BEAM 만 다룬다 (`type === 'BEAM'`).
- `propertyId` 는 PROP 카드 참조.

### 3.3 `rigids[]`
```json
{ "id": 9001, "independentNode": 1485, "dependentNodes": [1489, 1490], "remark": "UBOLT", "cm": "123456", "sourceName": "..." }
```
- `id` 는 RBE2 카드 EID.
- `cm` 은 종속노드의 구속 자유도(NASTRAN CM 필드 그대로).

### 3.4 `pointMasses[]`
```json
{ "id": 11, "nodeId": 1, "mass": 1.5, "sourceName": "..." }
```
- `nodeId` 가 삭제되면 함께 제거 대상.

### 3.5 `connectivity.groups[]`
```json
{ "id": 0, "nodeIds": [1, 2, 3, ...], "elementIds": [100, 101, ...] }
```
- BEAM + RBE2 union 으로 묶은 connectivity group.
- `deleteGroup.params.groupId` 가 가리키는 대상.
- 빌더가 그 그룹의 `nodeIds`, `elementIds` 를 가져와 BDF 에서 제거하면 된다.

### 3.6 `meta.phase`, `meta.stageName`, `meta.timestamp`
- `_edit.json` 의 `stageRef` 와 일치 검증.
- 불일치 → **error 로 종료** (사용자가 다른 단계 폴더에 잘못 떨어뜨린 _edit.json 을 적용하려는 케이스).

---

## 4. 진입 절차 (의사 코드)

```
function applyEditIntent(folderPath):
  # 4.1 발견
  editFile  = findOne(folderPath, "*_edit.json")    # 없으면 정상 종료
  baseName  = editFile.name.removeSuffix("_edit.json")     # "06_Validation"
  stageJson = readJson(folderPath / (baseName + ".json"))
  baseBdf   = folderPath / (baseName + ".bdf")
  intentDoc = readJson(editFile)

  # 4.2 스키마/매칭 검증
  if intentDoc.schemaVersion != "1.0":     fail("unsupported schemaVersion")
  if intentDoc.stageRef.phase     != stageJson.meta.phase:     fail("stageRef.phase mismatch")
  if intentDoc.stageRef.stageName != stageJson.meta.stageName: fail("stageRef.stageName mismatch")

  # 4.3 자체 검증 — viewer 와 동일한 룰 + BDF 와 stage JSON 의 정합성
  for intent in intentDoc.intents:
    revalidate(intent, stageJson, baseBdf)
    if intent.validation.status == "error":  fail("intent rejected: ...")

  # 4.4 임시 작업 공간 (롤백 안전)
  workdir = mkTemp()
  copy(baseBdf, workdir / "current.bdf")
  derived = clone(stageJson)        # 메모리상 derived StageData

  # 4.5 적용 — 순서대로
  trace = []
  try:
    for intent in intentDoc.intents:
      if intent.kind == "deleteGroup":
        applyDeleteGroup(workdir / "current.bdf", derived, intent, trace)
      elif intent.kind == "addRigid":
        applyAddRigid(workdir / "current.bdf", derived, intent, trace)
  except Error as e:
    rmtree(workdir)
    fail("apply failed, no output written: " + e.message)

  # 4.6 결과 출력
  outDir = folderPath / "edited"
  mkdir(outDir)
  copy(workdir / "current.bdf", outDir / (baseName + ".bdf"))
  writeJson(outDir / (baseName + ".json"), serializeStage(derived))
  writeJson(outDir / "apply-trace.json", trace)
  rmtree(workdir)
```

빌더는 적용 후 viewer 가 다시 그 결과 폴더를 열어 검증할 수 있어야 한다 → **출력 폴더의 파일 이름은 입력과 동일** 하게 유지 (`<baseName>.json`, `<baseName>.bdf`).

---

## 5. NASTRAN BDF 카드 변환 규칙

### 5.1 `deleteGroup` 적용

입력: `groupId` → `connectivity.groups[id == groupId]` → `(nodeIds: Set<int>, elementIds: Set<int>)`

**BDF 변경**:
1. **GRID 카드 제거**: `nodeIds` 에 포함된 GID 를 가진 GRID 카드 모두 삭제.
2. **BEAM 요소 제거**: `elementIds` 에 포함된 EID 를 가진 카드 모두 삭제. (CBAR / CBEAM / 파이프라인이 사용하는 BEAM 카드)
3. **RBE2 처리** — 각 RBE2 카드별로:
   - 독립 노드(GN) 가 `nodeIds` 안 + 모든 종속(GM*) 도 `nodeIds` 안 → **카드 제거** (그룹과 함께 깔끔히 사라짐)
   - 독립이 `nodeIds` 안 + 종속 일부만 `nodeIds` 밖 → **카드 제거** + trace `BROKEN_RBE_REMOVED`
   - 독립이 `nodeIds` 밖 + 종속 일부만 `nodeIds` 안 → **그 종속 GID 만 GM 리스트에서 제거**. 결과 GM 리스트가 비면 카드 제거. trace `RBE_DEP_TRIMMED`
4. **MASS1 / CONM2 등 PointMass 카드 제거**: 마스 카드의 GID 가 `nodeIds` 안이면 삭제. trace `MASS_REMOVED`
5. **SPC, MPC 등 추가 카드**: 본 v1.0 범위 밖 — viewer 가 deleteGroup 시 그룹 노드 외에는 영향 없다고 가정하지만, 빌더는 보수적으로 dangling 참조를 모두 제거 후 `DANGLING_REF_PURGED` trace 기록 권장.

### 5.2 `addRigid` 적용

입력: `{ independentNode, dependentNodes[], remark?, cm? }`

**BDF 변경**:
1. 새 RBE2 카드 1장 생성:
   - 새 EID = 빌더가 부여 (기존 RBE2 EID 와 충돌 없는 가장 작은 미사용 정수 권장)
   - GN = `independentNode`
   - CM = `cm` (없거나 빈 값이면 `123456` 기본값)
   - GM... = `dependentNodes[]`
2. `remark === "UBOLT"` 인 경우:
   - 기존 파이프라인의 UBOLT 처리 규칙 적용 (SET ID 자동 부여, property 연결 등 — 파이프라인 내부 컨벤션 따름)
   - 카드 코멘트로 `$ UBOLT` 표기 (viewer 가 다시 로드 시 `remark === 'UBOLT'` 로 인식할 수 있도록)
3. **중복 차단**: 동일 (GN, GM-set) 조합의 RBE2 가 이미 존재하면 **카드 추가 건너뜀** + trace `DUPLICATE_RIGID_SKIPPED`. 이 경우 파이프라인은 성공으로 처리 (warning).

### 5.3 BDF 형식 보존
- intent 가 손대지 않은 카드는 **원본 BDF 의 바이트 그대로 유지** (필드 정렬·코멘트·줄 순서).
- 추가/제거된 카드만 빌더 기본 포맷터로 작성.
- 결과 BDF 와 원본 BDF 의 `git diff` 가 변경 부분만 보여 사람이 검토 가능해야 한다.

---

## 6. 검증·롤백 정책

| 상황                                                  | 정책                                                  |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `schemaVersion ≠ "1.0"`                               | 즉시 종료, 출력 없음                                   |
| `stageRef.phase/stageName` 불일치                     | 즉시 종료, 출력 없음                                   |
| `intents[i].validation.status == 'error'` 1개라도 존재 | 즉시 종료, 출력 없음                                   |
| 빌더 자체 재검증에서 error                             | 즉시 종료, 출력 없음                                   |
| 적용 도중 1개 카드 변환 실패 (예: GID 충돌)            | **전체 롤백**: workdir 폐기, 출력 없음, 에러 코드 != 0 |
| 적용 도중 warning                                     | 진행 + trace 기록                                      |

**부분 적용 결과를 디스크에 절대 남기지 않는다.** 모든 변경은 임시 디렉터리에 쌓고, 성공 시 원자적으로 `edited/` 로 이동.

---

## 7. trace 기록 규칙

빌더는 `<edited>/apply-trace.json` 을 생성한다:

```json
{
  "schemaVersion": "1.0",
  "appliedAt":     "2026-04-30T09:30:00+09:00",
  "intentFile":    "06_Validation_edit.json",
  "baseStage":     "06_Validation",
  "intents":       <intentDoc.intents 그대로>,
  "operations": [
    {
      "code":     "INTENT_APPLIED",
      "level":    "info",
      "intentId": "<uuid>",
      "kind":     "deleteGroup",
      "details":  "5389 GRIDs / 5670 BEAMs / 23 RBE2s / 8 MASS1s removed (groupId=0)"
    },
    { "code": "BROKEN_RBE_REMOVED",       "level": "warning", "intentId": "<uuid>", "rbeId": 9123, "reason": "GN 1485 in deleted set, GM 1490 alive" },
    { "code": "RBE_DEP_TRIMMED",          "level": "info",    "intentId": "<uuid>", "rbeId": 9234, "removedGM": [1499] },
    { "code": "MASS_REMOVED",             "level": "info",    "intentId": "<uuid>", "massId": 11, "nodeId": 1 },
    { "code": "INTENT_APPLIED",           "level": "info",    "intentId": "<uuid>", "kind": "addRigid", "details": "RBE2 9999 created (UBOLT, GN=1485, GM=[1489,1490,1491], CM=123456)" },
    { "code": "DUPLICATE_RIGID_SKIPPED",  "level": "warning", "intentId": "<uuid>", "details": "existing RBE2 8888 has same GN/GM" },
    { "code": "INTENT_VALIDATION_WARNING","level": "warning", "intentId": "<uuid>", "details": "<viewer warning text>" },
    { "code": "DANGLING_REF_PURGED",      "level": "info",    "card": "SPC 5", "removedGID": 1485 }
  ]
}
```

**필수 코드** (이 모든 케이스를 식별 가능해야 함):
- `INTENT_APPLIED`         — intent 1건 적용 완료
- `BROKEN_RBE_REMOVED`     — 일부 종속만 살아 끊긴 RBE 카드 제거
- `RBE_DEP_TRIMMED`        — RBE 종속 일부만 삭제 (카드는 유지)
- `MASS_REMOVED`           — PointMass 함께 삭제
- `DUPLICATE_RIGID_SKIPPED`— addRigid 중복으로 건너뜀
- `INTENT_VALIDATION_WARNING` — viewer 가 warning 으로 분류한 의도를 그대로 적용
- `DANGLING_REF_PURGED`    — 다른 카드(SPC/MPC 등)에서 참조 끊긴 항목 제거

---

## 8. 결과 cross-check (회귀 보호)

`edited/` 의 새 stage JSON 은 viewer 가 다시 로드해 검증한다. 다음 값이 **반드시 일치**해야 한다:

| 항목         | viewer derived (편집 미리보기 시점)      | 빌더 결과 단계 JSON                         |
| ------------ | ---------------------------------------- | ------------------------------------------- |
| 노드 수       | `deleteMask.derivedNodeCount`            | `healthMetrics.totals.nodeCount`            |
| BEAM 요소 수  | `deleteMask.derivedElementCount`         | `healthMetrics.totals.elementCount` (BEAM)  |
| RBE 수        | `deleteMask.derivedRigidCount`           | `healthMetrics.totals.rigidCount`           |
| PointMass 수  | `deleteMask.derivedPointMassCount`       | `healthMetrics.totals.pointMassCount`       |
| Group 수      | `deleteMask.derivedGroupCount`           | `connectivity.groupCount`                   |

값이 다르면 **빌더 측 회귀**로 분류. 빌더의 자동화 테스트(§9.4)에 포함.

---

## 9. 권장 CLI / 운영

### 9.1 진입 명령
```
ModuleUnitStudio --apply-edit-intent <폴더경로> [--out <출력경로>] [--strict]
```
- 인자 없이 단일 폴더 → 폴더 안에서 `*_edit.json` 자동 발견.
- `--out` 미지정 시 `<폴더>/edited/`.
- `--strict` → viewer warning 도 error 로 승격.

### 9.2 종료 코드
- `0` — 성공 (출력 생성 완료)
- `2` — `_edit.json` 없음 (정상이지만 할 일 없음)
- `64` — 스키마/stageRef 검증 실패
- `65` — intent error (viewer 또는 빌더 검증)
- `70` — 적용 도중 실패 (전체 롤백됨)

### 9.3 stdout/stderr
- stdout: 적용 요약 ("3 intents applied, output at <path>")
- stderr: 실패 원인 + 어떤 intent ID 에서 멈췄는지

### 9.4 자동화 테스트 권장 (골든 케이스)

| #  | 케이스                                  | 기대 결과                                                   |
| -- | --------------------------------------- | ----------------------------------------------------------- |
| G1 | 가장 큰 그룹 1개 삭제                   | 모델 거의 사라짐, derived totals 일치                         |
| G2 | 그룹 1개 + addRigid 1개 동시            | 두 의도 차례로 적용, totals 일치                              |
| G3 | 다중 deleteGroup (그룹 0,1)             | nodeIds/elementIds 합집합 제거                                |
| G4 | 잘못된 cm 형식 ("xyz")                  | 종료 코드 65, 출력 없음                                       |
| G5 | 존재하지 않는 group id                  | 종료 코드 65, 출력 없음                                       |
| G6 | 중복 addRigid                           | 두 번째 건너뜀, trace `DUPLICATE_RIGID_SKIPPED`, 종료 코드 0  |
| G7 | RBE 종속 일부 삭제 (그룹 경계 가로지름) | 카드 유지 + GM trim, trace `RBE_DEP_TRIMMED`                 |
| G8 | 빈 intents[]                            | 종료 코드 2 (`_edit.json` 있는데 의도 0 → 경고)              |

각 케이스는 입력 폴더와 기대 출력 폴더를 git 에 함께 커밋 → diff 비교로 자동 회귀 검출.

---

## 10. 미해결 (v1.x 후보)

다음은 **v1.0 스키마에 들어가지 않는다**. 추가 시 `schemaVersion` 을 `"1.1"` 등으로 올린다:

- `moveNode` (좌표 이동)
- `editProperty` (단면/재료 변경)
- `mergeGroup` / `splitGroup` (connectivity 직접 조작)
- intent 그룹화·라벨링 (변경 세트 단위 관리)
- 빌더 적용 결과를 viewer 에 직접 푸시(웹소켓 등) — 현재는 폴더 재로드로 처리

---

## 부록 A — `_edit.json` 예시

### 예 1: 그룹 0 삭제만
```json
{
  "schemaVersion": "1.0",
  "stageRef": { "phase": "C", "stageName": "Validation", "sourceTimestamp": "20260429_075027" },
  "createdAt": "2026-04-29T15:42:00+09:00",
  "createdBy": "viewer",
  "intents": [
    {
      "id": "01H7X-abc",
      "kind": "deleteGroup",
      "createdAt": "2026-04-29T15:41:50+09:00",
      "params": { "groupId": 0, "memberNodeCount": 5389 },
      "validation": { "status": "ok", "warnings": [], "errors": [] }
    }
  ]
}
```

### 예 2: 그룹 0 삭제 + UBOLT RBE 1개 추가
```json
{
  "schemaVersion": "1.0",
  "stageRef": { "phase": "C", "stageName": "Validation", "sourceTimestamp": "20260429_075027" },
  "createdAt": "2026-04-29T15:50:00+09:00",
  "createdBy": "viewer",
  "intents": [
    {
      "id": "intent-a",
      "kind": "deleteGroup",
      "createdAt": "2026-04-29T15:48:00+09:00",
      "params": { "groupId": 0, "memberNodeCount": 5389 },
      "validation": { "status": "ok", "warnings": [], "errors": [] }
    },
    {
      "id": "intent-b",
      "kind": "addRigid",
      "createdAt": "2026-04-29T15:49:30+09:00",
      "params": {
        "independentNode": 1485,
        "dependentNodes": [1489, 1490, 1491],
        "remark": "UBOLT",
        "cm": "123456"
      },
      "validation": { "status": "ok", "warnings": [], "errors": [] }
    }
  ]
}
```

---

## 부록 B — 폴더 구조 예시

**입력**:
```
20260429_075027/
├── 06_Validation.json
├── 06_Validation.bdf
├── 06_Validation_edit.json     ← viewer 가 생성 (편집 의도)
└── ...                         ← 다른 단계 산출물 (빌더는 마지막 stage 만 사용)
```

**출력** (`--apply-edit-intent` 적용 후):
```
20260429_075027/
├── 06_Validation.json          (그대로 — 입력 보존)
├── 06_Validation.bdf           (그대로)
├── 06_Validation_edit.json     (그대로)
└── edited/                     ← 빌더가 생성
    ├── 06_Validation.bdf       ← 새 BDF (편집 적용 결과)
    ├── 06_Validation.json      ← 새 단계 JSON (재계산된 connectivity/healthMetrics 포함)
    └── apply-trace.json        ← §7 trace
```

viewer 가 `edited/` 폴더를 다시 열면 결과 모델을 검증할 수 있다.

---

## 부록 C — 빌더 측 핵심 의사 코드 (Python 스타일)

```python
def apply_edit_intent(folder: Path) -> int:
    # 1. 발견
    edits = list(folder.glob("*_edit.json"))
    if not edits:
        print("no edit intent file"); return 2
    edits.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    edit_path = edits[0]
    base_name = edit_path.name.removesuffix("_edit.json")  # "06_Validation"
    stage_path = folder / f"{base_name}.json"
    bdf_path   = folder / f"{base_name}.bdf"

    # 2. 검증
    doc = json.loads(edit_path.read_text(encoding="utf-8"))
    if doc["schemaVersion"] != "1.0":
        print(f"unsupported schemaVersion: {doc['schemaVersion']}"); return 64
    stage = json.loads(stage_path.read_text(encoding="utf-8"))
    if doc["stageRef"]["phase"] != stage["meta"]["phase"]:
        print("stageRef.phase mismatch"); return 64
    for intent in doc["intents"]:
        if intent["validation"]["status"] == "error":
            print(f"intent {intent['id']} has error"); return 65

    # 3. 적용 (임시 디렉터리에서)
    workdir = Path(tempfile.mkdtemp())
    try:
        shutil.copy(bdf_path, workdir / "current.bdf")
        derived = copy.deepcopy(stage)
        trace = []
        for intent in doc["intents"]:
            if intent["kind"] == "deleteGroup":
                apply_delete_group(workdir / "current.bdf", derived, intent, trace)
            elif intent["kind"] == "addRigid":
                apply_add_rigid(workdir / "current.bdf", derived, intent, trace)

        # 4. 출력
        out = folder / "edited"
        out.mkdir(exist_ok=True)
        shutil.copy(workdir / "current.bdf", out / f"{base_name}.bdf")
        (out / f"{base_name}.json").write_text(json.dumps(serialize_stage(derived), ensure_ascii=False, indent=2))
        (out / "apply-trace.json").write_text(json.dumps({
            "schemaVersion": "1.0",
            "appliedAt": datetime.now(timezone(timedelta(hours=9))).isoformat(),
            "intentFile": edit_path.name,
            "baseStage": base_name,
            "intents": doc["intents"],
            "operations": trace,
        }, ensure_ascii=False, indent=2))
        return 0
    except Exception as e:
        print(f"apply failed: {e}"); return 70
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def apply_delete_group(bdf: Path, derived: dict, intent: dict, trace: list) -> None:
    gid = intent["params"]["groupId"]
    group = next((g for g in derived["connectivity"]["groups"] if g["id"] == gid), None)
    if group is None:
        raise ValueError(f"groupId {gid} not in connectivity")
    node_set = set(group["nodeIds"])
    elem_set = set(group["elementIds"])

    # BDF 카드 변경 (저수준 BDF 라이브러리 호출 대상)
    remove_grid_cards(bdf, node_set)
    remove_beam_cards(bdf, elem_set)

    # RBE2 처리
    for rbe in list(derived["rigids"]):
        ind_in = rbe["independentNode"] in node_set
        deps   = rbe.get("dependentNodes", [])
        deps_in = [d for d in deps if d in node_set]
        if ind_in and len(deps_in) == len(deps):
            remove_rbe2_card(bdf, rbe["id"])
            derived["rigids"].remove(rbe)
            trace.append({"code": "INTENT_APPLIED", "level": "info", "intentId": intent["id"], "kind": "deleteGroup", "details": f"RBE2 {rbe['id']} fully removed"})
        elif ind_in:
            remove_rbe2_card(bdf, rbe["id"])
            derived["rigids"].remove(rbe)
            trace.append({"code": "BROKEN_RBE_REMOVED", "level": "warning", "intentId": intent["id"], "rbeId": rbe["id"], "reason": "GN in deleted set, some GM alive"})
        elif deps_in:
            new_deps = [d for d in deps if d not in node_set]
            if not new_deps:
                remove_rbe2_card(bdf, rbe["id"])
                derived["rigids"].remove(rbe)
            else:
                update_rbe2_dependents(bdf, rbe["id"], new_deps)
                rbe["dependentNodes"] = new_deps
            trace.append({"code": "RBE_DEP_TRIMMED", "level": "info", "intentId": intent["id"], "rbeId": rbe["id"], "removedGM": deps_in})

    # PointMass
    for pm in list(derived["pointMasses"]):
        if pm["nodeId"] in node_set:
            remove_mass_card(bdf, pm["id"])
            derived["pointMasses"].remove(pm)
            trace.append({"code": "MASS_REMOVED", "level": "info", "intentId": intent["id"], "massId": pm["id"], "nodeId": pm["nodeId"]})

    # derived 갱신
    derived["nodes"]    = [n for n in derived["nodes"]    if n["id"] not in node_set]
    derived["elements"] = [e for e in derived["elements"] if e["id"] not in elem_set]
    recompute_connectivity_and_health(derived)
    trace.append({"code": "INTENT_APPLIED", "level": "info", "intentId": intent["id"], "kind": "deleteGroup",
                  "details": f"{len(node_set)} GRIDs / {len(elem_set)} BEAMs removed (groupId={gid})"})


def apply_add_rigid(bdf: Path, derived: dict, intent: dict, trace: list) -> None:
    p = intent["params"]
    indep = p["independentNode"]
    deps  = sorted(p["dependentNodes"])
    cm    = p.get("cm") or "123456"
    remark = p.get("remark")

    # 중복 차단
    for rbe in derived["rigids"]:
        if rbe["independentNode"] == indep and sorted(rbe["dependentNodes"]) == deps:
            trace.append({"code": "DUPLICATE_RIGID_SKIPPED", "level": "warning", "intentId": intent["id"],
                          "details": f"existing RBE2 {rbe['id']} has same GN/GM"})
            return

    new_eid = next_unused_rbe_eid(derived["rigids"])
    insert_rbe2_card(bdf, new_eid, indep, deps, cm, remark)
    derived["rigids"].append({
        "id": new_eid, "independentNode": indep, "dependentNodes": deps,
        "remark": remark, "cm": cm, "sourceName": "viewer-added",
    })
    if remark == "UBOLT":
        attach_ubolt_set_and_property(bdf, new_eid)   # 파이프라인 내부 컨벤션
    recompute_connectivity_and_health(derived)
    trace.append({"code": "INTENT_APPLIED", "level": "info", "intentId": intent["id"], "kind": "addRigid",
                  "details": f"RBE2 {new_eid} created (remark={remark}, GN={indep}, GM={deps}, CM={cm})"})
```

빌더의 BDF 저수준 함수(`remove_grid_cards`, `insert_rbe2_card`, `recompute_connectivity_and_health` 등)는 이미 파이프라인에 존재하는 도구를 재사용한다고 가정한다. 본 지침은 **호출 순서와 검증 룰** 만 규정한다.
