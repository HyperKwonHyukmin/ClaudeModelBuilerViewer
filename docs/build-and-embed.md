# 빌드 & Workbench 임베드 가이드

ModuleUnitStudio 를 Workbench(Electron) 에 넣기 위한 빌드 및 통합 매뉴얼.
`README.md` 가 **API 계약** 을 다룬다면, 이 문서는 **실제 빌드/통합 절차** 를 다룹니다.

---

## 1. 빌드 절차

### 1.1 사전 조건
- Node.js v18 이상
- `apps/module-unit-studio/` 폴더에서 `npm install` 완료

### 1.2 빌드 명령
```bash
cd apps/module-unit-studio
npm run build
```

### 1.3 산출물 (`apps/module-unit-studio/dist/`)
```
dist/
├── index.html                                     # 진입 HTML (0.5KB)
├── favicon.svg                                    # (있는 경우)
└── assets/
    ├── index-<hash>.js                            # 번들 (≈ 915KB / gzip 249KB)
    ├── index-<hash>.css                           # 스타일 (≈ 26KB)
    └── geist-*-<hash>.woff2                       # 폰트 (≈ 60KB 합계)
```
- 모든 자산은 `index.html` 기준 **상대 경로**(`./assets/...`)로 참조됩니다 → `file://` 와 `http://` 양쪽에서 그대로 동작.
- 해시 파일명이라 **CSP 캐시 무효화 부담 없음**.

### 1.4 빌드 결과 검증 (옵션)
빌드된 산출물을 정적 서버로 띄워 단독 점검:
```bash
cd apps/module-unit-studio
npm run preview              # http://localhost:5174 에서 dist/ 호스팅
```
브라우저에서 콘솔 에러가 없고 폴더 열기 → JSON 로드 → 3D 렌더가 동작하면 OK.

---

## 2. Workbench 측 통합

### 2.1 dist 폴더를 어떻게 가져올 것인가
세 가지 모델 중 택일:

| 방식 | 장점 | 단점 |
|------|------|------|
| **(A) 빌드 산출물 직접 복사** | 단순, 의존성 없음 | 갱신 시 수동 복사 |
| **(B) git submodule** | 버전 추적, 갱신 자동화 | submodule 학습 비용 |
| **(C) npm package (private)** | 의존성 관리 표준 | 사내 npm 레지스트리 필요 |

권장: 초기에는 **(A)**, 사이클이 빨라지면 **(B)** 로 전환.

#### (A) 직접 복사 예시
```bash
# Workbench 저장소에서
cp -r ../ModuleUnitStudio/apps/module-unit-studio/dist  ./resources/viewer
```
결과 구조:
```
workbench/
├── main/
│   ├── main.js
│   └── preload.js
└── resources/
    └── viewer/
        ├── index.html
        └── assets/...
```

#### (B) git submodule 예시
```bash
git submodule add https://github.com/HyperKwonHyukmin/ModuleUnitStudio.git external/viewer
git submodule update --init --recursive
# 빌드 단계에서:
cd external/viewer/apps/module-unit-studio && npm ci && npm run build
cp -r external/viewer/apps/module-unit-studio/dist resources/viewer
```

### 2.2 Electron BrowserWindow 에 로드

```js
// workbench/main/main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path  = require('node:path')
const fs    = require('node:fs/promises')

let viewerInitialFolder = null   // Workbench 가 사전에 결정해 둠

function createViewerWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      // 보안: contextIsolation + sandbox + nodeIntegration:false 고정
      contextIsolation: true,
      sandbox:          true,
      nodeIntegration:  false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // dist/index.html 을 file:// 로 직접 로드
  win.loadFile(path.join(__dirname, '..', 'resources', 'viewer', 'index.html'))

  // 개발 시 DevTools — 배포 시 제거
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })
  return win
}

app.whenReady().then(() => {
  registerViewerIpc()
  createViewerWindow()
})
```

