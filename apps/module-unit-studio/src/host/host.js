/**
 * Host adapter — 실행 환경(브라우저 단독 vs Workbench Electron)을 추상화하는 IO 경계.
 *
 * 모든 폴더/파일 IO 는 이 인터페이스를 통해 흐른다. Sidebar/useEditStore 는
 * 환경을 모르고 host.pickFolder() / host.writeFile() / host.getInitialFolder() 만
 * 호출한다. 부팅 시 detectHost() 가 환경을 감지해 단일 host 를 선택한다.
 *
 * ── Host 인터페이스 ──────────────────────────────────────────────────────
 *   name                                   : 'web' | 'electron'
 *   pickFolder()                           : Promise<{ cancelled: true } | { folderRef, files }>
 *   getInitialFolder()                     : Promise<null | { folderRef, files }>
 *   writeFile(folderRef, name, content)    : Promise<{ ok, error?, location? }>
 *
 *   // 선택 기능 (지원하는 host 만 노출):
 *   uploadEvaluationArtifact(name, content) : Promise<{ ok, error?, location?, remotePath? }>
 *     자세안정성 평가 입력 산출물(편집 적용 모델 _edited.json + 권상 설정 _posture.json 등)을
 *     백엔드 userConnection 폴더로 업로드한다. 파일명 suffix 로 백엔드가 종류를 식별한다.
 *     ElectronHost(Workbench) 에서만 노출 — Web 단독 모드는 미구현 (호출 측이 폴백 처리).
 *
 *   runStabilityAnalysis(posturePath) : Promise<{ ok, report?, error?, exitCode?, stderr?, stabilityPath? }>
 *     ModuleAnalysis.Cli.exe 를 실행해 _posture.json 으로부터 _stability.json 을 생성하고
 *     그 결과 객체를 돌려준다. posturePath 는 _posture.json 의 절대경로.
 *     ElectronHost(Workbench) 에서만 활성화 — preload 가 noop 으로 노출하지 않으면 정의되지 않는다.
 *     호출 측은 typeof host.runStabilityAnalysis === 'function' 으로 가용성을 확인.
 *
 * folderRef 는 host 별 불투명 객체. 호출자는 보존만 하고 다시 host 에 넘긴다.
 */

// ── WebHost — 브라우저 단독 (현재 동작) ─────────────────────────────────
class WebHost {
  constructor() { this.name = 'web' }

  async pickFolder() {
    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
      return { cancelled: true, error: '이 브라우저는 폴더 선택을 지원하지 않습니다.' }
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      const files = []
      await collectJsonFiles(dirHandle, files)
      return { folderRef: dirHandle, files }
    } catch (err) {
      if (err?.name === 'AbortError') return { cancelled: true }
      throw err
    }
  }

  // Web 단독 모드에서는 자동 주입 폴더가 없다.
  async getInitialFolder() { return null }

  async writeFile(folderRef, fileName, content) {
    if (!folderRef || typeof folderRef.getFileHandle !== 'function') {
      return { ok: false, error: '폴더 참조가 유효하지 않습니다.' }
    }
    try {
      if (typeof folderRef.requestPermission === 'function') {
        const p = await folderRef.requestPermission({ mode: 'readwrite' })
        if (p !== 'granted') return { ok: false, error: '폴더 쓰기 권한이 거절되었습니다.' }
      }
      const fh = await folderRef.getFileHandle(fileName, { create: true })
      const writable = await fh.createWritable()
      await writable.write(content)
      await writable.close()
      return { ok: true, location: 'folder' }
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  }
}

