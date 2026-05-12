# ModuleUnitStudio — 빌드와 Workbench 임베드 가이드

> **대상**: Workbench 백엔드(FastAPI) / 프론트엔드(Electron) 측 Claude Code / 통합 담당자.
> 본 문서만 보고 Workbench 안에 ModuleUnitStudio 를 임베드하고 자세안정성 해석 CLI 를 호출할 수 있도록 작성됨. Studio 측 코드는 host adapter 인터페이스만 맞추면 변경 최소화 가능.

---

## 0. 한눈에 (TL;DR)

워크벤치는 **Python FastAPI 백엔드 + Electron 프론트엔드** 구조입니다. 따라서 산출물 배치도 두 군데로 나뉩니다.

```
[ModuleUnitStudio repo]                          [ModuleUnitAnalysis repo]
        │                                                │
        │ npm run package                                │ dotnet publish -c Release \
        │   = vite build                                 │     -r win-x64 \
        │     + scripts/package-viewer.mjs               │     --self-contained true
        ↓                                                ↓
release/module-unit-studio-<ver>.zip             publish/win-x64-self-contained/
   (~0.3 MB)                                        (~70 MB, ModuleAnalysis.Cli.exe + .NET 런타임 dll들)
        │                                                │
        ▼                                                ▼
사내 storage UNC 업로드:                          백엔드 InHouseProgram 폴더 배치:
\\storage.hpc.hd.com\a476854\...\StudioProgram\   <Backend>\InHouseProgram\
   module-unit-studio-<ver>.zip                       GroupModuleAnalysis\
                                                          ModuleAnalysis.Cli.exe
                                                          (+ deps dll들)
        │                                                │
        │  /api/viewers/manifest/<id>                    │ /api/analysis/module-stability/request
        │  /api/viewers/download/<id>                    │   → subprocess.run(exe, ...)
        ▼                                                ▼
[Workbench Frontend (Electron)]              [Workbench Backend (FastAPI)]
   · viewer zip 받아 풀어                       · viewer zip 서빙 (viewers.py)
     BrowserWindow.loadFile                     · CLI spawn (services/*.py)
   · 백엔드 REST API 호출                       · job_status_store 로 진행률 추적
```

**Workbench 가 해야 할 일** — 두 측에 나뉘어 있음:

### 백엔드 (Python / FastAPI) — 자세안정성 신규 채널
1. `app/services/module_stability_service.py` 추가 — `subprocess.run(<exe>, ...)` 패턴 (§4)
2. `app/routers/analysis.py` 에 `/api/analysis/module-stability/request` 엔드포인트 추가 (§4)
3. `InHouseProgram/GroupModuleAnalysis/ModuleAnalysis.Cli.exe` + 의존 dll 들 배치 (§5)

### 프론트엔드 (Electron) — 기존 viewer 통합 흐름 재사용
4. viewer zip 자동 다운로드/검증/풀기 흐름 그대로 사용 (ModelBuilderStudio 와 동일)
5. preload 가 `workbenchAPI` 노출 — Studio 의 host adapter 와 시그니처 정합 (§3)
6. Studio 가 호출하는 `runStabilityAnalysis` 를 **백엔드 fetch 로 wrapping** (§3.2)

> **현재 배포 zip**: `\\storage.hpc.hd.com\a476854\00_PROJECT\AA_300_CF44\[개인 자료]\권혁민 책임연구원\HiTessWorkBench\StudioProgram\module-unit-studio-0.0.1.zip` — 자세한 내용은 §1.3 참조.

> **현재 CLI exe 위치**: `<Backend>\InHouseProgram\GroupModuleAnalysis\ModuleAnalysis.Cli.exe` — 사용자가 이미 배치했음. 자동으로 호출되려면 §4 의 service + router 추가 필요.

---

## 1. ModuleUnitStudio zip 산출

### 1.1 빌드 명령

```bash
cd apps/module-unit-studio
npm install
npm run package
```

**산출물** (자동 생성):
- `apps/module-unit-studio/release/module-unit-studio-<version>.zip`
- `apps/module-unit-studio/release/module-unit-studio-<version>.zip.sha256`

### 1.2 zip 내부 구조

zip 루트에 정적 웹 자산이 폴더 래퍼 없이 바로 위치합니다:

