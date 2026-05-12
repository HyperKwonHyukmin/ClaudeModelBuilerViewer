# 자세안정성 평가 입력 JSON — 통합 사양 v1.0

> **대상**: 권상 자세안정성(Posture Stability) 해석 프로그램 작업자.
> 본 문서는 `ModuleUnitStudio` 뷰어가 생성하는 두 종류의 입력 JSON 파일(`_posture.json`, `_edited.json`)의 스키마/단위/모드별 규칙을 정의한다. **본 문서만 보고 해석 입력 파서를 구현할 수 있도록 작성됨**.

---

## 0. 한눈에 (TL;DR)

```
[사용자] 뷰어에서 권상 위치 지정 → "자세안정성 평가 실행"
            ↓
[저장]   1) (편집이 있을 때만) <원본>_edited.json    ← 편집 적용 후의 새 모델 phase JSON
         2) <원본>_posture.json                       ← 권상 설정 + 모델 메타
            ↓
[전송]   환경별 우선순위로 같은 폴더에 떨어진다:
         · Workbench(Electron) 백엔드 업로드 채널 (있을 때 1순위)
         · "폴더 열기" 로 받은 로컬 폴더에 직접 쓰기
         · showSaveFilePicker (사용자 선택)
         · 브라우저 다운로드 폴더
            ↓
[해석기] _posture.json 을 입력으로 읽음
         · stageRef.editedFile 이 있으면 그 파일을 모델로 사용 (편집 적용된 새 모델)
         · 없으면 sourceFile 을 모델로 사용 (편집 없음)
            ↓
[해석]   권상 그룹별 케이블 인장/모듈 자세각 계산
            ↓
[출력]   해석 결과 (이 문서 범위 밖)
```

해석기 구현은 **3 가지 핵심 책임**:
1. `*_posture.json` 발견 + 스키마/단위 검증 (§1, §3)
2. `model.totalMassTon` / `model.centerOfGravityMm` 와 `hoisting.groups[].nodes` 좌표로 권상 평가 수행 (§4)
3. `stageRef.editedFile` 이 가리키는 phase JSON 을 모델 정의(노드/요소/속성)로 로드 (§2)

---

## 1. 두 파일의 역할

### 1.1 `<원본>_posture.json` (항상 생성됨, 평가의 1차 입력)

**목적**: 사용자가 뷰어에서 지정한 권상 방식·그룹·와이어 길이와, 모델의 질량/COG 메타를 self-contained 하게 담는다. 해석기는 이 한 파일만으로도 권상 평가에 필요한 핵심 입력을 얻을 수 있다.

**파일명 규칙**: `<sourceFileName 의 .json 제거>_posture.json` (예: `06_Validation_posture.json`)
sourceFileName 이 없으면 `posture-stability_<phase>_<YYYYMMDD_HHmmss>.json` 으로 폴백.

### 1.2 `<원본>_edited.json` (편집 의도가 1개 이상일 때만 생성됨, 평가의 2차 입력)

**목적**: 사용자가 뷰어 편집 모드에서 그룹 삭제/RBE 추가 등 편집 의도(intents) 를 기록했다면, 그 편집을 **이미 적용한** 새로운 phase JSON 을 만들어 같이 남긴다. 해석기는 이 파일을 모델 정의로 사용해야 한다 (원본 sourceFile 이 아니라).

**파일명 규칙**: `<sourceFileName 의 .json 제거>_edited.json` (예: `06_Validation_edited.json`)

**식별**: `meta.edited === true`, `meta.editedAt` 에 ISO timestamp.

> **핵심**: `_posture.json.stageRef.editedFile` 이 `null` 이 아니면 그 파일이 동봉되어 있다 — **해석 시 반드시 그 파일을 모델로 로드**해야 한다. 같은 폴더 안에 있다.

---

## 2. `_edited.json` — 편집 적용된 phase JSON

### 2.1 최상위 스키마

원본 phase JSON (Stage Pipeline 결과) 과 동일한 구조를 따른다. 단, `meta` 에 편집 적용 표식이 추가된다.

