# HiTess Model Studio를 HiTess Model Builder의 "2. 모델 알고리즘" 단계 풀스크린 보조 창으로 통합

## Context

**HiTess WorkBench**는 Electron + React(Vite) 데스크톱 앱이며, `HiTessModelBuilder.jsx`의 3단계 파이프라인 중 "2. 모델 알고리즘" 스텝에서 현재 내장된 `FemModelViewer`(약 1,500줄, Three.js)가 RBE2 편집 가능한 3D 뷰어로 동작 중이다.

별도로 개발된 `C:\Coding\ClaudeModelBuilerViewer\`(React 19 + Vite + Tailwind 4 + Three.js 0.184 + Zustand)는 1D Beam FEM 파이프라인 단계별 결과(JSON)를 시각화하는 단독 SPA로, 멀티 뷰포트, 스테이지 전환, 그룹/U-bolt 진단, 인스펙터 패널 등 풍부한 기능을 갖추고 있다.

목표는 **Stage 2 도달 + 백엔드 산출물 준비 시 자동으로 풀스크린 보조 Electron 창을 띄워 HiTess Model Studio로 모델을 검토**할 수 있게 만드는 것. 호스트 페이지의 인라인 `FemModelViewer`는 미리보기/RBE2 편집용으로 유지한다.

## 통합 방식 결정 사항 (사용자 확정)

1. 오픈 시점: **Stage 2 도달 + `rbeResult?.jsonPath` 또는 `bdfResult?.jsonPath` 준비 시 자동 1회 오픈**, 인라인에 "전체 화면 다시 열기" 버튼 유지
2. 인라인 `FemModelViewer`: **유지**(폴백/미리보기) + 보조 창 추가
3. 코드 통합: **빌드 산출물만 vendoring** — `HiTess Model Studio`는 별도 repo로 두고 `viewer/dist/`만 호스트로 복사

## 아키텍처 개요

```
[main BrowserWindow]                       [secondary BrowserWindow (fullscreen)]
HiTessModelBuilder.jsx                      ModelAlgorithmViewer/index.html
  Stage 2 진입                              (HiTess Model Studio 빌드 산출물)
    └─ useEffect → invoke                       └─ onMessage('init-model-data')
       'open-model-algorithm-window'                ├─ payload.jsonPath/connectivityPath 수신
                                                    └─ invoke('list-dir-csvs') / ('read-file-buffer')
              │                                        로 파이프라인 JSON 로드 → Zustand 주입
              ▼
       [Electron main process]
       ipcMain.handle('open-model-algorithm-window')
         → createModelAlgorithmWindow(payload)
         → did-finish-load → webContents.send('init-model-data', payload)
```

## 변경할 파일 목록 (Critical Files)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `C:\Coding\WorkBench\HiTessWorkBench\electron\index.js` | 보조 창 생성 함수 + IPC 핸들러 추가 |
| 2 | `C:\Coding\WorkBench\HiTessWorkBench\electron\preload.js` | invoke/receive 화이트리스트 확장 |
| 3 | `C:\Coding\WorkBench\HiTessWorkBench\package.json` | electron-builder `files`, npm scripts |
| 4 | `C:\Coding\WorkBench\HiTessWorkBench\frontend\src\pages\analysis\HiTessModelBuilder.jsx` | useEffect 자동 오픈 + 재오픈 버튼 |
| 5 | `C:\Coding\WorkBench\HiTessWorkBench\scripts\copy-viewer.js` (신규) | dist 복사 스크립트 |
| 6 | `C:\Coding\ClaudeModelBuilerViewer\viewer\vite.config.js` | `base: './'` 추가 |
| 7 | `C:\Coding\ClaudeModelBuilerViewer\viewer\src\bootstrap\electronBridge.js` (신규) | IPC 부트스트랩 |
| 8 | `C:\Coding\ClaudeModelBuilerViewer\viewer\src\main.jsx` | bridge 임포트 |

신규 디렉터리: `C:\Coding\WorkBench\HiTessWorkBench\ModelAlgorithmViewer\` — 빌드 산출물 vendoring 위치 (`IntroductionPage/`와 대칭).

## 구현 단계

### 1단계: 뷰어 측 IPC 부트스트랩 (`HiTess Model Studio`)

**`viewer/vite.config.js`**: `base: './'` 추가 (현재 미설정 → `file://` 로딩 시 자산 경로 깨짐 방지).