```
module-unit-studio-0.0.1.zip
├── manifest.json          ← Workbench 마켓플레이스 카탈로그
├── index.html             ← BrowserWindow 가 로드할 진입점
├── favicon.svg
├── icons.svg
└── assets/
    ├── index-<hash>.js    ← 980 KB (React + three.js + Studio)
    ├── index-<hash>.css   ←  27 KB
    └── geist-*.woff2      ← 폰트
```

### 1.3 사내 공유 위치 (현재 배포본)

빌드된 zip 은 다음 사내 스토리지 경로에 업로드돼 있습니다 — Workbench 빌드/통합 담당자는 여기서 받아가시면 됩니다.

```
\\storage.hpc.hd.com\a476854\00_PROJECT\AA_300_CF44\[개인 자료]\권혁민 책임연구원\HiTessWorkBench\StudioProgram\module-unit-studio-0.0.1.zip
```

UNC 경로 그대로 탐색기 주소창에 붙여넣으면 폴더가 열립니다. 동일 폴더에 `.sha256` 파일이 함께 올라와 있다면 무결성 검증에 사용하세요. 새 버전이 나오면 같은 폴더에 `module-unit-studio-<new-version>.zip` 으로 추가 업로드되며 파일명이 곧 manifest 의 version 과 일치합니다.

### 1.4 manifest.json 스키마

vite 빌드가 자동 주입하는 카탈로그 파일 (zip 루트에 항상 함께 들어감):

```json
{
  "id":                  "module-unit-studio",
  "name":                "ModuleUnitStudio",
  "version":             "0.0.1",
  "entry":               "index.html",
  "linkedMenu":          "ModuleUnitStudio",
  "minWorkbenchVersion": "2.0.0",
  "description":         "BDF 기반 Module Unit 권상 wire 생성 및 구조 안정성 평가 Studio",
  "hostApi":             "workbenchAPI@1"
}
```

| 필드 | 의미 |
|------|------|
| `id` | 마켓플레이스 식별자. Workbench `viewers/<id>/` 폴더명과 일치 |
| `version` | `package.json` 의 version 자동 동기화 |
| `entry` | BrowserWindow 가 `loadFile()` 할 상대경로 |
| `linkedMenu` | 카드 메뉴 이름. 이 라벨로 Workbench UI 에 노출 |
| `minWorkbenchVersion` | 호환 가능한 최소 Workbench 버전 |
| `hostApi` | preload 가 노출해야 하는 API 버전 — `workbenchAPI@1` |

---

## 2. ModuleUnitAnalysis CLI 산출물

별도 저장소(`ModuleUnitAnalysis`) 에서 다음 명령으로 빌드:

```bash
cd ModuleUnitAnalysis
dotnet publish src/ModuleAnalysis.Cli -c Release -r win-x64 --self-contained true \
  -o publish/win-x64-self-contained
```

**산출물**: `publish/win-x64-self-contained/` 폴더 통째 — `ModuleAnalysis.Cli.exe` + .NET 8 런타임 dll 들 (~70 MB)

framework-dependent 빌드도 가능하나 사용자 머신에 .NET 8 Runtime 사전 설치가 필요해, **권장은 self-contained**. **단일 exe 만 복사하면 안 됨** — 폴더 통째 옮겨야 함.

CLI 호출 사양은 본 저장소의 [`docs/posture-stability-spec.md`](./posture-stability-spec.md) 와 ModuleUnitAnalysis 측 가이드를 함께 참조.

---

## 3. Workbench Frontend(Electron) preload 가 노출해야 하는 API

Studio 의 host adapter (`src/host/host.js`) 가 자동 감지하는 인터페이스. **시그니처를 정확히 맞춰야 합니다**. ModelBuilderStudio 와 같은 `viewer:*` 채널을 그대로 재사용합니다.

### 3.1 폴더/파일 IO 채널 (이미 ModelBuilderStudio 통합으로 존재 — 재사용)

