---
target: Module Unit Studio 프론트엔드 (상용 FEA 툴 기준)
total_score: 22
p0_count: 2
p1_count: 2
timestamp: 2026-08-25T00-09-28Z
slug: apps-module-unit-studio-src
---
# Module Unit Studio 프론트엔드 Critique

대상: `WorkBenchSubModule/ModuleUnitStudio/apps/module-unit-studio/src` (v0.0.126, ~19,000 LOC)
검증: 코드 리뷰 + Vite dev 서버 실물 구동(1600×900 / 1366×768) + 실제 모델 로드(N:9,893 E:10,027) + impeccable detector

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2.5/4 | "JSON 2/4개 로드" 부분 실패를 설명 없이 통지, 모델명이 화면 어디에도 없음 |
| 2 | Match System / Real World | 2/4 | `zero_length_structure` 등 원시 enum 노출, 빈 상태에 개발자 경로 문자열 |
| 3 | User Control and Freedom | 2/4 | redo 전무, 파괴적 동작 9곳이 `window.confirm`, 변환 감사 도크 접기 불가 |
| 4 | Consistency and Standards | 1/4 | inline style 710 vs Tailwind 1, index.css 토큰 전량 미사용, radius 9종 |
| 5 | Error Prevention | 2/4 | 모델 없이 6개 탭 전부 진입 가능, 빈 상태에서 레이어·회전·초기화 모두 활성 |
| 6 | Recognition Rather Than Recall | 3/4 | 단축키 팝오버·툴바 키 힌트는 우수, 모델 식별자 부재 |
| 7 | Flexibility and Efficiency | 3/4 | F/A/S/D·Ctrl+Z·정렬/검색은 양호, redo·Ctrl+S·측정 도구 없음 |
| 8 | Aesthetic and Minimalist Design | 1/4 | 텍스트 444개 중 395개가 12px, 3D 캔버스가 창 높이의 57% |
| 9 | Error Recovery | 2/4 | 차단 사유 3개를 슬래시로 이어붙인 단일 문자열 |
| 10 | Help and Documentation | 3/4 | 툴팁·단계 설명·개선 권고문이 실질적으로 풍부 |
| **Total** | | **21.5/40** | **개선 필요** |

## Anti-Patterns Verdict

**LLM 평가**: AI가 만든 화면으로 보이지 않는다. 카피가 도메인에 밀착해 있고("슬링각을 60° 이상으로 만드세요"), 워크플로우가 실제 업무 순서를 따르며, 툴팁에 실무 지식이 담겨 있다. 제품 레지스터의 실패 모드는 "AI 티"가 아니라 **레이아웃 예산과 토큰 체계 없이 기능이 하나씩 덧붙어 자란 사내 도구**의 전형이다.

**결정론적 스캔** (`detect.mjs`, exit 0, 6건):
- `side-tab` 2건 — InputAuditPanel:211, LayerPanel:134. LayerPanel 쪽은 사이드바 선택 표시로 정당(오탐). InputAuditPanel 쪽은 실제 문제 — status를 3px 색 막대로만 인코딩해 PRODUCT.md의 "색에 의존하지 않는 판정" 규칙을 위반.
- `layout-transition` 4건 — AnalyzePanel:425, HoistAutoResultModal:452, UnitStructuralPanel:414는 진행바 width 애니메이션(관용적, 오탐). UnitStructuralResultDock:100의 `height 0.18s`만 실질.

**브라우저 계측** (실측):
- 대비 미달 **98/444 (22%)**, 최저 2.45:1
- 포커스 링 **전무** — `outline-style: none`, `box-shadow: none`
- 폰트 크기 8종이 8~13px 5px 대역에 밀집, 11px 미만 33개
- 텍스트 색 35종, border-radius 9종

## 상용 FEA 툴 대비 기능 격차