```json
{
  "meta": {
    "phase": "C",
    "stageName": "C_Final",
    "timestamp": "20260429_120000",
    "unit": "mm",
    "schemaVersion": "1.1",
    "edited": true,
    "editedAt": "2026-05-06T05:30:12.123Z"
  },
  "nodes":     [ { "id": 1, "x": 0, "y": 0, "z": 0, "tags": [] }, ... ],
  "elements":  [ { "id": 101, "type": "BEAM", "startNode": 1, "endNode": 2, "propertyId": 1 }, ... ],
  "rigids":    [ { "id": 9001, "independentNode": 3, "dependentNodes": [4], "cm": "123456" }, ... ],
  "properties":   [ ... ],
  "materials":    [ ... ],
  "pointMasses":  [ ... ],
  "connectivity": { "groupCount": 2, "largestGroupNodeCount": 12, "isolatedNodeCount": 0,
                    "groups": [ { "id": 0, "nodeIds": [...], "elementIds": [...] }, ... ] },
  "healthMetrics":{ "totals": { ... }, "issues": { ... } },
  "trace": [
    { "stage": "EditApplied", "deletedGroupCount": 1, "addedRigidCount": 1, ... }
  ]
}
```

### 2.2 적용된 편집의 흔적 — `meta.edited`, `trace`

- `meta.edited === true` 와 `meta.editedAt` 으로 **이 파일이 편집 후 산출물**임을 판별.
- `trace[]` 마지막 항목이 `{ stage: "EditApplied", deletedGroupCount, addedRigidCount, ... }` 형태로 들어 있다 — 진단/로깅용. 평가 알고리즘이 굳이 참조할 필요는 없다.

### 2.3 단위

원본 phase JSON 과 동일 — NASTRAN consistent units **mm·N·s·t**:
- 길이/좌표: `mm`
- 질량: `t` (톤). `pointMasses[].mass` 는 톤 단위.
- 밀도: `t/mm³` (예: STEEL ≈ 7.85e-9)
- 단면적: `mm²`

---

## 3. `_posture.json` — 자세안정성 평가 입력

### 3.1 최상위 스키마

```json
{
  "schema": "posture-stability/1.0",
  "timestamp": "20260506_143012",
  "sourceFile": "06_Validation.json",
  "stageRef": {
    "phase": "C",
    "stageName": "C_Final",
    "editedFile": "06_Validation_edited.json"
  },
  "hoisting": {
    "mode":        { "id": "hydro", "label": "Hydro 방식", "equipment": "Hook" },
    "groupCount":  2,
    "wireLengthM": 8,
    "groups": [
      {
        "id": 1,
        "nodeCount": 4,
        "nodes": [
          { "id": 101, "x":   0, "y":   0, "z": 12000 },
          { "id": 102, "x": 500, "y":   0, "z": 12000 },
          { "id": 103, "x": 500, "y": 500, "z": 12000 },
          { "id": 104, "x":   0, "y": 500, "z": 12000 }
        ],
        "centroidMm": { "x": 250, "y": 250, "z": 12000 }
      },
      { "id": 2, "nodeCount": 2, "nodes": [...], "centroidMm": { ... } }
    ]
  },
  "model": {
    "unit":              "mm",
    "nodeCount":         1842,
    "bboxMm":            { "minX": -3000, "maxX": 3000, "minY": -1500, "maxY": 1500, "minZ": 0, "maxZ": 12000 },
    "centerMm":          { "x": 0, "y": 0, "z": 6000 },
    "totalMassTon":      102.5,
    "centerOfGravityMm": { "x": 50, "y": 0, "z": 4250 },
    "massSource":        "stageSummary"
  }
}
```

### 3.2 필드 정의

#### 3.2.1 최상위

| 필드          | 타입               | 설명 |
|---------------|--------------------|------|
| `schema`      | string             | 항상 `"posture-stability/1.0"`. 마이너 변경은 동일 메이저 안에서 backward-compat 유지. |
| `timestamp`   | string             | 파일 생성 시각 — `YYYYMMDD_HHmmss` (로컬 시간). |
| `sourceFile`  | string \| null     | 뷰어가 연 마지막 단계 phase JSON 파일명 (예: `06_Validation.json`). 없으면 null. |
| `stageRef`    | object \| null     | §3.2.2 참고. |
| `hoisting`    | object             | §3.2.3 참고 — 권상 설정. |
| `model`       | object             | §3.2.4 참고 — 모델 메타/질량 properties. |

#### 3.2.2 `stageRef`

| 필드         | 타입            | 설명 |
|--------------|-----------------|------|
| `phase`      | string \| null  | 원본 phase 식별자 (예: `"C"`). |
| `stageName`  | string \| null  | 원본 stage 이름 (예: `"C_Final"`). |
| `editedFile` | string \| null  | **편집 적용된 phase JSON 의 파일명**. `null` 이면 편집 없음 — `sourceFile` 을 모델로 사용. **`null` 이 아니면 같은 폴더 안에 그 파일이 함께 저장돼 있고, 그 파일을 모델로 사용해야 한다**. |