```js
// workbench preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('workbenchAPI', {
  // ── 폴더/파일 IO (필수) ────────────────────────────────────────
  pickFolder:        ()                              => ipcRenderer.invoke('viewer:pickFolder'),
  getInitialFolder:  ()                              => ipcRenderer.invoke('viewer:getInitialFolder'),
  writeFile:         (folderPath, fileName, content) => ipcRenderer.invoke('viewer:writeFile', folderPath, fileName, content),

  // ── 자세안정성 해석 (ModuleUnitStudio 전용 — 신규) ─────────────
  // 내부적으로는 백엔드 REST API (POST /api/analysis/module-stability/request) 를 호출하는
  // wrapper. Studio 는 IPC 인지 HTTP 인지 모르고 이 함수만 호출합니다.
  runStabilityAnalysis: (posturePath)                => ipcRenderer.invoke('viewer:runStabilityAnalysis', posturePath),

  // ── 백엔드 업로드 (선택) ─────────────────────────────────────
  // 노출하면 _edited.json / _posture.json 이 백엔드 userConnection 으로 업로드됨.
  // 노출하지 않으면 로컬 폴더 쓰기로 폴백.
  uploadEvaluationArtifact: (fileName, content)      => ipcRenderer.invoke('viewer:uploadEvaluationArtifact', fileName, content),
})
```

### 3.2 `runStabilityAnalysis` — IPC 가 아닌 백엔드 fetch wrapper

워크벤치 환경에서는 **CLI 를 Electron main 이 직접 spawn 하지 않습니다**. 백엔드 FastAPI 가 NastranBridge 와 동일한 패턴으로 `subprocess.run` 합니다. 따라서 main process 핸들러는 fetch wrapper 입니다:

```js
// workbench main.js
const fetch = require('node-fetch')   // 또는 Node 18+ 의 globalThis.fetch
const BACKEND_BASE = 'http://localhost:9091'   // 사내 백엔드 base URL (환경변수 우선)

ipcMain.handle('viewer:runStabilityAnalysis', async (_e, posturePath) => {
  try {
    // 1) 작업 요청 — jobId 받음
    const reqRes = await fetch(`${BACKEND_BASE}/api/analysis/module-stability/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posturePath }),
    })
    if (!reqRes.ok) {
      return { ok: false, error: `백엔드 요청 실패: ${reqRes.status}` }
    }
    const { jobId } = await reqRes.json()

    // 2) 폴링 — 백엔드 job_status_store 조회 (1초 간격, 최대 2분)
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const statusRes = await fetch(`${BACKEND_BASE}/api/analysis/module-stability/${jobId}/status`)
      if (!statusRes.ok) continue
      const job = await statusRes.json()
      if (job.status === 'Success') {
        // job.project.result_info.stabilityReport 또는 stabilityPath 에서 결과 읽기
        return { ok: true, report: job.project.result_info.stabilityReport, stabilityPath: job.project.result_info.stabilityPath }
      }
      if (job.status === 'Failed') {
        return { ok: false, error: job.message ?? 'CLI 실행 실패', stderr: job.engine_log }
      }
    }
    return { ok: false, error: '시간 초과 (2분)' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})
```

> Studio 측의 `host.runStabilityAnalysis(posturePath)` 호출 시그니처와 반환 형식은 동일 — 내부 구현만 spawn → fetch 로 바뀐 것. Studio 는 한 줄도 수정 불필요.

### 3.3 ModelBuilderStudio 와 비교

| 채널 | ModelBuilderStudio | ModuleUnitStudio |
|------|-------------------|------------------|
| `viewer:pickFolder` | ✅ 사용 | ✅ 동일하게 사용 (재구현 불필요) |
| `viewer:getInitialFolder` | ✅ 사용 | ✅ 동일 |
| `viewer:writeFile` | ✅ 사용 | ✅ 동일 |
| `viewer:runStabilityAnalysis` | ❌ 없음 | ✅ **신규 — 백엔드 fetch wrapper** |
| `viewer:uploadEvaluationArtifact` | ❌ 없음 | ⚪ 선택 (없어도 폴더 폴백 동작) |

**Frontend(Electron) 측에 신규로 추가할 것은 `viewer:runStabilityAnalysis` 한 채널뿐**입니다.

---

## 4. Workbench Backend(FastAPI) — 자세안정성 service + router 추가

자세안정성 해석은 `NastranBridge` 와 동일한 패턴으로 백엔드 Python 측이 `subprocess.run` 으로 CLI 를 spawn 합니다. 따라서 IPC 핸들러가 아니라 **백엔드 service + router 가 추가될 곳**입니다.

폴더/파일 IO 채널 (`viewer:pickFolder` / `getInitialFolder` / `writeFile`) 은 ModelBuilderStudio 통합 시 이미 만들어 두었을 것이므로 **신규 작업은 자세안정성 채널 한 개뿐**입니다.

### 4.1 `app/services/module_stability_service.py` 추가 (신규)

NastranBridge service (`groupmoduleunit_service.py`) 를 그대로 베껴 작성합니다. 핵심 spawn 부분만 ModuleAnalysis.Cli.exe 로 교체:

```python
"""ModuleAnalysis 자세안정성 평가 서비스.

InHouseProgram/GroupModuleAnalysis/ModuleAnalysis.Cli.exe 를 호출해
<원본>_posture.json → <원본>_stability.json 을 산출하고, 결과 JSON 을 읽어
job_status_store 에 그대로 보관한다.
"""
from __future__ import annotations
import json, logging, os, subprocess
from datetime import datetime
from typing import Any, Dict
from .. import database, models
from ..services.job_manager import job_status_store

