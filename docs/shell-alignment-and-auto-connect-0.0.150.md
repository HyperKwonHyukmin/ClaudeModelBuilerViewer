# Module Unit Studio 0.0.150 — ModelBuilder 공통 구성 정렬 + 독립 그룹 자동 연결

사용자 요청(2026-09-11): ① ModelBuilderStudio 와 탭·메뉴 구성이 다른 부분을 맞출 것,
② ModelBuilderStudio 의 "독립적인 그룹 연결점 자동 탐색" 기능을 그대로 가져올 것.

## 사용자 결정 목록

- 좌측 패널은 **6개 탭 전부** 공통 틀(`shell/TabPanel.jsx`)로 통일한다 — Hoist 포함.
- 우측 도크(표시·정보)를 신설하고 **인스펙터·질량/COG·뷰 도구·뷰포트 분할·카메라 동기화**를 모두 담는다.
- 하단 도크를 **탭 하나로 합친다**(구조 해석 결과 / 입력 감사 / 메시지).
- **Save 탭**을 신설하고 BDF 내보내기·검토 보고서를 모은다.
- 뷰포트 힌트 바와 전역 오류 로그 수집을 함께 들여온다.
- **라이트/다크 테마 토글은 가져오지 않는다**(다크 전용 유지).
- 자동 연결은 **Edit 탭**(그룹 관리 아래)에 두고, 기본값·규칙은 ModelBuilder 그대로.

## 바뀐 화면 골격

```
TopMenuBar : Model │ Model Check │ Edit │ Hoist │ Analysis │ Save   (+탭별 상태 점)
┌──────────┬────────────────────────────────────────┬──────────────┐
│ LeftDock │  ViewportHintBar (도구 켰을 때만)       │  RightDock   │
│ TabPanel │  3D 뷰포트 (1~4분할)                    │ 표시 / 정보  │
│  300px   ├────────────────────────────────────────┤ 레일36/펼침280│
│          │  BottomDock : 결과 │ 입력감사 │ 메시지  │  Ctrl+B      │
└──────────┴────────────────────────────────────────┴──────────────┘
```

### 좌측 공통 틀 — `components/shell/TabPanel.jsx`

4구역 고정: **헤더**(아이콘 + 제목 + 목적 한 줄 + `?` 팝오버) → **상태 스트립** → **스크롤 본문**
(`Accordion` 섹션) → **고정 액션 푸터**. `StatusLine` / `Accordion` / `HelpList` / `FooterNote` 는
같은 파일에서 내보낸다.

- 원본은 `palette(theme)`(라이트/다크)를 받지만, 여기서는 **다크 전용** `utils/theme.js` 를 새로 만들어
  `utils/tokens.js`(BG/LINE/INK/STATUS/ACCENT)를 셸이 쓰는 이름으로 다시 묶었다. `palette()` 는 인자를
  무시한다 — 이식 코드가 `palette(theme)` 로 호출해도 동작한다.
- Model 탭만 **폭 드래그**가 있어 `TabPanel` 에 `width`·`extra`(겹치는 요소) prop 을 열었다.
- 기존 패널의 지역 `Section` 컴포넌트는 **호출부를 그대로 두고 껍데기만 `Accordion` 으로 교체**했다
  (Sidebar·AnalyzePanel). 한 줄 교체로 전 섹션이 접기/펼치기를 얻는다.
- Hoist 패널은 내부 STEP 흐름·sticky 실행 버튼·store·단축키를 **건드리지 않았다.** 외곽만 TabPanel 로
  감싸고 헤더의 '가상판'·'초기화' 를 `headerExtra` 로 올렸다.

### 우측 도크 — `components/shell/RightDock.jsx`

- 기본 접힘(세로 레일 36px) → 탭 누르면 280px. 같은 탭 다시 누르면 접힘. `Ctrl+B`. 객체를 선택하면
  '정보' 탭이 자동으로 펼쳐진다. 열림/탭은 `localStorage('moduleunit.rightDock.v1')`.
- **표시** — 표시 방식(음영/반투명/와이어/노드만) · 3D 단면 · 선택만 보기 · 뷰 추가(최대 4) · 카메라 동기화.
- **정보** — 질량·COG 카드 + 선택 객체 정보. `MassSummaryOverlay`·`InspectorPanel` 에 `embedded` 를 추가해
  3D 위 floating 을 걷고 도크 안에서 렌더한다.
- ⚠ **카메라 프리셋·내비게이션 모드는 뷰포트 좌상단 툴바에 그대로 둔다.** 뷰포트마다 다를 수 있는
  조작이라 3D 옆에 있어야 하고, 분할 뷰에서 "어느 뷰에 적용되나"가 흐려진다. 도크에는 전역 설정만 둔다.

### 하단 도크 — `components/shell/BottomDock.jsx`

- 탭 3개: **구조 해석 결과**(`UnitStructuralResultDock embedded`) / **입력 감사**(`dock/AuditTab.jsx`) /
  **메시지**(`dock/MessagesTab.jsx` + `store/useErrorLogStore.js`).
- 이전에는 `UnitStructuralResultDock`(position:fixed)과 `BottomReviewDock`(변환 감사)이 **따로** 쌓여
  화면 아래를 두 겹으로 차지했다. `BottomReviewDock.jsx` 는 삭제하고 내용을 '입력 감사' 탭으로 옮겼다.
- 기본 접힘(36px). grip 드래그로 높이(160px ~ 영역의 85%), `Ctrl+J` 접기/펼치기, `Ctrl+Shift+J` 최대화.
  구조 해석이 시작·완료되면 결과 탭으로 자동 펼침(`openBottomDockAtLeast`).