#### 3.2.3 `hoisting`

| 필드          | 타입         | 설명 |
|---------------|--------------|------|
| `mode`        | object       | §3.2.5 — 권상 방식 메타. |
| `groupCount`  | integer ≥ 1  | 그룹 개수. 모드별 상한이 다름 (§3.3). |
| `wireLengthM` | number \| null | 권상 와이어 길이(m). 모드별 기본값(§3.3) — 사용자가 바꿀 수 있음. |
| `groups`      | array        | 그룹 목록 — §3.2.6. **빈 그룹(노드 0개) 은 직렬화에서 제외**되므로 `groups.length ≤ groupCount` 가 가능. 하지만 평가 실행 시점의 검증으로 모든 활성 그룹은 `nodeCount ≥ 모드별 최소` 를 만족함이 보장됨. |

#### 3.2.4 `model`

| 필드                | 타입            | 설명 |
|---------------------|-----------------|------|
| `unit`              | string          | 항상 `"mm"`. |
| `nodeCount`         | integer \| null | 모델 노드 총 개수. |
| `bboxMm`            | object \| null  | `{ minX, maxX, minY, maxY, minZ, maxZ }` (mm). |
| `centerMm`          | object \| null  | bbox 기하중심 `{ x, y, z }` (mm). |
| `totalMassTon`      | number \| null  | 모델 총질량 (톤). 우선 stageSummary, 없으면 자체 계산. |
| `centerOfGravityMm` | object \| null  | 질량중심 좌표 `{ x, y, z }` (mm). |
| `massSource`        | enum string     | `totalMassTon`/`centerOfGravityMm` 의 출처. §3.4 참고. |

#### 3.2.5 `hoisting.mode`

| 필드        | 타입   | 설명 |
|-------------|--------|------|
| `id`        | enum   | `"hydro"` \| `"goliat"` \| `"ceiling"`. |
| `label`     | string | 사용자 노출 라벨 (한국어). 변경 가능 — 식별은 `id` 로. |
| `equipment` | string | `Hook` \| `Trolley` \| `Crane`. 권상 방식별 표준 장비명. |

#### 3.2.6 `hoisting.groups[]`

각 그룹은 다음 형태:

```json
{
  "id": 1,
  "nodeCount": 4,
  "nodes": [
    { "id": 101, "x": 0, "y": 0, "z": 12000 }
  ],
  "centroidMm": { "x": 0, "y": 0, "z": 12000 }
}
```

| 필드         | 타입            | 설명 |
|--------------|-----------------|------|
| `id`         | integer (1..4)  | 그룹 식별자. 모드별 상한(§3.3) 안에서 1부터 연속. |
| `nodeCount`  | integer ≥ 2(또는 ceiling=3) | `nodes.length` 와 동일. |
| `nodes[]`    | array           | 권상점 노드들. 각 항목 `{ id, x, y, z }` — 좌표는 모델 좌표계에서 **mm**. 모델에 없는 노드 ID 가 들어왔으면 `x/y/z` 가 `null` 일 수 있음(이상치 — 정상 흐름에서는 발생하지 않음). |
| `centroidMm` | object \| null  | 그룹 노드들의 단순 기하 중심(좌표 평균). 권상 행렬 계산 보조용. |

> **노드 좌표 출처**: `_edited.json` 이 동봉돼 있으면 그 파일의 노드 좌표를 사용하는 게 맞다. `_posture.json` 의 `groups[].nodes[].x/y/z` 는 *직렬화 시점*의 모델 좌표를 캐시한 것이므로, 편집된 모델과 일관성이 있어야 한다(뷰어가 보장). 해석기가 추가 검증을 하려면 `_edited.json` 의 nodes 와 ID 단위로 대조하면 된다.

### 3.3 모드별 규칙

| 모드 (`mode.id`) | label       | equipment | 그룹 최대 | 그룹당 노드 수 | Wire 기본 길이 |
|------------------|-------------|-----------|-----------|----------------|----------------|
| `hydro`          | Hydro 방식  | Hook      | **4**     | **2 ~ 4**      | **8 m**        |
| `goliat`         | Goliat 방식 | Trolley   | **3**     | **2 ~ 4**      | **24 m**       |
| `ceiling`        | 천장 Crane  | Crane     | **1 (고정)** | **3 또는 4** *(직선 2점 권상 불가)* | **5 m**        |