| 항목 | 상용(Femap/Ansys/Patran) | 현재 | 영향 |
|------|--------------------------|------|------|
| 결과 컨투어 | 연속 색 램프 + min/max 범례 | **이진 2색**(σ≤허용=파랑 / 초과=빨강) | `utilization` 데이터를 보유하고도 버림 — "허용치의 95%" 부재를 못 봄 |
| 변형 형상 | 배율 슬라이더 + 애니메이션 | **없음** (표로만) | 좌굴·과변위 거동을 시각 확인 불가 |
| 측정/조회 | 노드 간 거리·각도 측정 | 없음 | 좌표는 인스펙터로만 |
| 뷰 단축키 | 숫자키 1~6 (업계 표준) | F/A/S/D | 타 툴 사용자 재학습 |
| Undo | 다단계 undo/redo | undo만, redo 없음 | 되돌린 뒤 복구 불가 |
| 그래픽 창 비중 | 통상 75~85% | **57~58%** | 대형 모델 판독 저해 |

3D 단면(clip) 기능은 존재한다.

## What's Working

1. **Hoist 탭의 4단계 워크플로우** — `StepHeader`가 번호·완료 체크·선행조건 disabled를 함께 표현하고, 각 단계가 왜 막혔는지 툴팁으로 설명한다. 상용 툴의 process manager에 준하는 설계다.
2. **단축키 발견성** — 뷰포트 툴바가 `평면^A 정면^S 측면^D 등각^F`처럼 키를 상단첨자로 병기하고, 우하단 팝오버가 11개 단축키를 전부 나열한다. 코드 주석에만 묻어두지 않았다.
3. **레이어 토글의 이중 인코딩** — 색 점 + 라벨 + ON/OFF 텍스트를 함께 써서 PRODUCT.md의 색 비의존 원칙을 지킨다. 다만 ON/OFF가 8px이라 대비에서 탈락한다.
4. **결과 표의 실무 배려** — 컬럼 정렬, element id 검색, "초과만" 필터, 행 클릭 시 3D 포커스, 도크 높이 localStorage 영속화.

## Priority Issues

### [P0] 3D 뷰포트가 창의 57%밖에 안 된다 — 접히지 않는 변환 감사 도크
`BottomReviewDock`은 `inputAudit`이 있으면 무조건 렌더되고 접기·닫기 컨트롤이 없다(버튼은 페이지네이션 ◀▶ 둘뿐). 1600×900에서 309px, 1366×768에서 261px(34%)를 상시 점유한다. 캔버스는 각각 1295×518, 1061×434.

**왜 중요한가**: CSV 임포트 감사는 Model 탭 1회성 검토 대상인데, Hoist에서 노드를 찍을 때도 Analysis에서 결과를 볼 때도 화면 1/3을 계속 가져간다. 9,893 노드 모델을 434px 높이에서 판독해야 한다.

**Fix**: 헤더에 접기 토글 추가(기본 접힘, 문제 건수만 칩으로 노출) + Model/Model Check 탭에서만 펼침. `maxHeight: '36%'`를 사용자 드래그 가능한 값으로 전환(`UnitStructuralResultDock`이 이미 그 패턴을 갖고 있으니 재사용).

**Suggested command**: `/impeccable layout`

### [P0] Hoist 탭의 기본 실행 버튼이 화면 밖에 있다
좌측 도크 `scrollHeight 1027 / clientHeight 726` → **301px가 숨는다**. STEP 4 "자세안정성 평가 실행"의 top이 1366×768에서 949px, 즉 **fold 아래 181px**. 1600×900에서도 top 1002px로 보이지 않는다.

**왜 중요한가**: 이 탭의 존재 이유인 동작이 스크롤해야 나온다. Strict 평가 배너(2줄) + 방식 3종 + Circle Guide + 그룹 카드 + 옵션 2종이 위에서 공간을 다 쓴다.

**Fix**: 실행 버튼을 도크 하단 sticky 푸터로 고정(스크롤과 무관하게 상주). STEP 3 옵션은 기본 접힘(`<details>`)으로 전환. Strict 평가 경고 배너는 2줄 → 1줄 + 툴팁.

**Suggested command**: `/impeccable layout`

### [P1] 접근성: 대비 22% 미달, 포커스 링 전무, 8px 텍스트
- 가시 텍스트 444개 중 **98개(22%)가 WCAG AA 미달**, 최저 2.45:1
- 모델 규모 `N:9,893 E:10,027`이 `#555` 10px → **2.46:1**
- 변환 감사 표의 CSV 행 번호 `L891` 등이 `#555` 12px → 2.46:1
- 레이어 ON/OFF가 **8px**, OFF는 2.45:1
- 버튼 포커스 시 `outline-style: none`·`box-shadow: none` → **키보드 포커스가 전혀 보이지 않는다**. index.css의 `@apply outline-ring/50`이 색과 폭만 주고 style을 주지 않아 렌더되지 않는다.

