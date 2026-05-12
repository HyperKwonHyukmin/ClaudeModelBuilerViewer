import { create } from 'zustand'
import {
  createIntent,
  validateIntent,
  serializeIntents,
  parseIntents,
} from '../data/EditIntent.js'
import { buildEditedStageJson, buildEditedStageFileName } from '../data/applyEditedModel.js'
import { useStageStore } from './useStageStore.js'
import { useStabilityStore } from './useStabilityStore.js'
import { getHost } from '../host/host.js'

// 권상 그룹 절대 상한 (Hydro = 4, Goliat = 3, Ceiling = 1). mode 미지정 시 Hydro 상한을 따른다.
export const HOIST_MAX_GROUPS_ABS = 4
export function getHoistMaxGroups(mode) {
  if (mode === 'goliat')  return 3
  if (mode === 'ceiling') return 1
  return HOIST_MAX_GROUPS_ABS  // hydro 또는 null
}
const ALL_HOIST_GROUP_IDS = [1, 2, 3, 4]

// 천장 Crane 은 그룹당 노드 3 또는 4 개만 허용 (직선 2점 권상 불가).
// 그 외 모드(hydro/goliat) 는 그룹당 최소 2개부터 허용.
export function getHoistMinNodesPerGroup(mode) {
  if (mode === 'ceiling') return 3
  return 2
}

// 권상 와이어 기본 길이 (m) — 권상 방식별 표준 값. 사용자가 setWireLength 로 자유롭게 변경 가능.
const HOIST_DEFAULT_WIRE_M = { hydro: 8, goliat: 24, ceiling: 5 }
export function getHoistDefaultWireLengthM(mode) {
  return HOIST_DEFAULT_WIRE_M[mode] ?? null
}