- **2점**: 직선 권상 (Hydro/Goliat 만 가능, 천장 Crane 불가).
- **3점**: 삼각형 권상.
- **4점**: 사각형 권상. 사용자가 노드를 꼬아서 골라도 뷰어가 볼록 사각형 순서로 자동 정렬 — 단, `nodes[]` 배열 자체는 사용자 선택 순서 그대로 직렬화된다. 해석기가 평면 배치를 가정하려면 자체적으로 다시 정렬해야 한다.

### 3.4 `model.massSource` 의미

| 값                          | 의미 |
|-----------------------------|------|
| `"stageSummary"`            | 같은 폴더의 `00_StageSummary.json` 또는 `*_COG.json` 의 `massProperties` 를 ground truth 로 사용. **가장 정확** — 빌더 파이프라인이 BDF 와 함께 계산한 값. |
| `"computed:beam+pointMass"` | stage summary 가 없어 폴백 — BEAM 자중(단면적 × 길이 × 재질 밀도) + PointMass 합산. |
| `"computed:beamOnly"`       | 폴백 — PointMass 가 없는 모델. BEAM 자중만으로 계산. |
| `"computed:pointMassOnly"`  | 폴백 — BEAM 단면/재질 정보가 부족해 PointMass 만 합산. |
| `"unavailable"`             | 폴백마저 실패. `totalMassTon`/`centerOfGravityMm` 가 모두 `null`. **해석기는 이 경우 평가를 거부하거나 사용자에게 mass 를 직접 입력 받아야 한다**. |

> 폴백 계산은 NASTRAN consistent units 가정. Bar/Rod/Tube 단면만 정확히 계산하고 L/H 등 비대칭 단면은 dims 컨벤션 모호성 때문에 BEAM 폴백에서 제외된다.

---

## 4. 해석 입력 사용 권장 흐름

1. `*_posture.json` 발견 → `schema === "posture-stability/1.0"` 검증.
2. `stageRef.editedFile` 확인:
   - `null` 이 아니면 같은 폴더의 그 파일(예: `06_Validation_edited.json`)을 모델 정의로 로드. (`meta.edited === true` 검증)
   - `null` 이면 `sourceFile` (예: `06_Validation.json`) 을 모델로 로드.
3. `model.totalMassTon` / `model.centerOfGravityMm` 가 `null` 이거나 `model.massSource === "unavailable"` 이면 사용자에게 mass 보강 요청.
4. `hoisting.groups[]` 순회 — 각 그룹의 `nodes[]` 좌표(또는 모델 nodes 에서 ID 로 조회한 좌표)와 `centroidMm`, 그리고 `model.centerOfGravityMm`, `hoisting.wireLengthM` 으로 권상 케이블 인장 분포 / 모듈 자세각을 계산.
5. (선택) `model.bboxMm`, `model.centerMm` 으로 시각화/스케일 결정.

---

## 5. 단위 체크리스트

| 항목                            | 단위 |
|---------------------------------|------|
| `model.bboxMm`, `model.centerMm`, `model.centerOfGravityMm` | **mm** |
| `hoisting.groups[].nodes[].{x,y,z}`, `centroidMm`           | **mm** |
| `hoisting.wireLengthM`                                       | **m** *(주의: 다른 길이는 mm, 와이어만 m)* |
| `model.totalMassTon`                                         | **t (톤)** |
| `_edited.json` 안의 좌표/길이/면적/밀도                      | mm·N·s·t (NASTRAN consistent) |

---

## 6. 호환성 / 진화

- 마이너 추가 필드 (예: `model.inertiaTensor`) 는 `schema` 메이저 변경 없이 추가될 수 있다 — 해석기는 모르는 필드를 무시해야 한다.
- 깨지는 변경(필드 제거, 단위 변경) 은 `schema` 를 `posture-stability/2.0` 으로 올린다.
- `mode.id` 에 미래 권상 방식 추가 가능성 있음 — 해석기는 알 수 없는 `mode.id` 만나면 명시적으로 reject 하거나 사용자에게 확인.

---

## 7. 트러블슈팅 / FAQ

**Q1. `_posture.json.stageRef.editedFile` 이 가리키는 파일이 같은 폴더에 없다면?**
→ 뷰어 export 가 도중 실패한 케이스. 평가를 거부하고 재실행을 요청. 임의로 `sourceFile` 로 폴백하지 말 것 — 사용자가 의도한 모델이 아님.