logger = logging.getLogger(__name__)


def task_execute_module_stability(
    job_id: str,
    posture_json_path: str,
    employee_id: str,
    timestamp: str,
    source: str,
):
    """ModuleAnalysis.Cli.exe 를 호출해 자세안정성 해석 결과 _stability.json 을 산출."""
    job_status_store.update_job(job_id, {
        "status": "Running", "progress": 10, "message": "ModuleAnalysis 초기화 중...",
    })

    db = database.SessionLocal()
    status_msg = "Success"
    engine_output = ""
    result_data: Dict[str, Any] = {}

    base_dir    = os.path.dirname(os.path.abspath(__file__))   # app/services
    app_dir     = os.path.dirname(base_dir)                    # app
    backend_dir = os.path.dirname(app_dir)                     # HiTessWorkBenchBackEnd
    exe_path    = os.path.join(backend_dir, "InHouseProgram", "GroupModuleAnalysis", "ModuleAnalysis.Cli.exe")

    try:
        if not os.path.exists(exe_path):
            raise FileNotFoundError(f"CLI 실행 파일을 찾을 수 없습니다: {exe_path}")
        if not os.path.exists(posture_json_path):
            raise FileNotFoundError(f"_posture.json 을 찾을 수 없습니다: {posture_json_path}")

        # 결과는 입력과 같은 폴더에 <원본>_stability.json 으로 떨어뜨린다.
        stability_path = posture_json_path.replace("_posture.json", "_stability.json")

        cmd_args = [exe_path, posture_json_path, stability_path]
        job_status_store.update_job(job_id, {"progress": 40, "message": "CLI 실행 중..."})
        logger.info("[ModuleStability] cmd: %s", " ".join(cmd_args))

        result = subprocess.run(
            cmd_args,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=180,
        )
        engine_output = result.stdout.decode("utf-8", errors="replace")
        stderr_text   = result.stderr.decode("utf-8", errors="replace")
        if stderr_text.strip():
            engine_output += f"\n[stderr] {stderr_text.strip()}"

        if result.returncode == 2:
            raise RuntimeError("인자/입력 오류 (exit 2). _posture.json 절대경로 확인 필요.")
        if result.returncode == 1:
            raise RuntimeError(f"실행 오류 (exit 1). stderr 참조.\n{stderr_text}")
        if result.returncode != 0:
            raise RuntimeError(f"ModuleAnalysis.Cli exit {result.returncode}")

        if not os.path.exists(stability_path):
            raise FileNotFoundError(f"결과 JSON 미생성: {stability_path}")

        with open(stability_path, "r", encoding="utf-8") as f:
            stability_report = json.load(f)

        result_data = {
            "posture":         posture_json_path,
            "stabilityPath":   stability_path,
            "stabilityReport": stability_report,
        }
        engine_output += f"\n[OK] 자세안정성 해석 완료 — schema {stability_report.get('meta', {}).get('schema', 'unknown')}"

    except subprocess.TimeoutExpired:
        status_msg = "Failed"
        engine_output += "\n[Error] CLI 실행 시간 초과 (3분)."
    except Exception as e:
        status_msg = "Failed"
        logger.error("ModuleStability 실행 오류: %s", str(e), exc_info=True)
        engine_output += f"\n[Error] {str(e)}"

    job_status_store.update_job(job_id, {"progress": 95, "message": "DB 저장 중..."})

    project_data = None
    try:
        new_analysis = models.Analysis(
            project_name=f"ModuleStability_{timestamp}",
            program_name="ModuleStability",
            employee_id=employee_id,
            status=status_msg,
            input_info={"posture": posture_json_path},
            result_info=result_data if result_data else None,
            source=source,
        )
        db.add(new_analysis); db.commit(); db.refresh(new_analysis)
        project_data = {
            "id": new_analysis.id,
            "project_name": new_analysis.project_name,
            "program_name": new_analysis.program_name,
            "employee_id":  new_analysis.employee_id,
            "status":       new_analysis.status,
            "input_info":   new_analysis.input_info,
            "result_info":  new_analysis.result_info,
            "created_at":   new_analysis.created_at.isoformat() if new_analysis.created_at else datetime.now().isoformat(),
        }
    except Exception as db_e:
        status_msg = "Failed"
        engine_output += f"\nDB Error: {db_e}"
    finally:
        db.close()

    job_status_store.update_job(job_id, {
        "status":     status_msg,
        "progress":   100,
        "message":    "자세안정성 해석 완료" if status_msg == "Success" else "자세안정성 해석 실패",
        "engine_log": engine_output,
        "project":    project_data,
    })