const VALID_HOIST_MODES = new Set(['hydro', 'goliat', 'ceiling'])

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

  // 권상 방식/그룹 설정. Node 클릭으로 그룹별 권상점을 분류한다.
  // 디폴트는 hydro — 가장 흔한 방식이라 사용자가 매번 선택하지 않아도 즉시 권상점 지정 가능.
  hoistMode: 'hydro', // 'hydro' | 'goliat' | 'ceiling' | null
  hoistGroupCount: 1,
  activeHoistGroupId: 1,
  hoistGroups: {
    1: [],
    2: [],
    3: [],
    4: [],
  },

  // 권상 와이어 길이 (m) — 모드 전환 시 자동으로 그 모드의 기본값으로 리셋된다.
  // 사용자가 setWireLength 로 임의 변경 가능. 권상 설정 export(_posture.json)에 그대로 포함됨.
  // 디폴트 hoistMode 가 'hydro' 이므로 와이어 길이도 hydro 기본값(8m)으로 시작한다.
  wireLengthM: HOIST_DEFAULT_WIRE_M.hydro,

  // 권상 가능 배관 진단용 임계 외경(mm). null 이면 비교 미적용. setHoistMode/reset 으로 영향받지 않음.
  pipeDiameterThreshold: null,

  // 권상 UX 가이드 토스트 (예: "권상 방식을 먼저 선택해 주세요"). { id, message, kind } | null
  // id 는 새 토스트마다 증가해 같은 메시지여도 자동 dismiss 타이머가 리셋되도록 한다.
  hoistGuide: null,

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

  setHoistMode: (mode) => {
    const nextMode = VALID_HOIST_MODES.has(mode) ? mode : null
    set(s => {
      const max = getHoistMaxGroups(nextMode)
      // 모드 전환으로 새 상한을 초과하는 그룹은 비운다.
      const nextGroups = { ...s.hoistGroups }
      for (const id of ALL_HOIST_GROUP_IDS) {
        if (id > max) nextGroups[id] = []
      }
      // panel ↔ viewer 동기화 보장 invariant —
      // panel 은 hoistGroupCount 만큼만 그룹 row 를 표시하고 viewer overlay 는 hoistGroups 전체를
      // 보므로, 데이터가 있는데 hoistGroupCount 가 그보다 작으면 panel 에서 그룹이 안 보이고
      // viewer 에는 도형이 그대로 남는 mismatch 가 발생한다 (예: Hydro→Goliat→Hydro 왕복).
      // 따라서 새 모드의 max 안에서 "데이터를 가진 가장 큰 그룹 ID" 까지는 hoistGroupCount 가
      // 무조건 그 ID 이상이 되도록 강제한다. 의도적으로 그룹을 줄이려면 removeHoistGroup/clearHoistGroup 을 쓴다.
      let lastFilledId = 0
      for (const id of ALL_HOIST_GROUP_IDS) {
        if (id <= max && (nextGroups[id]?.length ?? 0) > 0) lastFilledId = id
      }
      const nextCount = Math.min(max, Math.max(s.hoistGroupCount, lastFilledId, 1))
      return {
        hoistMode: nextMode,
        hoistGroupCount: nextCount,
        activeHoistGroupId: Math.max(1, Math.min(s.activeHoistGroupId, nextCount)),
        hoistGroups: nextGroups,
        // 모드 전환 시 와이어 길이를 그 모드의 기본값으로 자동 리셋
        // (사용자가 직전 모드에서 변경한 값은 의미가 다르므로 의도적으로 폐기)
        wireLengthM: getHoistDefaultWireLengthM(nextMode),
      }
    })
  },

  setActiveHoistGroup: (groupId) => {
    if (!ALL_HOIST_GROUP_IDS.includes(groupId)) return
    const s = get()
    if (groupId > s.hoistGroupCount) return
    if (groupId > getHoistMaxGroups(s.hoistMode)) return
    set({ activeHoistGroupId: groupId })
  },

  setHoistGroupCount: (count) => {
    set(s => {
      const max = getHoistMaxGroups(s.hoistMode)
      const nextCount = Math.min(max, Math.max(1, Number(count) || 1))
      const nextGroups = { ...s.hoistGroups }
      for (const id of ALL_HOIST_GROUP_IDS) {
        if (id > nextCount) nextGroups[id] = []
      }
      // 새 그룹을 추가했으면 그 그룹을 자동 활성화 (이전 그룹은 자동 비활성화).
      // 기존 그룹 수를 줄이면 활성 ID 를 nextCount 로 클램프.
      const nextActive = nextCount > s.hoistGroupCount
        ? nextCount
        : Math.min(s.activeHoistGroupId, nextCount)
      return {
        hoistGroupCount: nextCount,
        activeHoistGroupId: nextActive,
        hoistGroups: nextGroups,
      }
    })
  },

  addHoistNode: (nodeId) => {
    if (nodeId == null) return
    const stage = currentStage()
    if (stage?.nodeMap && !stage.nodeMap.has(nodeId)) return
    set(s => {
      if (!s.hoistMode) return s
      const groupId = s.activeHoistGroupId
      if (groupId > s.hoistGroupCount) return s
      if (groupId > getHoistMaxGroups(s.hoistMode)) return s
      const current = s.hoistGroups[groupId] ?? []
      if (current.includes(nodeId)) return s
      if (current.length >= 4) return s

      const nextGroups = {}
      for (const id of ALL_HOIST_GROUP_IDS) {
        const existing = s.hoistGroups[id] ?? []
        nextGroups[id] = id === groupId
          ? [...current, nodeId]
          : existing.filter(n => n !== nodeId)
      }
      return { hoistGroups: nextGroups }
    })
  },

  removeHoistNode: (groupId, nodeId) => {
    if (!ALL_HOIST_GROUP_IDS.includes(groupId)) return
    set(s => ({
      hoistGroups: {
        ...s.hoistGroups,
        [groupId]: (s.hoistGroups[groupId] ?? []).filter(id => id !== nodeId),
      },
    }))
  },

  clearHoistGroup: (groupId) => {
    if (!ALL_HOIST_GROUP_IDS.includes(groupId)) return
    set(s => ({ hoistGroups: { ...s.hoistGroups, [groupId]: [] } }))
  },

  /**
   * 권상 그룹을 통째로 삭제한다 (단순 비우기가 아니라 카운트도 감소). 삭제된 그룹보다
   * 큰 ID 의 그룹은 한 칸씩 당겨와 ID 가 재정렬된다 (예: 2 삭제 → 기존 3 이 2 가 됨).
   * 최소 1 그룹은 유지하므로 hoistGroupCount === 1 이면 no-op.
   */
  removeHoistGroup: (groupId) => {
    if (!ALL_HOIST_GROUP_IDS.includes(groupId)) return
    set(s => {
      if (s.hoistGroupCount <= 1) return s
      if (groupId > s.hoistGroupCount) return s
      const nextCount = s.hoistGroupCount - 1
      const nextGroups = { 1: [], 2: [], 3: [], 4: [] }
      // groupId 이전 그룹은 그대로 유지
      for (let i = 1; i < groupId; i++) nextGroups[i] = [...(s.hoistGroups[i] ?? [])]
      // groupId 이후 그룹은 한 칸씩 당김
      for (let i = groupId; i <= nextCount; i++) nextGroups[i] = [...(s.hoistGroups[i + 1] ?? [])]
      // 활성 그룹 ID 조정: 삭제된 그룹이면 같은 자리(또는 마지막)로, 더 큰 ID 였으면 -1
      let nextActive = s.activeHoistGroupId
      if (nextActive === groupId)      nextActive = Math.min(groupId, nextCount)
      else if (nextActive > groupId)   nextActive = nextActive - 1
      nextActive = Math.max(1, Math.min(nextActive, nextCount))
      return {
        hoistGroups: nextGroups,
        hoistGroupCount: nextCount,
        activeHoistGroupId: nextActive,
      }
    })
  },

  // 권상 와이어 길이(m) 입력. 빈 문자열/NaN/0이하는 null 로 처리.
  setWireLength: (val) => {
    const num = (val == null || val === '') ? null : Number(val)
    set({ wireLengthM: Number.isFinite(num) && num > 0 ? num : null })
  },

  // 배관 진단 임계 외경(mm). null/0/NaN 은 비활성화로 처리.
  setPipeDiameterThreshold: (val) => {
    const num = (val == null || val === '') ? null : Number(val)
    set({ pipeDiameterThreshold: Number.isFinite(num) && num > 0 ? num : null })
  },

  /**
   * 권상 UX 가이드 토스트를 띄운다. 같은 메시지를 다시 띄워도 id 가 갱신돼
   * 토스트 컴포넌트의 자동 dismiss 타이머가 리셋된다.
   */
  flashHoistGuide: (message, kind = 'info') => {
    if (!message) return
    set(s => ({ hoistGuide: { id: (s.hoistGuide?.id ?? 0) + 1, message, kind } }))
  },
  dismissHoistGuide: () => set({ hoistGuide: null }),

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
    return serializeIntents(get().intents, stage, getHoistExport(get()))
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
    const hoisting = getHoistExport(get())
    if (intents.length === 0 && !hoisting) {
      return { ok: false, error: '내보낼 intent 또는 권상 설정이 없습니다.' }
    }
    const hoistError = validateHoistExport(hoisting)
    if (hoistError) {
      return { ok: false, error: hoistError }
    }
    const stage = currentStage()
    const payload = serializeIntents(intents, stage, hoisting)
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
      set({
        intents: parsed.intents,
        selectedIntentId: null,
        ...stateFromHoistImport(parsed.hoisting),
      })
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
    hoistMode: 'hydro',
    hoistGroupCount: 1,
    activeHoistGroupId: 1,
    hoistGroups: { 1: [], 2: [], 3: [], 4: [] },
    wireLengthM: HOIST_DEFAULT_WIRE_M.hydro,
    pipeDiameterThreshold: null,
    hoistGuide: null,
  }),

  /**
   * "자세안정성 평가 실행" 액션 — 2단계 파이프라인:
   *   1) 편집 intents 가 1개 이상 있으면 편집을 적용한 새 phase JSON (_edited.json) 을 먼저 저장.
   *   2) 권상 설정 JSON (_posture.json) 을 저장. payload 의 stageRef.editedFile 로 1단계 결과 파일명 포함.
   *
   * 각 파일은 환경에 맞춰 다음 우선순위로 저장된다:
   *   0) host.uploadEvaluationArtifact(name, content) — Workbench(Electron) 백엔드 업로드 채널
   *   1) host.writeFile(folderRef, ...) — "폴더 열기" 로 받은 로컬 폴더에 직접 쓰기
   *   2) window.showSaveFilePicker — 사용자가 위치 선택 (Web 전용)
   *   3) <a download> — 브라우저 다운로드 폴더
   *
   * 두 파일이 서로 다른 위치(예: 백엔드 + 폴더)로 갈 수 있으므로 결과는 results[] 배열로 함께 반환한다.
   * 1단계가 실패하면 2단계는 시도하지 않는다 (권상 JSON 이 가리킬 _edited.json 이 없으므로).
   *
   * @returns {Promise<{
   *   ok: boolean,
   *   results?: Array<{ kind:'edited'|'posture', ok:boolean, fileName?:string, location?:string, remotePath?:string|null, error?:string }>,
   *   error?: string,
   * }>}
   */
  exportPostureStabilityToFile: async () => {
    const state = get()
    const hoisting = getHoistExport(state)
    const hoistError = validateHoistExport(hoisting)
    if (!hoisting || hoistError) {
      return { ok: false, error: hoistError ?? '권상 설정이 없습니다.' }
    }
    const stage = currentStage()
    const intents = state.intents ?? []
    const results = []

    // 1) 편집 intents 가 있으면 편집 적용 모델 먼저 저장
    let editedFileName = null
    if (intents.length > 0 && stage) {
      const editedJson = buildEditedStageJson(stage, intents)
      const editedJsonStr = JSON.stringify(editedJson, null, 2)
      editedFileName = buildEditedStageFileName(stage, formatTimestamp)
      const r = await saveJsonArtifact(editedFileName, editedJsonStr)
      results.push({ kind: 'edited', ...r })
      if (!r.ok) {
        return { ok: false, error: `편집 모델 저장 실패: ${r.error ?? '알 수 없는 오류'}`, results }
      }
    }

    // 2) 권상 설정 JSON
    const payload = buildPostureStabilityPayload(state, hoisting, stage, editedFileName)
    const json = JSON.stringify(payload, null, 2)
    const postureFileName = buildPosturePayloadFileName(stage)
    const r = await saveJsonArtifact(postureFileName, json)
    results.push({ kind: 'posture', ...r })
    if (!r.ok) {
      return { ok: false, error: `자세안정성 저장 실패: ${r.error ?? '알 수 없는 오류'}`, results }
    }

    // 3) host 가 ModuleAnalysis.Cli 채널을 노출했으면 자동 실행:
    //    - location='backend' → r.remotePath (서버 PC 의 절대경로) 사용 → Studio/서버 PC 분리 운영 지원
    //    - location='folder'  → 사용자 PC 의 폴더 경로 + postureFileName (Studio=서버 PC 동일한 흐름)
    //    WebHost(FileSystemDirectoryHandle) 폴더 모드는 경로를 알 수 없어 자동 실행 대상 아님.
    const host = getHost()
    let posturePath = null
    if (r.location === 'backend' && r.remotePath) {
      posturePath = r.remotePath
    } else if (r.location === 'folder') {
      const folderRef = useStageStore.getState().sourceFolderRef
      if (typeof folderRef === 'string' && folderRef.length > 0) {
        posturePath = joinPath(folderRef, postureFileName)
      }
    }
    let stability = null
    if (typeof host.runStabilityAnalysis === 'function' && posturePath) {
      useStabilityStore.getState().setRunning(true)
      try {
        const sr = await host.runStabilityAnalysis(posturePath)
        if (sr.ok && sr.report) {
          useStabilityStore.getState().setReport(sr.report, { stabilityPath: sr.stabilityPath })
          useStabilityStore.getState().openPanel()
          stability = { ok: true, posturePath, stabilityPath: sr.stabilityPath ?? null }
        } else {
          useStabilityStore.getState().setError({
            message: sr.error ?? '자세안정성 해석 실패',
            exitCode: sr.exitCode ?? null,
            stderr: sr.stderr ?? null,
          })
          stability = { ok: false, error: sr.error ?? '자세안정성 해석 실패', exitCode: sr.exitCode ?? null }
        }
      } finally {
        useStabilityStore.getState().setRunning(false)
      }
    }

    return { ok: true, results, stability }
  },
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