**`viewer/src/bootstrap/electronBridge.js`** 신규 작성:
- `window.electron`이 존재할 때만 활성화 (단독 dev에서는 no-op)
- `window.electron.onMessage('init-model-data', payload)` 리스너 등록
- payload에서 `jsonPath`(`userConnection/.../healed.json` 형태)에서 디렉터리만 추출
- `window.electron.invoke('list-dir-csvs', dirPath)`로 파일 목록 → `01_*.json … 07_*.json` 필터
- 각 파일을 `window.electron.invoke('read-file-buffer', filePath)`로 읽고 `JSON.parse`
- 기존 `useStageStore`의 stage 주입 어댑터 호출 (현재 `showDirectoryPicker` 결과를 받는 동일 진입점)

**`viewer/src/main.jsx`**: 최상단에 `import './bootstrap/electronBridge.js'` 추가.

### 2단계: Electron Preload 화이트리스트 확장

**`electron/preload.js`**:
```js
const VALID_RECEIVE_CHANNELS = [
  'app-update','server-status','download-progress',
  'init-model-data',                                  // 추가
];
const VALID_INVOKE_CHANNELS  = [
  'list-dir-csvs','read-file-buffer','get-intro-page-html',
  'download-client','start-self-update',
  'open-model-algorithm-window',                       // 추가
];
```

기존 `read-file-buffer` 핸들러가 `.csv` 확장자 가드를 가진 경우 **`.json` 허용으로 완화**(또는 별도 `read-json-file` 신설). 보안을 위해 `path.startsWith` 검사로 `userConnection/` 또는 `ModelAlgorithmViewer/` 하위만 허용.

### 3단계: Electron 메인 프로세스 — 보조 창 생성

**`electron/index.js`**에 추가:
```js
let modelAlgoWindow = null;

function createModelAlgorithmWindow(payload) {
  if (modelAlgoWindow && !modelAlgoWindow.isDestroyed()) {
    modelAlgoWindow.focus();
    modelAlgoWindow.webContents.send('init-model-data', payload);
    return;
  }
  modelAlgoWindow = new BrowserWindow({
    parent: mainWindow,
    modal: false,
    fullscreen: true,
    backgroundColor: '#0d0d1a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (app.isPackaged) {
    modelAlgoWindow.loadFile(
      path.join(__dirname, '../ModelAlgorithmViewer/index.html')
    );
  } else {
    modelAlgoWindow.loadURL('http://localhost:5174');
  }
  modelAlgoWindow.webContents.once('did-finish-load', () => {
    modelAlgoWindow.webContents.send('init-model-data', payload);
  });
  modelAlgoWindow.on('closed', () => { modelAlgoWindow = null; });
}

ipcMain.handle('open-model-algorithm-window', (_e, payload) => {
  createModelAlgorithmWindow(payload);
  return { ok: true };
});
```

`parent: mainWindow` → 메인 종료 시 자동 종료. `fullscreen: true`(F11/ESC 토글 가능, 멀티모니터 호환). 기존 `FemModelViewer`처럼 dark slate 배경(`#0d0d1a`).

### 4단계: 호스트 페이지 자동 오픈 + 재오픈 버튼

**`HiTessModelBuilder.jsx`** 4220–4261줄 인라인 뷰어 블록 **유지**. 그 위에 다음 추가:

```jsx
const launchedRef = useRef(false);
const launchAlgoWindow = useCallback(() => {
  const jp = rbeResult?.jsonPath || bdfResult?.jsonPath;
  if (!jp || !window.electron?.invoke) return;
  window.electron.invoke('open-model-algorithm-window', {
    jsonPath: jp,
    connectivityPath: rbeResult?.connectivityPath ?? bdfResult?.connectivityPath ?? null,
    mode: 'healed',
  });
}, [rbeResult, bdfResult]);

useEffect(() => {
  if (!isAlgorithmStep) { launchedRef.current = false; return; }
  const jp = rbeResult?.jsonPath || bdfResult?.jsonPath;
  if (jp && !launchedRef.current) {
    launchedRef.current = true;
    launchAlgoWindow();
  }
}, [isAlgorithmStep, rbeResult?.jsonPath, bdfResult?.jsonPath, launchAlgoWindow]);
```

3D 뷰어 헤더(4072줄 부근 `<span>3D 모델 뷰어</span>` 근처)에 `<button onClick={launchAlgoWindow}>전체 화면 뷰어 열기</button>` 추가.

### 5단계: 빌드 파이프라인 — vendoring 자동화

**`HiTessWorkBench/scripts/copy-viewer.js`** 신규:
```js
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.resolve(__dirname, '../../../ClaudeModelBuilerViewer/viewer/dist');
const DST = path.resolve(__dirname, '../ModelAlgorithmViewer');
fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(SRC, DST, { recursive: true });
console.log(`[copy-viewer] ${SRC} → ${DST}`);
```