```

### 4.2 `app/routers/analysis.py` 에 router 추가 (신규)

NastranBridge 라우터(`/analysis/groupmoduleunit/request`) 를 베껴 작성:

```python
from ..services.module_stability_service import task_execute_module_stability

class ModuleStabilityRequest(BaseModel):
    posturePath: str

@router.post("/analysis/module-stability/request")
async def request_module_stability(
    req: ModuleStabilityRequest,
    background_tasks: BackgroundTasks,
    employee_id: str = Depends(get_current_employee_id),
):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    job_id = job_status_store.create_job()
    background_tasks.add_task(
        task_execute_module_stability,
        job_id=job_id,
        posture_json_path=req.posturePath,
        employee_id=employee_id,
        timestamp=timestamp,
        source="ModuleUnitStudio",
    )
    return {"jobId": job_id}

@router.get("/analysis/module-stability/{job_id}/status")
async def module_stability_status(job_id: str):
    job = job_status_store.get_job(job_id)
    if not job:
        raise HTTPException(404, f"job not found: {job_id}")
    return job
```

### 4.3 폴더/파일 IO 핸들러 (ModelBuilderStudio 통합 시 이미 있음 — 참고용)

`viewer:pickFolder` / `getInitialFolder` / `writeFile` 의 main process 핸들러 구현은 [ModelBuilderStudio README §Workbench(Electron) 이식 가이드](https://github.com/HyperKwonHyukmin/ClaudeModelBuilerViewer) 와 동일. 이미 ModelBuilderStudio 가 통합돼 있다면 **재구현 불필요**, 같은 핸들러를 그대로 재사용합니다.

### 4.4 `viewer:uploadEvaluationArtifact` (선택, 미구현 시 자동 폴더 폴백)

백엔드 `userConnection` 으로 `_edited.json` / `_posture.json` 업로드. 노출하지 않으면 Studio 가 자동으로 로컬 폴더 쓰기로 폴백.

---

## 5. 산출물 배치 위치 (사내 표준)

워크벤치는 electron-builder 의 `extraResources` 로 통째로 패키징하지 않고, 산출물을 **3 곳에 분산 배치**합니다:

### 5.1 디렉터리 레이아웃

```
[ Studio zip 배포 위치 — 사내 storage UNC ]
\\storage.hpc.hd.com\a476854\00_PROJECT\AA_300_CF44\[개인 자료]\권혁민 책임연구원\
HiTessWorkBench\StudioProgram\
├── model-studio-<ver>.zip                    ← ModelBuilderStudio (기존)
├── model-studio-<ver>.zip.sha256
├── module-unit-studio-<ver>.zip              ← ModuleUnitStudio (현재 0.0.1 업로드 완료)
└── module-unit-studio-<ver>.zip.sha256