function getHoistExport(state) {
  const mode = state.hoistMode
  const max = getHoistMaxGroups(mode)
  const groupCount = Math.min(max, Math.max(1, state.hoistGroupCount ?? 1))
  const groups = Array.from({ length: groupCount }, (_, i) => i + 1)
    .map(id => ({ id, nodeIds: [...(state.hoistGroups[id] ?? [])] }))
    .filter(g => g.nodeIds.length > 0)

  if (!mode && groups.length === 0) return null
  const modeMeta = mode === 'hydro'
    ? { id: 'hydro',   label: 'Hydro 방식',  equipment: 'Hook' }
    : mode === 'goliat'
      ? { id: 'goliat',  label: 'Goliat 방식', equipment: 'Trolley' }
      : mode === 'ceiling'
        ? { id: 'ceiling', label: '천장 Crane',   equipment: 'Crane' }
        : null

  // 와이어 길이 — 사용자가 변경한 값이 우선, 없으면 모드 기본값으로 폴백.
  const wireLengthM = state.wireLengthM ?? getHoistDefaultWireLengthM(mode)

  return {
    mode: modeMeta,
    groupCount,
    groups,
    wireLengthM,
  }
}

function validateHoistExport(hoisting) {
  if (!hoisting) return null
  // 천장 Crane 은 그룹당 노드 3~4 개만 허용 (직선 2점 권상 불가).
  const minNodes = getHoistMinNodesPerGroup(hoisting.mode?.id)
  for (const group of hoisting.groups ?? []) {
    const count = group.nodeIds?.length ?? 0
    if (count > 0 && count < minNodes) {
      return minNodes === 3
        ? `권상 그룹 ${group.id}은 Node를 최소 3개 선택해야 합니다 (천장 Crane 은 직선 2점 권상 불가).`
        : `권상 그룹 ${group.id}은 Node를 최소 ${minNodes}개 선택해야 합니다.`
    }
    if (count > 4) return `권상 그룹 ${group.id}은 Node를 최대 4개까지만 선택할 수 있습니다.`
  }
  return null
}

