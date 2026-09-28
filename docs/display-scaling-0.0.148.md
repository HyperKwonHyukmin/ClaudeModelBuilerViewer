# Module Unit Studio 0.0.148 — 화면 배율 대응 방식 정정

## 무엇을 바꿨나

0.0.147 에 들어갔던 "발표 모드"(1920×1080 을 논리 작업면으로 고정하고 셸 전체를
`transform: scale()` 로 균일 확대)를 **폐기**하고, 배율 대응을 브라우저/OS 에 맡기는
유동 레이아웃으로 되돌렸다.

- 삭제: `src/utils/resolutionFrame.js` (+ 테스트), `.module-studio-resolution-stage` CSS,
  `App.jsx` 의 `computeResolutionFrame` 상태·리사이즈 훅.
- 신설: `src/utils/renderPixelRatio.js` — `studioRenderPixelRatio(devicePixelRatio)`.
  Chromium/Electron 이 Windows 디스플레이 배율을 이미 `devicePixelRatio` 에 반영하므로
  CSS 작업면 확대율을 **다시 곱하지 않고**, GPU 부담만 상한 2 로 제한한다.
- WorkBench `electron/index.js`: 뷰어 창을 `zoomFactor: 1.0` 으로 만들고
  `did-finish-load` 에서 다시 100% 로 고정(커밋 `5555519`).

## 왜 되돌렸나

셸 전체를 `scale()` 로 키우면 **화면 배율이 두 번 곱해진다.**

- 상단 리본 높이(42px)·좌측 도크 폭(301px) 같은 고정 치수까지 함께 확대돼
  4K 에서 메뉴가 비정상적으로 커 보였다.
- 스케일된 셸의 CSS 박스와 실제 뷰포트가 어긋나 정보 패널 좌표가 밀렸다.
- 3D 렌더 픽셀비도 `dpr × scale` 로 계산돼 캔버스 버퍼가 과도하게 커졌다.

## 실측 검증 (빌드 산출물 + Playwright)

| 조합 | 뷰포트 | dpr | 셸 | 리본 | 좌측 도크 |
|------|--------|-----|-----|------|-----------|
| 4K 100% | 3840×2160 | 1 | 3840×2160 | 42 | 301 |
| 4K 150% | 2560×1440 | 1.5 | 2560×1440 | 42 | 301 |
| 4K 200% | 1920×1080 | 2 | 1920×1080 | 42 | 301 |
| QHD | 2560×1440 | 1 | 2560×1440 | 42 | 301 |
| 1024×640 | 1024×640 | 1 | 1024×640 | 36 | 266 |

- 모든 조합에서 셸 박스 = 뷰포트, 스크롤 없음, `transform: none`, 콘솔 에러 0.
- 1024×640 의 36px·266px 는 기존 미디어쿼리(높이 ≤680, 폭 ≤1100)의 의도된 축소다.
- 실제 모델(2,555 절점) 로드 시 캔버스 버퍼 = CSS 크기 × min(dpr, 2) 로 정확히 일치
  (4K/dpr1 3535×2093→동일, dpr2 1615×1013→3230×2026, dpr1.5 2255×1373→3382×2059).

⚠ 4K 를 Windows 배율 100% 로 쓰면 UI 가 작게 보인다. 배율을 OS 에만 맡긴 결과이며
의도된 동작이다(실사용 4K 는 통상 150~200%).

## 버전

- Studio: 0.0.148
- WorkBench Studio 참조(`MODULE_STUDIO_VERSION`): 0.0.148

## 복구 기준

- Studio 이전 릴리스 커밋: `1cdbfd1` (0.0.147, 발표 모드 포함본)
- WorkBench 이전 정합 커밋: `0266c7e` (Studio 0.0.147)