[ CLI exe 배치 위치 — 백엔드 로컬 ]
<HiTessWorkBenchBackEnd>\InHouseProgram\
├── NastranBridge\nastran_bridge.exe          ← 기존
├── HiTessModeBuilder\Cmb.Cli.exe             ← 기존 (ModelBuilder)
└── GroupModuleAnalysis\
    ├── ModuleGroupUnitAnalysis.exe           ← 기존 (group module unit BDF 검증)
    └── ModuleAnalysis.Cli.exe                ← 신규 (자세안정성 — 사용자 배치 완료)
        + .NET 8 런타임 dll들                  ← self-contained 라면 동반 필수

[ 사용자 PC — Workbench 클라이언트 ]
%APPDATA%\Workbench\viewers\
├── model-studio\          ← /api/viewers/download 로 받아 자동 압축 해제
└── module-unit-studio\    ← 동일
```

### 5.2 zip 배포 흐름 (frontend ↔ backend 자동)

ModelBuilderStudio 가 이미 검증한 흐름이 그대로 작동합니다:

```
1. 사용자가 사내 storage UNC 폴더에 zip 업로드 (이번 0.0.1 은 완료)
2. Frontend(Electron): GET /api/viewers/manifest/module-unit-studio
3. Backend(viewers.py): UNC 폴더 스캔 → manifest + sha256 + uncPath 반환
4. Frontend: uncPath 로 fs.copyFile (DRM 우회)  ← 사내망 표준
   (UNC 접근 안 되는 환경에선 GET /api/viewers/download 로 HTTP 폴백)