function stateFromHoistImport(hoisting) {
  if (!hoisting) return {}
  const mode = VALID_HOIST_MODES.has(hoisting.mode?.id)
    ? hoisting.mode.id
    : null
  const max = getHoistMaxGroups(mode)
  const groups = { 1: [], 2: [], 3: [], 4: [] }
  let groupCount = 1
  for (const g of hoisting.groups ?? []) {
    if (!ALL_HOIST_GROUP_IDS.includes(g.id)) continue
    if (g.id > max) continue
    groups[g.id] = Array.isArray(g.nodeIds) ? g.nodeIds.slice(0, 4) : []
    groupCount = Math.max(groupCount, g.id)
  }
  if (Number.isInteger(hoisting.groupCount)) {
    groupCount = Math.min(max, Math.max(1, hoisting.groupCount))
  }
  // 임포트된 와이어 길이가 양수면 그대로, 아니면 모드 기본값으로 폴백.
  const importedWire = Number(hoisting.wireLengthM)
  const wireLengthM = Number.isFinite(importedWire) && importedWire > 0
    ? importedWire
    : getHoistDefaultWireLengthM(mode)
  return { hoistMode: mode, hoistGroupCount: groupCount, hoistGroups: groups, wireLengthM }
}

/**
 * 단일 JSON 산출물을 환경별 우선순위로 저장하는 공통 헬퍼.
 * 백엔드 업로드 (Workbench) → 로컬 폴더 → showSaveFilePicker → 다운로드.
 */
