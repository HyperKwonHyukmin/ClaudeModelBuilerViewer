# ModuleUnitStudio

BDF 기반 Module Unit 모델을 확인하고, 권상 위치 지정, wire 생성, 계산/검증을 통해 구조 안정성 평가를 수행하는 React + Three.js 기반 Studio 입니다.
HiTess Workbench 카드 메뉴 *ModuleUnitStudio* 안에서 동작하며, 브라우저 단독 실행도 지원합니다.

---

## 빠른 실행

### 사전 설치
- Node.js v18 이상 (https://nodejs.org)

### 저장소 클론 & 실행
```bash
git clone https://github.com/HyperKwonHyukmin/ModuleUnitStudio.git
cd ModuleUnitStudio/apps/module-unit-studio
npm install
npm run dev
```
브라우저에서 `http://localhost:5175` 접속.

### 테스트
```bash
cd apps/module-unit-studio
npm test -- --run
```

### 패키징 (마켓플레이스 zip 생성)
```bash
cd apps/module-unit-studio
npm run package
# → apps/module-unit-studio/release/module-unit-studio-<version>.zip
```

### 주의
- "폴더 열기"는 **Chrome / Edge** 만 지원합니다 (File System Access API). Firefox/Safari 미지원 — 단, Electron 임베드 시에는 호스트 어댑터를 통해 우회됩니다(아래 참조).
- JSON 데이터(`csv/` 폴더)는 저장소에 포함되어 있지 않습니다. 별도 복사 필요.
- `npm install` 은 반드시 `apps/module-unit-studio/` 폴더 안에서 실행하세요.

---

## 개발 & 배포 워크플로

### A. 일상 개발 (Studio 자체 기능 추가/수정)
브라우저에서 빠르게 반복합니다 — Workbench 띄울 필요 없음.

```bash
cd apps/module-unit-studio
npm run dev          # http://localhost:5175 — HMR 자동 반영
npm test -- --run    # 변경 전후 테스트
```

브라우저에서 "폴더 열기" 버튼으로 `csv/<run-id>/<timestamp>/` JSON 폴더를 직접 선택해 동작 확인. Web 모드(`WebHost`)로 실행되며 `_edit.json` 출력은 같은 폴더에 다운로드됩니다.

### B. Workbench 통합 검증
실제 Workbench(Electron) 안에서 동작을 확인할 때:

```bash
cd apps/module-unit-studio
npm run package      # build + manifest 주입 + zip 생성
# → apps/module-unit-studio/release/module-unit-studio-<version>.zip
#    apps/module-unit-studio/release/module-unit-studio-<version>.zip.sha256
```

생성된 zip 을 Workbench 마켓플레이스에 등록(또는 dev 모드 사이드로드)하면, Workbench 카드 메뉴 *ModuleUnitStudio* 클릭 시 이 Studio 가 임베드되어 뜹니다. Workbench 측 통합 절차는 [워크벤치 본체 측 경로 변경 요청](#워크벤치-본체-측-경로-변경-요청-2026-04-30) 과 [`docs/build-and-embed.md`](./docs/build-and-embed.md) 참조.

> **버전 올리기**: `apps/module-unit-studio/package.json` 의 `version` 을 bump → `npm run package` → 새 zip 산출. manifest.json 의 version 은 자동 동기화.

### C. 향후 공유 코어 분리
ModuleUnitStudio 에서 도메인 기능이 안정화된 뒤 다른 Studio 앱을 추가할 때:

```bash
# 1) 형제 앱 폴더 복사 (현재는 코어 분리 전이라 시작은 fork-and-edit)
cp -r apps/module-unit-studio apps/hoist-studio
cd apps/hoist-studio

# 2) 정체성 변경
#    - package.json: name, version 초기화
#    - vite.config.js: VIEWER_MANIFEST.id ('hoist-studio'), name, description, linkedMenu

# 3) 베이스 동작 확인 후 도메인 로직 추가
npm install
npm run dev
```

두 번째 앱이 생긴 직후, 두 앱이 공유하는 모듈(예: `three/`, `host/`, `store/useStageStore.js`)을 `packages/studio-core/` 로 추출하고 양쪽 앱이 import 하도록 전환합니다. **첫 앱 1개만 있을 때 미리 추출하지 않습니다 (YAGNI).**

배포 산출물(zip)은 앱마다 독립이므로, Workbench 마켓플레이스에는 `module-unit-studio` / `hoist-studio` 가 별개 카드로 등록됩니다.

---

## 아키텍처 개요

### 데이터 플로우
```
폴더(.json 파일들)
    ↓ pickFolder / getInitialFolder
host adapter (WebHost | ElectronHost)
    ↓
fileLoader.loadFiles()  →  StageData[]  →  useStageStore
    ↓                                          ↓
  3D 씬 (Three.js)                       편집 모드 intents
                                              ↓ exportToFile
                                       host.writeFile(folderRef, ...)
                                              ↓
                                       <원본>_edit.json (같은 폴더)
                                              ↓
                                       ModuleUnitStudio --apply-edit-intent
                                              ↓
                                       <폴더>/edited/  (BDF + JSON + apply-trace)
```

### 주요 모듈
| 영역 | 위치 | 역할 |
|------|------|------|
| 호스트 어댑터 | `apps/module-unit-studio/src/host/host.js` | 폴더/파일 IO 추상화. 환경 분기점은 여기 한 곳뿐 |
| 데이터 로더 | `apps/module-unit-studio/src/data/fileLoader.js` | JSON → StageData[] 변환 |
| Stage 저장소 | `apps/module-unit-studio/src/store/useStageStore.js` | stages, sourceFolderRef 보유 |
| Edit 저장소 | `apps/module-unit-studio/src/store/useEditStore.js` | intents, exportToFile, importFromJson |
| Edit 사양 | `docs/edit-intent-spec.md` | `_edit.json` 스키마 + builder 적용 규칙 |

---

## 호스트 어댑터 (Two-Track 구조)

### 왜 필요한가
뷰어는 두 가지 형태로 실행됩니다:
1. **브라우저 단독** — 사용자가 "폴더 열기" 버튼으로 직접 폴더 선택
2. **Workbench(Electron) 임베드** — 이전 단계 산출물 폴더가 자동 주입

이전에는 `window.showDirectoryPicker()`가 컴포넌트에 직접 박혀 있어 Electron 임베드가 어려웠습니다.
지금은 모든 폴더/파일 IO가 단일 인터페이스(`HostAdapter`)를 통과하며, 환경 감지는 부팅 시 한 번만 일어납니다.

### 인터페이스
```js
// apps/module-unit-studio/src/host/host.js

interface HostAdapter {
  name: 'web' | 'electron'

  // 사용자에게 폴더 선택 UI 를 띄운다.
  pickFolder(): Promise<
    | { cancelled: true, error?: string }
    | { folderRef: any, files: FileLike[] }
  >

  // 부팅 시 자동 주입할 폴더가 있으면 반환한다 (Web 모드는 항상 null).
  getInitialFolder(): Promise<null | { folderRef: any, files: FileLike[] }>

  // pickFolder/getInitialFolder 가 돌려준 folderRef 에 파일을 쓴다.
  writeFile(folderRef: any, fileName: string, content: string): Promise<{
    ok: boolean
    location?: 'folder'
    error?: string
  }>
}

// FileLike — fileLoader 가 .name, .text() 만 사용
interface FileLike {
  name: string
  text(): Promise<string>
}
```

`folderRef` 는 호스트별 불투명 객체입니다. 호출자(`useEditStore`, `Sidebar`)는 보존만 하고 다시 host 에 넘깁니다.
- WebHost: `FileSystemDirectoryHandle`
- ElectronHost: 폴더 절대 경로 문자열

### 환경 감지
```js
// apps/module-unit-studio/src/host/host.js
export function detectHost() {
  if (typeof window !== 'undefined' && window.workbenchAPI) {
    return new ElectronHost(window.workbenchAPI)
  }
  return new WebHost()
}
```

`window.workbenchAPI` 존재 여부로 결정. Workbench preload 가 이 객체만 노출하면 자동 연결됩니다.

---

## Workbench(Electron) 이식 가이드

> **이 섹션은 Workbench 측 Claude Code 가 읽는 곳입니다.**
> 뷰어 코드는 한 줄도 수정할 필요 없습니다. preload 에서 아래 API 만 노출하면 됩니다.

### preload 가 노출해야 하는 API

```js
// workbench preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('workbenchAPI', {
  pickFolder:        ()                               => ipcRenderer.invoke('viewer:pickFolder'),
  getInitialFolder:  ()                               => ipcRenderer.invoke('viewer:getInitialFolder'),
  writeFile:         (folderPath, fileName, content)  => ipcRenderer.invoke('viewer:writeFile', folderPath, fileName, content),
})
```

### main 프로세스 IPC 핸들러 시그니처

#### `viewer:pickFolder`
사용자에게 폴더 선택 다이얼로그를 띄우고 그 안의 모든 `.json` 파일을 읽어 반환합니다.

**반환**:
- 사용자 취소 → `null`
- 정상 → `{ folderPath: string, files: { name: string, content: string }[] }`

```js
const { dialog } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

ipcMain.handle('viewer:pickFolder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (r.canceled || r.filePaths.length === 0) return null
  return await readJsonFolder(r.filePaths[0])
})

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
```

#### `viewer:getInitialFolder`
이전 단계(예: ModuleUnitStudio 실행 결과)에서 결정된 폴더를 자동으로 돌려줍니다.
**반환 형식은 `pickFolder` 와 동일** — 자동 로드할 폴더가 없으면 `null`.

```js
ipcMain.handle('viewer:getInitialFolder', async () => {
  const folder = global.viewerInitialFolder // Workbench 가 사전에 결정해 둔 경로
  if (!folder) return null
  return await readJsonFolder(folder)
})
```

#### `viewer:writeFile`
지정된 폴더에 파일을 UTF-8 로 기록합니다. 같은 이름의 파일이 있으면 덮어씁니다.

**반환**: `{ ok: true } | { ok: false, error: string }`

```js
ipcMain.handle('viewer:writeFile', async (_e, folderPath, fileName, content) => {
  try {
    // 보안: folderPath 외부로 나가는 파일명을 거절
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
```

### 자주 빠지는 함정
- **`getInitialFolder` 가 동기적으로 빈 결과를 돌려주면 안 됨** — 호출 시점에 폴더가 결정되지 않았다면 `null`. 빈 객체나 `{ files: [] }` 를 돌려주면 뷰어가 "0개 로드" 상태로 굳어집니다.
- **`files[].content` 는 반드시 UTF-8 문자열** — Buffer 를 그대로 넘기면 IPC 직렬화 후 `fileLoader` 에서 `JSON.parse` 가 깨집니다.
- **`writeFile` 의 folderPath 검증** — IPC 로 들어온 경로를 그대로 `fs.writeFile` 에 넣지 마세요. 위 예시처럼 `path.resolve` 로 탈출 시도를 차단합니다.
- **권한 다이얼로그 반복** — Web 환경에서는 `requestPermission` 이 필요하지만 Electron 에서는 main 프로세스가 직접 fs 를 다루므로 권한 요청이 필요 없습니다.

### 통합 후 동작 검증
1. Workbench 앱을 띄우고 viewer 가 임베드된 화면으로 진입
2. **자동 로드 확인** — 사용자가 "폴더 열기" 누르지 않아도 stage 가 표시되어야 함 (`getInitialFolder` 가 호출됨)
3. **편집 모드 → "최종 모델 출력"** — 같은 폴더에 `<원본>_edit.json` 이 생성되어야 함
4. **수동 폴더 변경** — 사이드바 "폴더 열기" 가 여전히 동작 (Electron 다이얼로그가 뜨고 새 폴더로 교체됨)

이 4가지가 모두 동작하면 이식 완료입니다.

> **빌드 절차와 BrowserWindow 설정, 보안 옵션, 트러블슈팅** 등 실제 통합 작업은
> [`docs/build-and-embed.md`](./docs/build-and-embed.md) 에 단계별로 정리되어 있습니다.

### `_edit.json` 이후 흐름
뷰어가 `<원본>_edit.json` 을 같은 폴더에 쓰면, 다음 단계는 ModuleUnitStudio 가 처리합니다.
스키마와 적용 규칙은 `docs/edit-intent-spec.md` 를 참조하세요. 이 문서만 보고도 builder 측 구현이 가능하도록 작성되어 있습니다.

---

## 워크벤치 본체 측 경로 변경 요청 (2026-04-30)

`viewer/` → `apps/module-unit-studio/` 로 디렉토리가 이동했습니다. **마켓플레이스 zip 으로 통합하는 경우** id/version/내용은 동일하므로 변경 없음. **소스 빌드로 통합하는 경우** 워크벤치 측 스크립트의 경로만 갱신해주세요.

### 변경된 경로

| 항목 | 이전 | 현재 |
|------|------|------|
| 빌드 스크립트 cwd | `external/viewer/viewer/` | `external/viewer/apps/module-unit-studio/` |
| 빌드 산출물 dist | `external/viewer/viewer/dist/` | `external/viewer/apps/module-unit-studio/dist/` |
| Marketplace zip | `viewer/release/module-unit-studio-*.zip` | `apps/module-unit-studio/release/module-unit-studio-*.zip` |
| `npm ci && npm run build` 실행 위치 | `viewer/` | `apps/module-unit-studio/` |

### 변경 없는 것

- `manifest.json` 의 id/version/linkedMenu/hostApi (그대로)
- preload 가 노출하는 `workbenchAPI` 인터페이스 (그대로)
- IPC 채널 이름(`viewer:pickFolder` 등) — viewer 라는 단어는 namespace 로 유지
- BrowserWindow 로드 대상 (`resources/viewer/index.html`) — vendoring 후 이름은 워크벤치 측 자유

### 워크벤치 측에서 grep 으로 찾아야 할 패턴
```
ModuleUnitStudio/viewer        → ModuleUnitStudio/apps/module-unit-studio
external/viewer/viewer                → external/viewer/apps/module-unit-studio
```

---

## 코드 변경 요약 (호스트 어댑터 도입)

### 신규
- `apps/module-unit-studio/src/host/host.js` — `WebHost`, `ElectronHost`, `detectHost()`/`getHost()`/`setHost()`
- `apps/module-unit-studio/src/host/host.test.js` — 13 테스트 (감지, WebHost.writeFile, ElectronHost 동작)

### 변경
| 파일 | 변경 내용 |
|------|----------|
| `apps/module-unit-studio/src/store/useStageStore.js` | `sourceDirHandle` → `sourceFolderRef` (web/electron 공용 어휘) |
| `apps/module-unit-studio/src/components/Sidebar.jsx` | `window.showDirectoryPicker` 직접 호출 제거 → `getHost().pickFolder()`. 폴더 순회 헬퍼는 host 내부로 이동 |
| `apps/module-unit-studio/src/store/useEditStore.js` | `exportToFile` 의 폴더 쓰기 분기를 `getHost().writeFile()` 한 줄로 단순화 (showSaveFilePicker / download 폴백 유지) |
| `apps/module-unit-studio/src/App.jsx` | 부팅 `useEffect` 추가 — `getInitialFolder()` 가 폴더를 반환하면 자동 `loadStages` |
| `apps/module-unit-studio/src/store/useEditStore.test.js` | 직접 dirHandle 모킹 → `setHost({ writeFile })` 모킹으로 전환 + 폴백 테스트 추가 |

### 테스트 결과
107/107 통과 (기존 93 + 신규 14).

---

## 디렉토리 구조 (관련 부분만)
```
ModuleUnitStudio/
├── apps/
│   └── module-unit-studio/             ← Studio 본체 (이전 viewer/ 와 동일)
│       ├── src/
│       │   ├── host/             ← 환경 분기 한 곳
│       │   │   ├── host.js
│       │   │   └── host.test.js
│       │   ├── store/
│       │   │   ├── useStageStore.js   ← stages, sourceFolderRef
│       │   │   └── useEditStore.js    ← intents, exportToFile
│       │   ├── components/
│       │   │   └── Sidebar.jsx        ← 폴더 열기 버튼 (host.pickFolder 호출)
│       │   ├── data/
│       │   │   └── fileLoader.js      ← FileLike → StageData[]
│       │   └── App.jsx                ← 부팅 시 host.getInitialFolder() 자동 로드
│       ├── scripts/
│       │   └── package-viewer.mjs     ← marketplace zip 생성
│       └── release/                   ← 빌드 산출물 zip 출력 위치
├── packages/                     ← (예약) 다중 앱 등장 시 공통 코어 추출 자리
└── docs/
    └── edit-intent-spec.md       ← _edit.json 스키마 + builder 적용 규칙 (자체 완결 사양)
```

### 향후 확장 앱 추가 방식
권상 와이어 설치/평가 같은 도메인 특화 유틸리티가 필요한 경우, **새 프로그램을 fork 하지 말고** 같은 저장소에 형제 앱으로 추가합니다.

```
apps/
├── module-unit-studio/        ← 현재 (베이스)
└── hoist-studio/        ← 신규 (예: 권상 평가 추가)
    ├── src/main.jsx     ← 베이스 마운트 + 확장 로직 등록
    ├── package.json     ← 독립 manifest.id / version
    └── ...
```

첫 확장 앱이 생기는 시점에 `apps/module-unit-studio/src/` 중 두 앱이 공유하는 부분을 `packages/studio-core/` 로 추출합니다. 그전까지는 YAGNI 를 지켜 추출하지 않습니다.