### 2.3 preload.js (필수)
뷰어가 기대하는 API 는 정확히 3개. README 의 "Workbench 이식 가이드" 섹션 참조.

```js
// workbench/main/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('workbenchAPI', {
  pickFolder:        ()                              => ipcRenderer.invoke('viewer:pickFolder'),
  getInitialFolder:  ()                              => ipcRenderer.invoke('viewer:getInitialFolder'),
  writeFile:         (folderPath, fileName, content) => ipcRenderer.invoke('viewer:writeFile', folderPath, fileName, content),
})
```

### 2.4 main 측 IPC 핸들러
```js
function registerViewerIpc() {
  ipcMain.handle('viewer:pickFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (r.canceled || r.filePaths.length === 0) return null
    return await readJsonFolder(r.filePaths[0])
  })

  ipcMain.handle('viewer:getInitialFolder', async () => {
    if (!viewerInitialFolder) return null
    return await readJsonFolder(viewerInitialFolder)
  })

  ipcMain.handle('viewer:writeFile', async (_e, folderPath, fileName, content) => {
    try {
      // 보안: 폴더 밖 경로로 빠져나가는 시도 차단
      const safe = path.resolve(folderPath, fileName)
      if (!safe.startsWith(path.resolve(folderPath))) {
        return { ok: false, error: '경로 탈출 시도' }
      }
      await fs.writeFile(safe, content, 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
}

async function readJsonFolder(folderPath) {
  const files = []
  await collectJson(folderPath, files)
  return { folderPath, files }
}

async function collectJson(dir, out) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await collectJson(full, out)
    else if (entry.name.endsWith('.json')) {
      out.push({ name: entry.name, content: await fs.readFile(full, 'utf8') })
    }
  }
}

// Workbench 의 다른 화면에서 viewer 진입 직전에 호출 — 다음 createViewerWindow 시 자동 로드됨
function setViewerInitialFolder(folderPath) { viewerInitialFolder = folderPath }
module.exports = { setViewerInitialFolder }
```

---

## 3. 보안 설정 (반드시 확인)

| 옵션 | 권장값 | 이유 |
|------|--------|------|
| `contextIsolation` | `true` | preload 스크립트가 메인 world 를 오염시키지 않음 |
| `sandbox` | `true` | 렌더러가 Node API 직접 사용 불가 |
| `nodeIntegration` | `false` | 같은 이유 |
| `webSecurity` | `true` (기본) | file:// 내 cross-origin 보호 — 끄지 마세요 |

**CSP**: `index.html` 에는 별도 CSP meta 가 없습니다. 필요하면 BrowserWindow 의 `session.webRequest.onHeadersReceived` 에서 주입하거나, Workbench 측 빌드 단계에서 `index.html` 에 추가하세요. 뷰어 자체는 외부 네트워크 호출이 없으므로 strict CSP 가능:
```
default-src 'self' 'unsafe-inline' data: blob:;
```
(Tailwind 의 inline 스타일과 Three.js 의 blob 워커 때문에 `unsafe-inline` 과 `blob:` 필요)

---

## 4. 자동 폴더 주입 흐름

Workbench 의 시나리오: ModuleUnitStudio 가 폴더를 만들고 → 뷰어가 그 폴더로 자동 진입.

```
Workbench 메인 화면
   ↓ [모델 빌드 완료]
setViewerInitialFolder('/path/to/csv/04/20260429_125914')
   ↓ [뷰어 창 열기]
createViewerWindow()
   ↓
BrowserWindow → file://.../resources/viewer/index.html
   ↓ [App.jsx useEffect]
host.getInitialFolder() → IPC → viewerInitialFolder 반환
   ↓
setSourceFolderRef + loadStages → 자동 표시
```

`viewerInitialFolder` 는 viewer 창이 닫힐 때 **반드시 null 로 초기화**하세요. 다음번 viewer 진입에서 의도치 않게 같은 폴더를 다시 띄울 수 있습니다.