async function saveJsonArtifact(fileName, json) {
  const host = getHost()
  if (typeof host.uploadEvaluationArtifact === 'function') {
    const r = await host.uploadEvaluationArtifact(fileName, json)
    if (r.ok) return { ok: true, fileName, location: 'backend', remotePath: r.remotePath ?? null }
    console.warn(`[posture] backend upload failed for ${fileName}, falling back:`, r.error)
  }
  const folderRef = useStageStore.getState().sourceFolderRef
  if (folderRef != null) {
    const r = await host.writeFile(folderRef, fileName, json)
    if (r.ok) return { ok: true, fileName, location: 'folder' }
    console.warn(`[posture] host.writeFile failed for ${fileName}, falling back:`, r.error)
  }
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const fh = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Posture Stability JSON', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await fh.createWritable()
      await writable.write(json)
      await writable.close()
      return { ok: true, fileName: fh.name, location: 'picker' }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, error: '취소되었습니다' }
      console.warn(`[posture] showSaveFilePicker failed for ${fileName}, falling back:`, e)
    }
  }
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
}

function buildPosturePayloadFileName(stage) {
  const src = stage?.sourceFileName
  if (src) {
    const base = src.replace(/\.json$/i, '')
    return `${base}_posture.json`
  }
  const phase = stage?.meta?.phase ?? 'X'
  const ts = formatTimestamp(new Date())
  return `posture-stability_${phase}_${ts}.json`
}

