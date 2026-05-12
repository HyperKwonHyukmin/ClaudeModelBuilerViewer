import { create } from 'zustand'
import {
  createIntent,
  validateIntent,
  serializeIntents,
  parseIntents,
} from '../data/EditIntent.js'
import { useStageStore } from './useStageStore.js'
import { getHost } from '../host/host.js'

/**
 * useEditStore — 편집 모드 상태 + EditIntent 목록 관리.
 *
 * StageData 는 절대 변경하지 않는다 — 이 스토어가 가진 intents[] 만으로
 * derived 미리보기 씬과 export JSON 을 만든다.
 */
export const useEditStore = create((set, get) => ({
  // 편집 모드 ON/OFF
  enabled: false,

  // 누적된 EditIntent 들 (배열 순서가 적용 순서)
  intents: [],

  // 패널에서 선택된 intent (포커스 카메라 이동 등에 사용)
  selectedIntentId: null,

  // 진입 시 1회 토스트를 보여주기 위한 플래그
  hasShownEntryToast: false,

  // Rigid 연결을 위해 선택된 노드들 (편집 모드에서 Shift+Click 으로 토글)
  pendingNodeSelection: [],

  setEnabled: (enabled) => set(s => ({
    enabled,
    // 편집 모드 끌 때 다중 선택은 자동 비움 (의도하지 않은 잔재 방지)
    pendingNodeSelection: enabled ? s.pendingNodeSelection : [],
  })),
  toggleEnabled: () => set(s => ({
    enabled: !s.enabled,
    pendingNodeSelection: s.enabled ? [] : s.pendingNodeSelection,
  })),
  markEntryToastShown: () => set({ hasShownEntryToast: true }),

  /**
   * 노드 ID 를 다중 선택 목록에서 토글한다 (이미 있으면 제거, 없으면 추가).
   * Shift+Click 흐름에서 호출.
   */
  toggleNodeSelection: (nodeId) => {
    if (nodeId == null) return
    set(s => {
      const has = s.pendingNodeSelection.includes(nodeId)
      return {
        pendingNodeSelection: has
          ? s.pendingNodeSelection.filter(id => id !== nodeId)
          : [...s.pendingNodeSelection, nodeId],
      }
    })
  },

  setNodeSelection: (nodeIds) => set({
    pendingNodeSelection: Array.isArray(nodeIds) ? [...nodeIds] : [],
  }),

  clearNodeSelection: () => set({ pendingNodeSelection: [] }),

  /**
   * 새 intent 를 추가한다.
   *
   *   addIntent({ kind: 'addRigid', params: { ... } })
   *
   * - validation 결과를 자동으로 채워서 저장한다.
   * - status='error' 면 거절(반환값 false), 그 외에는 저장(true).
   *
   * @param {{ kind: string, params: object }} draft
   * @returns {{ ok: boolean, intent: object|null, validation: object }}
   */
  addIntent: (draft) => {
    const stage = currentStage()
    const intent = createIntent(draft.kind, draft.params)
    const validation = validateIntent(intent, stage, get().intents)
    intent.validation = validation

    if (validation.status === 'error') {
      return { ok: false, intent: null, validation }
    }
    set(s => ({ intents: [...s.intents, intent] }))
    return { ok: true, intent, validation }
  },

  removeIntent: (id) => {
    set(s => ({
      intents: s.intents.filter(i => i.id !== id),
      selectedIntentId: s.selectedIntentId === id ? null : s.selectedIntentId,
    }))
  },

  clearIntents: () => set({ intents: [], selectedIntentId: null }),

  selectIntent: (id) => set({ selectedIntentId: id }),

  /**
   * 현재 intents 를 직렬화한 객체를 반환한다 (파일 저장은 호출자가 수행).
   * @returns {object}
   */
  buildExportPayload: () => {
    const stage = currentStage()
    return serializeIntents(get().intents, stage)
  },

  /**
   * 편집 의도를 파일로 저장한다.
   *
   * 저장 위치 우선순위:
   *   1) host.writeFile(folderRef, ...) — "폴더 열기" 로 받은 폴더에 직접 쓰기 (가장 자연스러움)
   *      WebHost: FileSystemDirectoryHandle, ElectronHost: 폴더 경로 문자열
   *   2) window.showSaveFilePicker() — 사용자가 위치 직접 선택 (Web 전용)
   *   3) <a download> — 브라우저 다운로드 폴더 (Web 전용)
   *
   * 파일명 규칙: `<마지막 stage 의 sourceFileName>_edit.json` (.json 확장자 제거 후 _edit.json)
   * sourceFileName 이 없으면 `edit-intent_<phase>_<timestamp>.json` 으로 fallback.
   *
   * @returns {Promise<{ ok: boolean, fileName?: string, location?: 'folder'|'picker'|'download', error?: string }>}
   */
  exportToFile: async () => {
    const intents = get().intents
    if (intents.length === 0) {
      return { ok: false, error: '내보낼 intent 가 없습니다.' }
    }
    const stage = currentStage()
    const payload = serializeIntents(intents, stage)
    const json = JSON.stringify(payload, null, 2)
    const fileName = buildExportFileName(stage)

    // 1) "폴더 열기" 흐름의 folderRef — host 가 환경별 IO 를 담당
    const folderRef = useStageStore.getState().sourceFolderRef
    if (folderRef != null) {
      const r = await getHost().writeFile(folderRef, fileName, json)
      if (r.ok) return { ok: true, fileName, location: 'folder' }
      console.warn('[exportToFile] host.writeFile failed, falling back:', r.error)
    }

    // 2) showSaveFilePicker — 사용자가 위치 선택 (Web 전용)
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      try {
        const fh = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'EditIntent JSON', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await fh.createWritable()
        await writable.write(json)
        await writable.close()
        return { ok: true, fileName: fh.name, location: 'picker' }
      } catch (e) {
        if (e?.name === 'AbortError') return { ok: false, error: '취소되었습니다' }
        // 그 외 오류는 download 로 폴백
        console.warn('[exportToFile] showSaveFilePicker failed, falling back:', e)
      }
    }

    // 3) download (브라우저 다운로드 폴더)
    if (typeof document === 'undefined') {
      return { ok: false, error: '브라우저 환경이 아닙니다.' }
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return { ok: true, fileName, location: 'download' }
  },

  /**
   * Import — JSON 텍스트(또는 객체) 를 받아 intents 를 교체 또는 합친다.
   * stageRef 가 현재 단계와 다르면 경고를 함께 반환한다.
   *
   * @param {string|object} input
   * @param {{ mode?: 'replace'|'append' }} [opts]   mode 기본값 'replace'
   * @returns {{ ok: boolean, count?: number, addedCount?: number, warning?: string, error?: string }}
   */
  importFromJson: (input, opts = {}) => {
    const mode = opts.mode === 'append' ? 'append' : 'replace'

    let json
    try {
      json = typeof input === 'string' ? JSON.parse(input) : input
    } catch (e) {
      return { ok: false, error: `JSON 파싱 실패: ${e.message}` }
    }

    let parsed
    try {
      parsed = parseIntents(json)
    } catch (e) {
      return { ok: false, error: e.message }
    }

    let warning
    const stage = currentStage()
    if (parsed.stageRef && stage?.meta) {
      const cur = stage.meta
      const ref = parsed.stageRef
      if (
        (ref.phase != null && cur.phase != null && ref.phase !== cur.phase) ||
        (ref.stageName != null && cur.stageName != null && ref.stageName !== cur.stageName)
      ) {
        warning = `Import 한 intent 의 stageRef(${ref.phase}/${ref.stageName})가 현재 단계(${cur.phase}/${cur.stageName})와 다릅니다.`
      }
    }

    const addedCount = parsed.intents.length
    if (mode === 'append') {
      set(s => ({ intents: [...s.intents, ...parsed.intents], selectedIntentId: null }))
    } else {
      set({ intents: parsed.intents, selectedIntentId: null })
    }
    const totalCount = get().intents.length
    return { ok: true, count: totalCount, addedCount, warning }
  },

  /**
   * Import 시 stageRef 호환성과 기존 intents 존재 여부를 미리 검사한다.
   * UI 가 다이얼로그 띄울지 즉시 import 할지 결정하는 데 사용.
   *
   * @param {string|object} input
   * @returns {{ ok: boolean, count?: number, error?: string, stageMismatch?: string, hasExisting: boolean }}
   */
  inspectImport: (input) => {
    let json
    try {
      json = typeof input === 'string' ? JSON.parse(input) : input
    } catch (e) {
      return { ok: false, error: `JSON 파싱 실패: ${e.message}`, hasExisting: get().intents.length > 0 }
    }
    let parsed
    try {
      parsed = parseIntents(json)
    } catch (e) {
      return { ok: false, error: e.message, hasExisting: get().intents.length > 0 }
    }
    let stageMismatch
    const stage = currentStage()
    if (parsed.stageRef && stage?.meta) {
      const cur = stage.meta
      const ref = parsed.stageRef
      if (
        (ref.phase != null && cur.phase != null && ref.phase !== cur.phase) ||
        (ref.stageName != null && cur.stageName != null && ref.stageName !== cur.stageName)
      ) {
        stageMismatch = `Import 파일의 stageRef(${ref.phase}/${ref.stageName})가 현재 단계(${cur.phase}/${cur.stageName})와 다릅니다.`
      }
    }
    return {
      ok: true,
      count: parsed.intents.length,
      hasExisting: get().intents.length > 0,
      stageMismatch,
    }
  },

  reset: () => set({
    enabled: false,
    intents: [],
    selectedIntentId: null,
    hasShownEntryToast: false,
    pendingNodeSelection: [],
  }),
}))