- 접혀 있어도 탭 버튼 옆 칩으로 상태가 보인다 — 해석 실행중/완료/실패, 감사 요약, 오류 건수.

### 되살린 멀티뷰포트

`2f6281f`(2026-06-23)에서 단일 뷰포트로 축소했던 **뷰 추가/삭제 + 카메라 동기화를 되살렸다.**
`hooks/useCameraSync.js` 는 ModelBuilder 판(직교 카메라용 `camera.zoom` 동기화 포함)을 쓴다 —
ModuleUnit 카메라는 Orthographic 이라 position/quaternion/up/target 만 맞추면 **배율이 어긋난다.**
그리드는 개수별(1 → 전폭, 2 → 좌우, 3~4 → 2×2). 뷰포트 2개 이상일 때만 닫기(×) 버튼이 보인다.

## 자동 연결 (Edit › 자동 연결)

`data/groupAutoConnect.js` + 테스트를 **무수정 이식**했다 — ModuleUnit 의 `StageData`
(nodeMap=원본 mm, propertyMap, finalGroups/groups, rigids, element.category/propertyId)가
ModelBuilder 와 같은 모양이라 14개 테스트가 그대로 통과한다.

- 규칙: 요소 수 최대 그룹 = **주 구조**. 소그룹의 **자유단(Free) 노드**를 반경(기본 450mm, 100~2000)
  안 최근접 **주 구조 Structure 부재 노드**에 RBE2(독립=주 구조, 종속=소그룹)로 잇는다.
  **배관(category='Pipe') 노드는 타깃에서 제외** — 배관에 묶으면 배관이 하중을 받는다.
- 타깃이 이미 다른 RBE 의 종속이면 그 RBE 의 **독립노드로 대체**(표에 '대체' 배지), 체인이면 제외.
- `three/GroupConnectPreview.js` — 라임 점선 + 소그룹 쪽 구(종속)·주 구조 쪽 흰 팔면체(독립).
  hover 행은 흰색으로 커진다. 화면 고정 크기(`screenSpaceMaterial`)라 배율과 무관하게 노드보다 크게 보인다.
- `useEditStore.applyGroupConnectProposals()` — 체크한 후보를 `addRigid` intent 로 커밋한다.
  ⚠ **커밋 직전에 종속 중복을 다시 본다**(`collectDependentNodes`). 후보 계산 이후 수동 RBE 가 생겼을 수
  있고, 한 노드가 두 RBE2 의 종속이면 Nastran **FATAL 2101** 이다. 한 번의 적용은 같은 `batchId` 를
  공유해 **Ctrl+Z 로 통째로** 되돌아간다.
- 전건 실패면 표·미리보기를 남겨 사유를 보며 재시도한다. 일부 성공이면 성공분만 커밋하고 미리보기를 비운다.
- ⚠ ModelBuilder 에는 적용 직후 그룹 목록이 병합돼 보이는 `groupPreview` 가 있지만 ModuleUnit 에는 없다.
  그래서 적용 결과 문구에 "실제 모델 반영은 Hoist 탭의 자세안정성 평가 실행 시점" 을 적어 둔다
  (적용된 RBE 는 기존 `AddRigidPreview` 노란 점선으로 3D 에 바로 보인다).

## 실측 검증 (dev 빌드 + Playwright)

**셸** — 1680×960 에서 6개 탭 전환, 우측 도크 2탭, 하단 도크 3탭, 뷰 분할·동기화:

| 확인 | 결과 |
|------|------|
| 탭별 패널 제목·폭 | Model 301(드래그 가능) · 나머지 300 |
| 아코디언 수 | Model 3 · Model Check 3 · Edit 8 · Analysis 5 · Save 3 |
| 우측·하단 도크 | 6개 탭 모두에서 렌더, 탭 전환 정상 |
| 힌트 바 | Edit=Rigid 연결, Hoist=권상점 선택, 자동 연결 후보 시 전환 |
| 뷰 분할 | viewports 2 · canvas 2 · cameraLinked=true |
| 콘솔/페이지 오류 | 0건 |

**자동 연결** — 주 구조 3,657 요소 + 소그룹 80/78/48/14/1 인 실측 모델
(`20260910_080439_A476854_HiTessModelBuilder/.../05_RigidPostProc.json`):

- 후보 **8건** — `G2 N33→N147 211mm L`, `G3 N297→N4202 193mm L`, `G4 N248→N432 205mm Rod` …
- 건너뜀 집계 — 반경 안 주 구조 노드 없음 10 · 이미 RBE 에 속함 20 · 소그룹 내부 노드 161
- 2건만 체크해 적용 → `addRigid` 2건(remark=AUTOCONNECT, cm=123456, batch 1개), 미리보기 0
- `undoLastIntent()` 1회 → addRigid 0건 (batch 통째로 되돌림)

**해상도 회귀**(0.0.148 의 배율 수정이 깨지지 않았는지) — 4K 100/150/200% · QHD · FHD · 1600 · 1280 ·
1024×640 전부 셸 박스 = 뷰포트, 리본 42px(높이 ≤680 은 36px), 좌측 도크 301(폭 ≤1100 은 266), 스크롤 없음.

테스트: `Test Files 42 passed · Tests 707 passed` (자동 연결 14 + 적용 규칙 4 신규).

## 버전

- Studio: 0.0.150
- WorkBench Studio 참조(`MODULE_STUDIO_VERSION`): 0.0.150

## 복구 기준

- Studio 이전 릴리스: `0.0.149` (Analysis 탭 자세안정성 결과창 숨김)
- 멀티뷰포트 제거 커밋(참고): `2f6281f`