**왜 중요한가**: PRODUCT.md가 "본문 ≥4.5:1"을 명시 규범으로 못박아 뒀는데 5분의 1이 어긴다. 밝은 사무실 조명 아래 다크 UI에서 2.4:1은 실제로 안 읽힌다. 포커스 링 부재는 마우스 없이 조작할 방법을 없앤다.

**Fix**: `#555`→`#8fa3bb`(≈5.1:1), `#505070`→`#7d8bb0`. 8px/8.5px/9px을 10px 이상으로 통합. `:focus-visible { outline: 2px solid #6ee7b7; outline-offset: 2px }`를 전역 1줄로 추가.

**Suggested command**: `/impeccable audit`

### [P1] 해석 결과가 3D에서 합격/불합격 2색으로만 보인다
`NastranResultOverlay`의 색 결정은 `m.exceedsLimit` 불리언 단 하나다(파랑/빨강). 범례도 스와치 2개. 그런데 `members[]`에는 `utilization`이 들어 있고 하단 표는 그것을 `HeatCell`로 이미 %로 렌더한다. `displacements[]`(T1/T2/T3, magnitude)도 표에만 있고 변형 형상은 그리지 않는다.

**왜 중요한가**: 엔지니어의 판단은 "넘었나"가 아니라 "얼마나 여유가 있나"다. 허용치의 98%인 부재와 30%인 부재가 3D에서 같은 파란색이면, 설계 여유가 없는 구간을 찾을 수 없다. 데이터가 이미 있는데 시각화 단계에서 버려지고 있다.

**Fix**: utilization 기반 연속 램프(0→0.5→0.8→1.0→초과)로 전환하고 범례를 min/max 수치가 붙은 컬러바로 교체. 변형 형상은 배율 입력 + 원형/변형 토글로 후속.

**Suggested command**: `/impeccable colorize`

### [P2] 디자인 시스템이 선언만 되고 쓰이지 않는다
- 인라인 `style={{}}` **710개** vs Tailwind `className` **1개**
- index.css가 shadcn oklch 토큰 전체(~140줄)와 `.dark` 블록을 정의하지만 **`.dark` 클래스는 어디에도 부착되지 않고**, 토큰을 참조하는 컴포넌트도 없다. 전량 사문화.
- 결과: border-radius **9종**(3/4/5/6/7/8/10/12/50%), 텍스트 색 **35종**, 폰트 크기 8종이 5px 대역에 밀집
- 좌측 도크 폭 불일치 — Model 탭은 130~432px 리사이즈 가능, 나머지 5개 탭은 301px 하드코딩 → 탭 전환 시 뷰포트 폭이 튄다