**`HiTessWorkBench/package.json`**:
```jsonc
{
  "scripts": {
    "build:viewer":  "cd ../../ClaudeModelBuilerViewer/viewer && npm run build",
    "copy:viewer":   "node scripts/copy-viewer.js",
    "dist":          "npm run build:viewer && npm run copy:viewer && npm run build:frontend && electron-builder",
    "dev:viewer":    "cd ../../ClaudeModelBuilerViewer/viewer && npm run dev",
    "dev":           "concurrently \"npm:dev:react\" \"npm:dev:viewer\" \"npm:dev:electron\""
  },
  "build": {
    "files": [
      "electron/**/*",
      "frontend/dist/**/*",
      "IntroductionPage/**/*",
      "ModelAlgorithmViewer/**/*"
    ]
  }
}
```

뷰어의 `package.json` 의존성은 `cd && npm install`이 필요 — `dist:viewer:install` 헬퍼 스크립트 추가하거나 setup 문서에 명시.

### 6단계: CSP 보강 (필요 시)

`electron/index.js`의 `session.defaultSession.webRequest.onHeadersReceived` 정책에 `font-src 'self' data:` 추가 — 뷰어가 사용하는 `@fontsource-variable/geist`가 외부 fetch 시 차단 방지. 현재 `default-src 'self'` 만으로는 `font-src` 누락.

## 검증 계획

### Dev 환경
1. `cd C:\Coding\ClaudeModelBuilerViewer\viewer && npm install` (최초 1회)
2. `cd C:\Coding\WorkBench\HiTessWorkBench && npm run dev`
3. 5173/5174/electron 모두 기동 확인
4. 로그인 → "HiTess Model Builder" 진입 → CSV 업로드 → Stage 1 통과 → **Stage 2 도달 시 자동으로 5174 풀스크린 창 오픈** 확인
5. 보조 창 DevTools(`Ctrl+Shift+I`)에서:
   - `init-model-data` 수신 로그 확인
   - `useStageStore` 상태에 stage 1~7 JSON 주입 확인
   - 3D 뷰포트에 노드/요소/RBE/CONM2 렌더 확인
6. 보조 창 닫고 인라인 "전체 화면 뷰어 열기" 버튼 → 재오픈 + 동일 모델 표시
7. 메인 창 닫기 → 보조 창 자동 종료 (`parent` 효과)
8. `F11` / `ESC`로 풀스크린 토글, 멀티모니터에서 보조 창 드래그 후 재진입

### Production 환경
1. `npm run dist` → `dist_electron/HiTessWorkBench-x.x.x-portable.exe` 생성
2. 클린 머신 또는 다른 사용자 계정에서 실행
3. 패키지 내부 `resources/app/ModelAlgorithmViewer/index.html` 존재 확인 (asar 패킹 시 `npx asar list` 활용)
4. Stage 2 시나리오 재현, 보조 창 정상 오픈
5. 에지 케이스:
   - Stage 2 진입 전 jsonPath 미존재 → 자동 오픈 안 됨, 인라인 placeholder만
   - 백엔드 오류로 jsonPath 미반환 → 보조 창 미오픈, 호스트 정상 동작
   - 보조 창에서 `window.confirm` 등 native dialog 호출 시 정상 표시

## 위험 및 미결 사항

- **`read-file-buffer` 보안**: JSON 허용 시 `userConnection/` 또는 `ModelAlgorithmViewer/` 하위 path-prefix 검증 필수. 임의 경로 접근 차단.
- **버전 격리**: React 18 vs 19, Three 0.155 vs 0.184는 각 BrowserWindow의 독립 V8 컨텍스트로 격리됨 → 런타임 충돌 없음.
- **Tailwind CSS 격리**: 두 앱이 각자 빌드한 CSS만 자기 webContents에 주입 — 충돌 없음.
- **CSP**: 세션 단일 정책이 모든 webContents에 적용. `default-src 'self' http: https:`로 `file://`(self) OK. `font-src` 명시적으로 추가 권장.
- **다중 인스턴스**: 단일 `modelAlgoWindow` 변수 재사용 — Stage 2 재진입 시 새 payload만 push (창 재생성 안 함).
- **`showDirectoryPicker` 의존**: IPC 경로 활성화 시 picker 미사용 — 단독 dev 모드에서는 기존 picker 폴백 유지로 양립.
- **뷰어 측 라이센스/의존성**: `HiTess Model Studio`의 `node_modules`가 별도 설치 필요 → setup 가이드 명시.