/**
 * "자세안정성 평가" 입력 JSON 페이로드 빌드.
 * 권상 방식, 그룹별 노드 ID 와 좌표(mm), 각 그룹 기하중심, 모델 bbox/center 등
 * 후속 평가 알고리즘이 별도 stage 데이터 없이도 평가에 들어갈 수 있게 self-contained 하게 담는다.
 *
 * editedFileName 이 있으면 stageRef.editedFile 로 함께 내보내 평가기가 어떤 모델을
 * 기준으로 평가해야 하는지 명시한다 (편집 적용 후 모델).
 */
function buildPostureStabilityPayload(state, hoisting, stage, editedFileName) {
  const groups = (hoisting.groups ?? []).map(g => {
    const nodes = g.nodeIds
      .map(id => {
        const n = stage?.nodeMap?.get?.(id)
        return n ? { id, x: n.x, y: n.y, z: n.z } : { id, x: null, y: null, z: null }
      })
    const valid = nodes.filter(n => n.x != null)
    const centroid = valid.length > 0
      ? {
          x: valid.reduce((s, n) => s + n.x, 0) / valid.length,
          y: valid.reduce((s, n) => s + n.y, 0) / valid.length,
          z: valid.reduce((s, n) => s + n.z, 0) / valid.length,
        }
      : null
    return { id: g.id, nodeCount: nodes.length, nodes, centroidMm: centroid }
  })

  // 우선 stageSummary(00_StageSummary.json 또는 _COG.json) 가 있으면 그 값을 ground truth 로 사용.
  // 없으면 stage 의 PointMass + (가능하면) BEAM 단면×재질 밀도로 직접 계산해 폴백한다.
  const summary = useStageStore.getState().stageSummary
  const fromSummary = summary?.massProperties ?? null
  let totalMassTon = fromSummary?.totalMassTon ?? null
  let centerOfGravityMm = fromSummary?.centerOfGravityMm ?? null
  let massSource = (totalMassTon != null && centerOfGravityMm != null) ? 'stageSummary' : null

  if ((totalMassTon == null || centerOfGravityMm == null) && stage) {
    const fb = computeMassFallback(stage)
    if (fb.totalMassTon != null) {
      if (totalMassTon == null)       totalMassTon = fb.totalMassTon
      if (centerOfGravityMm == null)  centerOfGravityMm = fb.centerOfGravityMm
      massSource = fb.source
    } else if (massSource == null) {
      massSource = 'unavailable'
    }
  }

  return {
    schema: 'posture-stability/1.0',
    timestamp: formatTimestamp(new Date()),
    sourceFile: stage?.sourceFileName ?? null,
    stageRef: stage ? {
      phase: stage.meta?.phase,
      stageName: stage.meta?.stageName,
      // 편집이 적용된 경우 평가 대상이 되는 새 모델 파일명을 명시.
      // 평가기는 sourceFile 대신 editedFile 을 우선 로드해야 한다.
      editedFile: editedFileName ?? null,
    } : null,
    hoisting: {
      mode: hoisting.mode,
      groupCount: hoisting.groupCount,
      wireLengthM: hoisting.wireLengthM ?? null,
      groups,
    },
    model: {
      unit: 'mm',
      nodeCount: stage?.nodeMap?.size ?? null,
      bboxMm: stage?.bbox ?? null,
      centerMm: stage?.center ?? null,
      totalMassTon,
      centerOfGravityMm,
      // 'stageSummary' (00_StageSummary.json 또는 _COG.json) 또는
      // 'computed:beam+pointMass' / 'computed:pointMassOnly' / 'computed:beamOnly' / 'unavailable'
      massSource,
    },
  }
}