```js
win.on('closed', () => { viewerInitialFolder = null })
```

---

## 5. 빌드 검증 체크리스트

이식 후 다음 5가지가 모두 통과해야 완료입니다.

| # | 검증 항목 | 통과 기준 |
|---|-----------|----------|
| 1 | Workbench 에서 viewer 창이 뜸 | 빈 사이드바 + 3D 빈 화면 표시 |
| 2 | 자동 폴더 로드 | `setViewerInitialFolder` 후 진입 시 stage 가 자동 표시 |
| 3 | 수동 폴더 변경 | 사이드바 "폴더 열기" → Electron 다이얼로그 → 새 폴더 로드 |
| 4 | 편집 모드 export | "최종 모델 출력" → 같은 폴더에 `<원본>_edit.json` 생성 |
| 5 | DevTools 콘솔에 에러 없음 | 특히 `Cannot read property 'workbenchAPI'` 류 부재 |

---

## 6. 트러블슈팅

### "Failed to load resource: net::ERR_FILE_NOT_FOUND" (assets)
원인: `vite.config.js` 의 `base` 가 절대(`/`)로 빌드됨.
해결: `base: './'` 인지 확인 (이미 설정되어 있음).

### 화면이 빈 화면 / `Uncaught ReferenceError`
원인: preload 가 로드되지 않아 `window.workbenchAPI` 가 없음.
- BrowserWindow `webPreferences.preload` 경로가 절대 경로인지 확인
- DevTools Sources 탭에서 preload 가 보이는지 확인

### "auto load" 가 동작하지 않음
- `viewerInitialFolder` 가 viewer 창 진입 직전에 설정되었는지
- IPC 핸들러가 `null` 이 아닌 `{ folderPath, files: [] }` 빈 객체를 돌려주고 있지 않은지 (빈 폴더는 반드시 `null` 반환)

### `_edit.json` 이 생성되지 않음
- 권한 문제: 폴더가 `Program Files` 같은 보호 영역인지 확인
- main 프로세스 콘솔에 `viewer:writeFile` 호출이 들어왔는지 (안 들어오면 viewer 측 export 가 picker 폴백으로 떨어진 것 → folderRef 가 IPC 로 안 넘어옴)
- IPC 핸들러가 `Promise<{ ok: boolean }>` 형태를 정확히 반환하는지

### 번들 크기 줄이기
- Three.js 가 약 60% 차지. 불필요한 examples 모듈을 import 하지 않도록 `apps/module-unit-studio/src/three/*.js` 검토.
- `vite.config.js` 의 `build.sourcemap: false` 가 이미 적용됨.
- gzip 시 250KB 정도라 네트워크 부담은 적음 (file:// 로딩에선 무관).

---

## 7. 갱신 사이클 (운영)

뷰어가 갱신될 때 Workbench 측이 따라가는 절차:

1. 뷰어 저장소에서 `git pull` → (`apps/module-unit-studio/`) `npm install` → `npm run build`
2. `apps/module-unit-studio/dist/` 를 Workbench 의 `resources/viewer/` 로 다시 복사 (방식 A)
3. **API 계약(`window.workbenchAPI`) 이 바뀌지 않았는지** README 의 "호스트 어댑터" 섹션 변경 이력 확인
4. 빌드 검증 체크리스트(5절) 재실행

API 계약은 **breaking change** 시 viewer README 의 인터페이스 정의 부분을 명시적으로 갱신합니다. preload 의 시그니처가 어긋나면 Workbench 통합이 즉시 깨지므로, viewer 측 PR 에서 이 부분이 바뀌면 Workbench 팀 리뷰 필수.

---

## 8. 참고 문서
- `README.md` — viewer 개요, 호스트 어댑터 인터페이스, Workbench 이식 API 계약
- `docs/edit-intent-spec.md` — `_edit.json` 스키마 + ModuleUnitStudio 적용 규칙 (자체 완결 사양)