5. Frontend: zip 풀어 %APPDATA%\Workbench\viewers\module-unit-studio\
6. BrowserWindow.loadFile('module-unit-studio/index.html')
```

**`viewers.py` 측 코드는 수정 불필요** — 이미 `_DEFAULT_VIEWER_DIR` 가 사내 storage UNC 로 설정돼 있고, `_find_zip(viewer_id)` 가 `viewer_id` prefix 매칭으로 최신 버전을 자동 선택합니다. `module-unit-studio-` prefix 만 맞추면 즉시 인식됩니다.

### 5.3 CLI exe 배치 (사용자 작업 — 완료)

```
<HiTessWorkBenchBackEnd>\InHouseProgram\GroupModuleAnalysis\ModuleAnalysis.Cli.exe
```

이 위치는 NastranBridge / HiTessModeBuilder 와 동일 패턴이며, §4.1 의 service 코드가 이 정확한 경로로 spawn 합니다:

```python
exe_path = os.path.join(backend_dir, "InHouseProgram", "GroupModuleAnalysis", "ModuleAnalysis.Cli.exe")
```

**self-contained 빌드라면 .NET 8 런타임 dll 이 함께 있어야 합니다** — 단일 exe 만 두면 첫 실행 시 `FileNotFoundException` 가 stderr 로 떨어집니다. 빌드 폴더(`publish/win-x64-self-contained/`) 통째 복사 권장.

---

## 6. 통합 후 동작 검증 체크리스트

다음 5 가지가 모두 동작하면 이식 완료:

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| 1 | Workbench 의 ModuleUnitStudio 카드 클릭 | Frontend 가 `/api/viewers/manifest/module-unit-studio` 호출 → zip 다운로드 → BrowserWindow 가 열리고 Studio UI 표시 |
| 2 | Workbench 가 사전 폴더 결정 → Studio 자동 로드 | "폴더 열기" 누르지 않아도 stage 표시 (`getInitialFolder`) |
| 3 | 사이드바 "폴더 열기" 클릭 | 네이티브 폴더 선택 다이얼로그가 뜨고 새 폴더 로드 (`pickFolder`) |
| 4 | 편집 모드 → "최종 모델 출력" 클릭 | 같은 폴더에 `<원본>_edit.json` 생성 (`writeFile`) |
| 5 | 권상 위치 지정 → "자세안정성 평가 실행" | `_edited.json` + `_posture.json` 저장 → 백엔드 `/api/analysis/module-stability/request` 호출 → CLI spawn → 결과 패널에 stage 카드 표시 |

5번이 동작하지 않으면 진단 순서:

| 증상 | 의심 지점 |
|------|----------|
| `host.runStabilityAnalysis is not a function` | preload 에 `runStabilityAnalysis` 노출 누락 (§3.1) |
| `백엔드 요청 실패: 404` | router 미등록 — `/api/analysis/module-stability/request` 엔드포인트 추가 (§4.2) |
| `백엔드 요청 실패: 500` 또는 `CLI 실행 파일을 찾을 수 없습니다` | `<Backend>\InHouseProgram\GroupModuleAnalysis\ModuleAnalysis.Cli.exe` 부재 또는 dll 누락 (§5.3) |
| `exit 2` (인자 오류) | Studio 가 넘긴 posturePath 가 절대경로가 아닐 가능성. `path.isabs()` 로그 추가 |
| `exit 1` (실행 오류) | stderr 로그 확인 — _posture.json 스키마 / _edited.json 동봉 위치 점검 |

---

## 7. 자주 빠지는 함정

- **`getInitialFolder` 가 `{ files: [] }` 를 돌려주면 안 됨** — 폴더가 없으면 `null`. 빈 객체는 Studio 가 "0개 로드" 상태로 굳어집니다.
- **`files[].content` 는 반드시 UTF-8 문자열** — Buffer 를 그대로 넘기면 IPC 직렬화 후 `JSON.parse` 가 깨집니다.
- **`runStabilityAnalysis` 에 항상 `posturePath` 절대경로를 넘김** — Studio 가 `useStageStore.sourceFolderRef` (= ElectronHost 의 폴더 경로 문자열) + `_posture.json` 을 join 해서 절대경로를 만들어 넘깁니다. 백엔드 service 에서 한 번 더 `os.path.isabs()` 검증 권장.
- **CLI exe 가 self-contained 이면 폴더 통째 복사** — 단일 exe 만 복사하면 .NET 런타임 dll 이 없어 실행 시 `FileNotFoundException`.
- **Windows Defender 첫 실행 지연** — self-contained 빌드 첫 spawn 시 ~수 초 지연이 발생할 수 있습니다. Studio 측 결과 패널은 스피너만 더 오래 보일 뿐 별도 처리 불필요. 백엔드 timeout 은 NastranBridge 와 동일하게 ~3 분으로 설정.
- **백엔드 비동기 작업 폴링 간격** — Frontend 에서 1 초 간격 폴링으로 충분 (CLI 자체는 50~150ms). 더 짧게 하면 백엔드 부하만 늘고 정확도 이득 없음.

---

## 8. 갱신 사이클 — 누가 무엇을 다시 빌드하는가

| 변경 내용 | 다시 빌드/배포할 대상 | Workbench 본체 재빌드? |
|----------|----------------------|----------------------|
| Studio UI/기능 변경 | `npm run package` → 새 zip 을 사내 storage UNC 에 업로드 | ❌ 불필요 (다음 클릭 시 frontend 가 자동 다운로드) |
| `posture-stability-spec.md` 변경 (CLI 입출력 호환 유지) | Studio 만 재배포 | ❌ |
| `ModuleAnalysis.Cli` 알고리즘 개선 | `dotnet publish` → exe 폴더를 백엔드 `InHouseProgram\GroupModuleAnalysis\` 에 덮어쓰기 | ❌ (백엔드 service 가 같은 경로를 spawn) |
| Studio ↔ CLI JSON 스키마 호환 깨짐 | Studio + CLI 동시 배포 | ❌ |
| 새 router 엔드포인트 추가 | 백엔드만 재시작 | ❌ |
| Workbench Frontend(Electron) IPC 시그니처 변경 | Workbench 본체 재빌드 | ✅ (드물게) |

**일상 개발에서 Workbench 본체를 다시 빌드할 일은 거의 없음** — Studio zip / CLI exe / 백엔드 서비스 모두 본체 외부 자산이라 hot-swap 가능합니다.

---

## 9. 변경 이력

| 버전 | 날짜       | 내용 |
|------|------------|------|
| 1.0   | 2026-05-06 | 초기 작성 — Electron IPC 직접 spawn 가정 (오류) |
| 1.0.1 | 2026-05-06 | §1.3 사내 공유 경로 추가 (`module-unit-studio-0.0.1.zip` 위치) |
| **2.0** | **2026-05-06** | **실제 워크벤치 아키텍처(FastAPI 백엔드 + Electron 프론트) 반영. §3.2 `runStabilityAnalysis` 를 백엔드 fetch wrapper 로 전환, §4 를 백엔드 service+router 패턴으로 재작성, §5 의 `extraResources` 단일 패키징을 사내 storage UNC + InHouseProgram 폴더 분산 배치로 정정** |