/**
 * stageSummary 가 없을 때 mass / COG 를 stage 자체 데이터로 계산하는 폴백.
 * NASTRAN consistent units 가정 (mm·N·s·t):
 *   - PointMass.mass : tons
 *   - material.rho   : t/mm³  (예: STEEL ≈ 7.85e-9)
 *   - cross-section area : mm²
 * 알 수 없는 단면(Bar/Rod/Tube 외) 은 BEAM 기여를 건너뛴다.
 *
 * 반환: { totalMassTon, centerOfGravityMm:{x,y,z}, source, beamMassTon, pointMassTon }
 *      ‖ totalMassTon: null, centerOfGravityMm: null, source: 'unavailable'
 *
 * 외부에서 (예: MassSummaryOverlay) 마지막 stage 만 가지고 mass 표시할 때 사용.
 */
export function computeMassFallback(stage) {
  if (!stage) return { totalMassTon: null, centerOfGravityMm: null, source: 'unavailable' }

  const contributions = []   // [{ mass, x, y, z }]
  let pointMassTon = 0
  let beamMassTon  = 0

  // PointMass — 명시적으로 t 단위로 들어와 있음
  for (const pm of stage.pointMasses ?? []) {
    if (pm.mass == null || pm.mass <= 0) continue
    const n = stage.nodeMap?.get?.(pm.nodeId)
    if (!n) continue
    pointMassTon += pm.mass
    contributions.push({ mass: pm.mass, x: n.x, y: n.y, z: n.z })
  }

  // BEAM 자중 — property 단면적 × 길이 × material 밀도
  for (const e of stage.elements ?? []) {
    if (e.type !== 'BEAM') continue
    const prop = stage.propertyMap?.get?.(e.propertyId)
    const mat  = prop ? stage.materialMap?.get?.(prop.materialId) : null
    if (!prop || !mat || !Number.isFinite(mat.rho)) continue
    const area = computeCrossSectionAreaMm2(prop)
    if (area == null || area <= 0) continue
    const a = stage.nodeMap?.get?.(e.startNode)
    const b = stage.nodeMap?.get?.(e.endNode)
    if (!a || !b) continue
    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)
    if (!(len > 0)) continue
    const massT = area * len * mat.rho   // mm² * mm * t/mm³ = t
    if (!(massT > 0)) continue
    beamMassTon += massT
    contributions.push({
      mass: massT,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
    })
  }

  if (contributions.length === 0) {
    return { totalMassTon: null, centerOfGravityMm: null, source: 'unavailable' }
  }

  let total = 0, cx = 0, cy = 0, cz = 0
  for (const c of contributions) {
    total += c.mass
    cx += c.mass * c.x
    cy += c.mass * c.y
    cz += c.mass * c.z
  }
  const cog = { x: cx / total, y: cy / total, z: cz / total }

  const source = (beamMassTon > 0 && pointMassTon > 0) ? 'computed:beam+pointMass'
               : (beamMassTon > 0)                     ? 'computed:beamOnly'
               :                                         'computed:pointMassOnly'
  return { totalMassTon: total, centerOfGravityMm: cog, source, beamMassTon, pointMassTon }
}

/**
 * NASTRAN PBEAML 표준 단면(TYPE) 별 단면적 계산 (mm²).
 *
 * 단위/관례 — nastran_bridge.parse_property 가 PBEAML.dims 를 NASTRAN 표준 그대로 보존.
 * 즉 ROD 의 DIM1 = R(반지름), TUBE 의 DIM1/DIM2 = R_outer/R_inner 등.
 *
 * 지원하는 TYPE — 사내 모델에 등장하는 8종 + 기본 알고리즘으로 추론 가능한 TYPE.
 *   Rod, Tube, Bar, Box, L, H, I, T, Chan(채널), Z
 * 그 외는 null 반환하여 BEAM 자중에서 빠진다 (사용자에게는 fallback 안내 표기로 알려짐).
 *
 * Hypermesh 비교 — 사내 Group Module Unit 모델(L/Tube 위주, 30.8 ton)에서
 * 본 함수 + 폴백 로직 합산이 99%+ 일치 (남은 ~1% 차이는 PBEAML NSM 미반영).
 */