**Q2. `nodes[].x/y/z` 가 `null` 인 그룹이 있다면?**
→ 권상점으로 지정된 노드 ID 가 모델 노드맵에 없다는 뜻 (편집으로 노드가 삭제됐는데 권상 그룹은 갱신되지 않은 케이스 등). 해석을 중단하고 사용자에게 알림.

**Q3. `_posture.json` 의 그룹 `nodes[]` 좌표와 `_edited.json` 의 같은 ID 노드 좌표가 다르면?**
→ 정상 흐름에서는 발생하지 않음(둘 다 같은 stage 시점에서 직렬화). 다르다면 **`_edited.json` 좌표를 ground truth 로 사용**. `_posture.json` 의 좌표 캐시는 진단 보조 정보.

**Q4. 평가 결과 파일은 어디에 떨어뜨려야 하는가?**
→ 본 문서 범위 밖. 다만 권장: 같은 폴더에 `<원본>_posture-result.json` 형식으로 남기면 후속 도구 통합이 쉬움.

---

## 8. 예시 — 천장 Crane 4점, 편집 없음

```json
{
  "schema": "posture-stability/1.0",
  "timestamp": "20260506_153021",
  "sourceFile": "06_Validation.json",
  "stageRef": {
    "phase": "C",
    "stageName": "C_Final",
    "editedFile": null
  },
  "hoisting": {
    "mode":        { "id": "ceiling", "label": "천장 Crane", "equipment": "Crane" },
    "groupCount":  1,
    "wireLengthM": 5,
    "groups": [
      {
        "id": 1,
        "nodeCount": 4,
        "nodes": [
          { "id": 2001, "x":    0, "y":    0, "z": 12000 },
          { "id": 2002, "x": 3000, "y":    0, "z": 12000 },
          { "id": 2003, "x": 3000, "y": 1500, "z": 12000 },
          { "id": 2004, "x":    0, "y": 1500, "z": 12000 }
        ],
        "centroidMm": { "x": 1500, "y": 750, "z": 12000 }
      }
    ]
  },
  "model": {
    "unit": "mm",
    "nodeCount": 1842,
    "bboxMm": { "minX": -3000, "maxX": 6000, "minY": -1500, "maxY": 3000, "minZ": 0, "maxZ": 12000 },
    "centerMm": { "x": 1500, "y": 750, "z": 6000 },
    "totalMassTon": 87.3,
    "centerOfGravityMm": { "x": 1480, "y": 770, "z": 5520 },
    "massSource": "stageSummary"
  }
}
```

## 9. 예시 — Hydro 2그룹, 편집 적용 후

```json
{
  "schema": "posture-stability/1.0",
  "timestamp": "20260506_160500",
  "sourceFile": "06_Validation.json",
  "stageRef": {
    "phase": "C",
    "stageName": "C_Final",
    "editedFile": "06_Validation_edited.json"
  },
  "hoisting": {
    "mode":        { "id": "hydro", "label": "Hydro 방식", "equipment": "Hook" },
    "groupCount":  2,
    "wireLengthM": 8,
    "groups": [
      { "id": 1, "nodeCount": 2, "nodes": [
          { "id": 1001, "x":    0, "y": 0, "z": 12000 },
          { "id": 1002, "x": 5000, "y": 0, "z": 12000 } ],
        "centroidMm": { "x": 2500, "y": 0, "z": 12000 } },
      { "id": 2, "nodeCount": 3, "nodes": [
          { "id": 1101, "x":    0, "y": 2000, "z": 12000 },
          { "id": 1102, "x": 2500, "y": 2000, "z": 12000 },
          { "id": 1103, "x": 5000, "y": 2000, "z": 12000 } ],
        "centroidMm": { "x": 2500, "y": 2000, "z": 12000 } }
    ]
  },
  "model": {
    "unit": "mm",
    "nodeCount": 1798,
    "bboxMm": { "minX": -100, "maxX": 5100, "minY": -100, "maxY": 2100, "minZ": 0, "maxZ": 12000 },
    "centerMm": { "x": 2500, "y": 1000, "z": 6000 },
    "totalMassTon": 95.2,
    "centerOfGravityMm": { "x": 2480, "y": 980, "z": 5800 },
    "massSource": "computed:beam+pointMass"
  }
}
```

---

## 10. 변경 이력

| 버전 | 날짜       | 내용 |
|------|------------|------|
| 1.0  | 2026-05-06 | 초기 작성 — Hydro/Goliat/Ceiling 3 모드, `_posture.json` + `_edited.json` 2-stage 파이프라인. |