**왜 중요한가**: 위계가 크기·굵기가 아니라 35가지 색으로만 표현되면서 화면이 평평해졌다(#8 점수의 근본 원인). 대비 문제도 같은 뿌리다 — 색을 한 곳에서 관리하지 않으니 매번 새 회색을 찍는다.

**Fix**: 실제 쓰는 값만 추린 토큰 파일(`tokens.js`) 도입 — 배경 4단계, 잉크 3단계, 상태 4색, radius 3종, 크기 5종. 인라인 스타일을 전부 걷어낼 필요는 없고, 색·크기·radius 리터럴만 토큰 참조로 치환. 사문화된 index.css 토큰 블록은 제거하거나 실제 채택 중 택일.

**Suggested command**: `/impeccable extract`

## Persona Red Flags

**Alex (파워 유저 — 매주 권상 검토를 도는 선임)**
- redo가 없다. Ctrl+Z로 되돌린 편집을 복구할 방법이 전무하다.
- Ctrl+S 없음 — Save는 탭을 바꿔서 버튼을 눌러야 한다.
- 뷰 단축키가 F/A/S/D로 업계 표준(숫자키 1~6)과 다르다. Femap을 쓰다 오면 매번 팝오버를 연다.
- 좌측 도크를 넓혀 놔도 탭을 바꾸면 301px로 되돌아간다.
- 노드 간 거리 측정이 없어 권상점 간격 확인은 좌표를 눈으로 빼야 한다.

**Jordan (첫 사용자 — 이번 분기에 권상 검토를 처음 맡음)**
- 빈 화면에 `csv/01/20260424_172924/ 폴더의 JSON 파일들`이 떠 있다. 자기 PC에 없는 개발자 경로다.
- 빈 상태 중앙에 "파일을 선택하세요"라고만 쓰여 있고 **버튼이 없다**. 실제 버튼은 좌측 사이드바 최상단이고, 아래 레이어 토글 10개와 시각적 무게가 같다.
- 모델을 안 열었는데 레이어 10개·"Pipe 내부 유체 비우기"·"모델 회전"·"초기화"가 전부 눌린다. "배관 부재가 없습니다"라고 단정하는데 사실은 모델 자체가 없다.
- 변환 감사에서 `zero_mass_attachment`, `csv_row_accepted`를 만난다. 무슨 뜻인지, 조치가 필요한지 알 수 없다.
- Analysis 탭에서 `대기 — 자세안정성 미실행 / Workbench 환경 아님 / stability JSON 없음`을 본다. 셋 중 무엇이 자기 상황인지 알 수 없다.

**HD현대 구조 엔지니어 (PRODUCT.md 기준 — 도구는 매일 바뀌지 않고 일관성이 중요)**
- WorkBench 본체는 Trust Blue `#002554` 라이트 테마, 스튜디오는 `#0d0d1a` 다크 + 에메랄드 `#6ee7b7`. 같은 앱에서 버튼 하나로 넘어오는데 브랜드 연속성이 없다. (3D 뷰어의 다크는 정당한 선택이지만, 액센트/상태색/타이포까지 무관한 것은 별개 문제다.)
- 상단 탭은 영문(Model/Edit/Hoist/Analysis/Save), 본문은 전부 한국어. "Hoist"와 "권상"이 같은 것임을 매번 매핑해야 한다.
- 창 제목이 "ModuleUnitStudio" 고정이라 어느 모델을 열어 뒀는지 작업표시줄에서 구분되지 않는다. 여러 스튜디오 동시 실행(0.0.123에서 추가)과 정면충돌한다.

## Minor Observations

**P2로 묶이는 카피 문제 (한 번에 처리 가능)**
- 빈 상태의 개발자 경로 `csv/01/20260424_172924/` 제거
- `zero_length_structure` / `zero_mass_attachment` / `csv_row_accepted` → 한국어 설명 + 조치 안내
- "JSON 2/4개 로드" → 무엇이 로드되고 무엇이 안 됐는지 분리 표기(인덱스 파일 2 + 단계 파일 2 식)
- Analysis 차단 사유 3개 슬래시 연결 → 전제조건 체크리스트(✓/✗)로 분해
- "배관 부재가 없습니다" → 모델 미로드 시 다른 문구

**기타**
- 빈 상태 아이콘이 이모지 🏗️ — lucide 아이콘 체계와 불일치
- `window.confirm`/`alert` 9곳이 OS 네이티브 모달로 떠서 다크 UI와 이질적이고, `\n` 이어붙인 본문이라 서식이 없다
- `ViewportContainer`의 주석은 1/2/4 분할 뷰포트를 설명하지만 `gridTemplateColumns: '1fr'` 하드코딩이라 실제로는 단일 뷰포트만 동작한다(사문화된 주석)
- hover 상태를 `onMouseEnter` React state로 처리한 곳이 15군데 — CSS `:hover`면 리렌더가 없다
- 창 리사이즈 후 카메라가 재프레이밍되지 않아 모델이 캔버스 밖으로 잘린다

## Questions to Consider

- 변환 감사가 항상 펼쳐져 있어야 할 이유가 있나? 문제 265건을 칩 하나로 접어두고, 누를 때만 펼치면 뷰포트가 34% 넓어진다.
- 결과 색을 합격/불합격으로 나눈 것이 의도된 단순화인가, 아니면 컨투어를 만들 시간이 없었던 것인가? `utilization`은 이미 계산돼 표에 있다.
- 탭 6개가 전부 항상 열려 있어야 하나? 모델 없이 Save를 누르는 경로에 의미가 있나?
- 이 스튜디오가 WorkBench의 확장인가, 독립 도구인가? 답에 따라 다크 테마 유지 여부가 아니라 **액센트·상태색·타이포를 본체와 공유할지**가 정해진다.