export function computeCrossSectionAreaMm2(prop) {
  if (!prop) return null
  const d = prop.dims ?? []
  const f = (i) => (Number.isFinite(d[i]) ? d[i] : null)
  switch (prop.kind) {
    case 'Rod': {
      // DIM1 = R (반지름)
      const r = f(0)
      return r != null ? Math.PI * r * r : null
    }
    case 'Tube': {
      // DIM1=R_outer, DIM2=R_inner (반지름)
      const ro = f(0); const ri = f(1) ?? 0
      return ro != null ? Math.PI * (ro * ro - ri * ri) : null
    }
    case 'Bar': {
      // DIM1=W, DIM2=H
      const w = f(0); const h = f(1)
      return (w != null && h != null) ? w * h : null
    }
    case 'Box': {
      // DIM1=W, DIM2=H, DIM3=tw, DIM4=tf
      const W = f(0); const H = f(1); const tw = f(2); const tf = f(3)
      if (W == null || H == null || tw == null || tf == null) return null
      return W * H - (W - 2 * tw) * (H - 2 * tf)
    }
    case 'L': {
      // L: DIM1=W(수평 다리), DIM2=H(수직 다리), DIM3=tw, DIM4=tf
      const W = f(0); const H = f(1); const tw = f(2); const tf = f(3)
      if (W == null || H == null || tw == null || tf == null) return null
      return W * tf + (H - tf) * tw
    }
    case 'H': {
      // H: DIM1=W(플랜지 폭), DIM2=H(전체 높이), DIM3=tw, DIM4=tf — 동일 플랜지 2매
      const W = f(0); const H = f(1); const tw = f(2); const tf = f(3)
      if (W == null || H == null || tw == null || tf == null) return null
      return 2 * W * tf + (H - 2 * tf) * tw
    }
    case 'I': {
      // I: DIM1=H, DIM2=W1(상플랜지), DIM3=W2(하플랜지), DIM4=tw, DIM5=tf1, DIM6=tf2
      const H = f(0); const W1 = f(1); const W2 = f(2)
      const tw = f(3); const tf1 = f(4); const tf2 = f(5)
      if ([H, W1, W2, tw, tf1, tf2].some(v => v == null)) return null
      return W1 * tf1 + W2 * tf2 + (H - tf1 - tf2) * tw
    }
    case 'T': {
      // T: DIM1=W, DIM2=H, DIM3=tw, DIM4=tf
      const W = f(0); const H = f(1); const tw = f(2); const tf = f(3)
      if (W == null || H == null || tw == null || tf == null) return null
      return W * tf + (H - tf) * tw
    }
    case 'Chan':
    case 'CHAN':
    case 'Channel': {
      // CHAN: DIM1=W, DIM2=H, DIM3=tw, DIM4=tf — 두 개의 플랜지 + 한 개의 웹
      const W = f(0); const H = f(1); const tw = f(2); const tf = f(3)
      if (W == null || H == null || tw == null || tf == null) return null
      return 2 * W * tf + (H - 2 * tf) * tw
    }
    case 'Z': {
      // Z: DIM1=W, DIM2=H, DIM3=tw, DIM4=tf — Channel 과 동일한 면적 (플랜지 방향만 다름)
      const W = f(0); const H = f(1); const tw = f(2); const tf = f(3)
      if (W == null || H == null || tw == null || tf == null) return null
      return 2 * W * tf + (H - 2 * tf) * tw
    }
    default:
      return null
  }
}

/**
 * 폴더 경로 + 파일명을 연결한다. Windows/POSIX 양쪽 구분자 모두 안전하게 처리.
 *   joinPath('C:\\a\\b', 'x.json')   → 'C:\\a\\b\\x.json'
 *   joinPath('C:\\a\\b\\', 'x.json') → 'C:\\a\\b\\x.json'
 *   joinPath('/srv/data/',  'x.json') → '/srv/data/x.json'
 */
function joinPath(folder, name) {
  if (!folder) return name
  // 폴더에 \ 가 포함돼 있으면 Windows 경로로 보고 backslash 사용
  const sep = folder.includes('\\') ? '\\' : '/'
  const trimmed = folder.replace(/[\\/]+$/, '')
  return `${trimmed}${sep}${name}`
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