// ── ElectronHost — Workbench (preload 가 window.workbenchAPI 를 주입) ─────
//
// Workbench 측 preload 가 다음 API 를 노출한다고 가정한다:
//   window.workbenchAPI = {
//     pickFolder()           : Promise<null | { folderPath: string, files: { name, content }[] }>
//     getInitialFolder()     : Promise<null | { folderPath: string, files: { name, content }[] }>
//     writeFile(folderPath, fileName, content) : Promise<{ ok: boolean, error?: string }>
//
//     // 선택 (있으면 자세안정성 평가 입력이 이쪽으로 업로드됨):
//     uploadEvaluationArtifact(fileName, content) :
//        Promise<{ ok: boolean, error?: string, remotePath?: string }>
//        Workbench 측에서 인증 컨텍스트(userConnection)를 알고 백엔드 REST/IPC 로 전송.
//        편집 적용된 _edited.json 과 권상 설정 _posture.json 모두 같은 채널로 업로드된다.
//
//     // 선택 (있으면 _posture.json 저장 후 자동으로 자세안정성 해석 실행):
//     runStabilityAnalysis(posturePath) :
//        Promise<{ ok: boolean, report?: object, error?: string, exitCode?: number, stderr?: string, stabilityPath?: string }>
//        Electron main process 가 child_process.spawn 으로 ModuleAnalysis.Cli.exe 호출
//        (resources/ModuleAnalysis/ModuleAnalysis.Cli.exe). 결과 _stability.json 을 읽어 객체로 반환.
//        실패 시 { ok: false, error, exitCode, stderr }.
//   }
// files[].content 는 UTF-8 문자열이고, Web 환경의 File 객체와 호환되도록
// 이 어댑터에서 Blob 으로 감싸 file-like 로 변환한다 (fileLoader 가 .text() 만 호출).
class ElectronHost {
  constructor(api) {
    this.name = 'electron'
    this.api = api
    // 백엔드 업로드 채널이 preload 에 노출돼 있을 때만 메서드를 활성화한다.
    // (없으면 useEditStore 가 폴더 쓰기 폴백으로 진행.)
    if (typeof api?.uploadEvaluationArtifact === 'function') {
      this.uploadEvaluationArtifact = async (fileName, content) => {
        try {
          const r = await api.uploadEvaluationArtifact(fileName, content)
          return r?.ok
            ? { ok: true, location: 'backend', remotePath: r.remotePath ?? null }
            : { ok: false, error: r?.error ?? '백엔드 업로드 실패' }
        } catch (e) {
          return { ok: false, error: e?.message ?? String(e) }
        }
      }
    }

    // ModuleAnalysis.Cli.exe 호출 채널 — preload 가 노출했을 때만 메서드 부여.
    // 호출 측은 typeof host.runStabilityAnalysis === 'function' 으로 가용성 검사.
    if (typeof api?.runStabilityAnalysis === 'function') {
      this.runStabilityAnalysis = async (posturePath) => {
        try {
          const r = await api.runStabilityAnalysis(posturePath)
          if (!r) return { ok: false, error: '응답이 없습니다 (preload 미응답).' }
          if (r.ok) {
            return {
              ok: true,
              report: r.report ?? null,
              stabilityPath: r.stabilityPath ?? null,
              exitCode: r.exitCode ?? 0,
            }
          }
          return {
            ok: false,
            error: r.error ?? '자세안정성 해석 실행 실패',
            exitCode: r.exitCode ?? null,
            stderr: r.stderr ?? null,
          }
        } catch (e) {
          return { ok: false, error: e?.message ?? String(e) }
        }
      }
    }

    // Unit 구조 해석 (Wire 포함 BDF + Nastran SOL 101 + F06 매핑) — preload 노출 시.
    // 입력: { stabilityPath, safetyFactor, allowableMpa }
    // 결과: { ok, analysisId?, summary?, warnings?, resultPath?, result?, job? } 또는 { ok:false, error, ... }
    if (typeof api?.runUnitStructural === 'function') {
      this.runUnitStructural = async ({ stabilityPath, safetyFactor, allowableMpa } = {}) => {
        try {
          const r = await api.runUnitStructural({ stabilityPath, safetyFactor, allowableMpa })
          if (!r) return { ok: false, error: '응답이 없습니다 (preload 미응답).' }
          return r
        } catch (e) {
          return { ok: false, error: e?.message ?? String(e) }
        }
      }
    }
    if (typeof api?.onUnitStructuralProgress === 'function') {
      // 콜백 등록 → unsubscribe 함수 반환
      this.onUnitStructuralProgress = (callback) => api.onUnitStructuralProgress(callback)
    }
  }

  async pickFolder() {
    const r = await this.api.pickFolder()
    if (!r) return { cancelled: true }
    return { folderRef: r.folderPath, files: r.files.map(toFileLike) }
  }

  async getInitialFolder() {
    const r = await this.api.getInitialFolder?.()
    if (!r) return null
    return { folderRef: r.folderPath, files: r.files.map(toFileLike) }
  }

  async writeFile(folderRef, fileName, content) {
    if (typeof folderRef !== 'string') {
      return { ok: false, error: '폴더 경로가 유효하지 않습니다.' }
    }
    try {
      const r = await this.api.writeFile(folderRef, fileName, content)
      return r?.ok ? { ok: true, location: 'folder' } : { ok: false, error: r?.error ?? '쓰기 실패' }
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  }
}

// 폴더 안의 모든 .json 파일을 재귀적으로 모은다 (WebHost 전용).
async function collectJsonFiles(dirHandle, files) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (entry.name.endsWith('.json')) files.push(await entry.getFile())
      continue
    }
    await collectJsonFiles(entry, files)
  }
}

// Electron 측에서 받은 { name, content } 를 fileLoader 가 기대하는 file-like 로 변환.
function toFileLike({ name, content }) {
  return {
    name,
    text: async () => content,
  }
}

// ── 환경 감지 / 싱글톤 ──────────────────────────────────────────────────
export function detectHost() {
  if (typeof window !== 'undefined' && window.workbenchAPI) {
    return new ElectronHost(window.workbenchAPI)
  }
  return new WebHost()
}

let _host = null

/** 현재 host 싱글톤. 첫 호출 시 환경을 감지해 결정한다. */
export function getHost() {
  if (!_host) _host = detectHost()
  return _host
}

/** 테스트 전용 — 임의의 host 객체로 교체. null 이면 다음 getHost() 시 재감지. */
export function setHost(host) {
  _host = host
}

// 테스트 편의용 export
export { WebHost, ElectronHost }