// ── 내부 유틸 ────────────────────────────────────────────────────────────

/**
 * 현재 활성 단계의 StageData 를 반환한다.
 * useStageStore 와 useViewerStore 의 결합도를 줄이기 위해 lazy 로 import 한다.
 */
function currentStage() {
  try {
    // useViewerStore 의 첫 viewport stageIndex 기준 — 단순한 휴리스틱.
    // (Phase 1 에서는 활성 viewport 식별이 필요하면 store 끼리 의존을 추가)
    const stages = useStageStore.getState().stages
    if (!stages || stages.length === 0) return null
    return stages[stages.length - 1] ?? null
  } catch {
    return null
  }
}

// dev 모드에서만 store 를 window 에 노출 — 자동화 검증/디버깅용. 프로덕션 빌드에는 포함되지 않는다.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__editStore = useEditStore
  window.__stageStore = useStageStore
  // useViewerStore 는 순환 의존을 피하려고 동적 import 후 노출
  import('./useViewerStore.js').then(({ useViewerStore }) => {
    window.__viewerStore = useViewerStore
  })
}

/**
 * 편집 의도 export 파일명 결정:
 *   - lastStage.sourceFileName 이 있으면 → `<basename>_edit.json` (예: 06_Validation_edit.json)
 *   - 없으면 → `edit-intent_<phase>_<timestamp>.json` (구버전 호환)
 */
function buildExportFileName(stage) {
  const src = stage?.sourceFileName
  if (src) {
    const base = src.replace(/\.json$/i, '')
    return `${base}_edit.json`
  }
  const phase = stage?.meta?.phase ?? 'X'
  const ts = formatTimestamp(new Date())
  return `edit-intent_${phase}_${ts}.json`
}

function formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}
