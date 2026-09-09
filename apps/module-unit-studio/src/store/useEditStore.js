import { create } from 'zustand'
import {
  createIntent,
  validateIntent,
  serializeIntents,
  parseIntents,
} from '../data/EditIntent.js'
import { buildEditedStageJson, buildEditedStageFileName } from '../data/applyEditedModel.js'
import { rankHoistCandidates } from '../data/hoistCandidateRank.js'
import { pipeNodeIds, partitionZones, assignNodesToZones, zoneCountFor, zoneShapeFor, countActiveZones, SHAPE_QUAD } from '../data/hoistZonePartition.js'
import { useStageStore } from './useStageStore.js'
import { useStabilityStore } from './useStabilityStore.js'
import { getHost } from '../host/host.js'
import { useUnitStructuralStore } from './useUnitStructuralStore.js'

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

// ── Strict 평가 토글 ───────────────────────────────────────────────────────
// OFF(기본) 면 _posture.json 에 strictEvaluation:false 를 실어 보내고, 엔진이 형상 판정을 완화한다:
//   Stage 1(형상 분류)·Stage 2(Z단차·convex·평면도·Trolley 단변·삼각형 내각) FAIL → warn 강등
//   + 옵티마이저 후보 게이트(GroupShapeValidator.IsComboAcceptable)의 형상 검증 우회
// 완화되지 않는 것: Stage 3(wireLengthM≤0)·Stage 6(전도) — 항상 FAIL 로 다음 단계를 막는다.
// ⚠️ 기본 OFF 는 사용자 지시(2026-07-27). 안전 판정을 느슨하게 하는 쪽이 기본값이므로
//    HoistPositionPanel 이 상시 경고 배너를, Stage0 summary 가 strictEvaluation 플래그를 남긴다.
const STRICT_EVAL_STORAGE_KEY = 'mu.hoist.strictEvaluation.v1'

function loadStrictEvaluation() {
  try {
    const raw = localStorage.getItem(STRICT_EVAL_STORAGE_KEY)
    return raw === null ? false : raw === 'true'
  } catch {
    return false   // localStorage 접근 불가(사생활 모드 등) → 기본값
  }
}

function persistStrictEvaluation(value) {
  try { localStorage.setItem(STRICT_EVAL_STORAGE_KEY, String(!!value)) } catch { /* 저장 실패 무시 */ }
}

// ── 권상 리깅 검토 (Stage 7) ────────────────────────────────────────────────
// enabled 일 때만 _posture.json 에 liftAnalysis 로 실려 엔진의 Stage 7(슬링 장력·SWL·DAF)이
// 실행된다. 그전까지 Module Unit 은 이 값을 보내지 않아 Stage 7 이 항상 skip 됐고, 결과적으로
// 슬링·샤클·러그가 견디는지는 한 번도 검토되지 않았다(모듈 부재 응력은 Nastran 단위 구조해석이
// 잡지만 리깅 요소는 그 FE 모델에 없다).
//
// ⚠️ SWL 기본값을 두지 않는다 — 엔진도 임의 안전값을 가정하지 않는다. 비우면 그 검사만
// 생략되고 장력은 계속 산출된다. daf·무게여유만 제안 기본값을 준다.
export const DEFAULT_LIFT_ANALYSIS = {
  enabled: false,
  daf: 1.15,                 // 동하중계수 — 제안 기본값(Side Passage 와 동일)
  weightContingencyPct: 10,  // 무게 여유(%) — 제안 기본값
  wireSwlTon: null,          // 와이어로프 SWL (ton) — 사용자 입력
  shackleSwlTon: null,       // 샤클 SWL (ton)
  lugSwlTon: null,           // 러그 허용하중 (ton)
}

// ── 무게중심 포락선 (Stage 6) ───────────────────────────────────────────────
// enabled 일 때만 _posture.json 의 model.cogToleranceMm 로 실린다. 엔진은 XY 네 코너 중
// 최악을 채택하고 Z 는 여유가 줄어드는 방향으로 적용한다.
//
// 왜 필요한가: massSource 는 빔 단면×길이×밀도 + 모델링된 점질량이라, FE 모델에 없는
// 의장품(배관·케이블트레이·보온·그레이팅·도장·용접·볼트)이 통째로 빠진다. 결정론적 COG
// 한 점에서만 평가하면 "여유 20mm 로 PASS" 가 아무것도 보장하지 못한다.
//
// ⚠️ 기본 OFF — 켜면 기존에 PASS 였던 배치가 WARN/FAIL 로 내려갈 수 있다. 공차 크기는
// 사내 중량 관리 관행(계량 여부, 의장품 모델링 수준)에 달렸으므로 사용자가 정한다.
export const DEFAULT_COG_TOLERANCE = {
  enabled: false,
  x: null,
  y: null,
  z: null,
}

/** 모델 BBox 평면 치수의 비율로 COG 공차 제안값을 만든다 (기본 2%). Z 는 높이의 1%. */
export function suggestCogToleranceMm(bbox, ratio = 0.02) {
  if (!bbox) return null
  const dx = Math.abs((bbox.maxX ?? 0) - (bbox.minX ?? 0))
  const dy = Math.abs((bbox.maxY ?? 0) - (bbox.minY ?? 0))
  const dz = Math.abs((bbox.maxZ ?? 0) - (bbox.minZ ?? 0))
  if (!(dx > 0 || dy > 0)) return null
  return {
    x: Math.round(dx * ratio),
    y: Math.round(dy * ratio),
    z: Math.round(dz * ratio * 0.5),
  }
}

// 편집(intent) 적용 시 자세안정성(posture) 결과를 그대로 유지하는 kind.
// 가서포트(addSupportBeam)는 자세안정성 PASS 이후 Analysis 단계에서 추가하는 "구조 보강"이므로
// 구조해석 결과만 무효화하고 자세안정성은 유지한다(기존 설계 의도). 그 외 모델 형상·질량을 바꾸는
// 편집(addRigid/deleteElement/deleteGroup/deleteCategory/deleteOrphanNodes/emptyPipeFluid/rotateModel)은
// 자세안정성 결과까지 낡게 만들므로 함께 무효화한다.
const STABILITY_PRESERVING_KINDS = new Set(['addSupportBeam'])

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

  // 가서포트(보강) 픽 모드 — Analysis 탭 전용. Shift+Node 2개 선택 시 addSupportBeam intent 생성.
  supportPickActive: false,
  supportPickNodes: [],
  // 이번 세션에 편집 모델(_edited.json)을 백엔드에 업로드한 적이 있는지 — 재해석 동기화 게이트.
  editedModelUploaded: false,

  // 편집으로 직전 해석 결과(자세안정성/구조해석)가 무효화됐음을 알리는 플래그.
  // addIntent/removeIntent/clearIntents 가 실제로 기존 결과를 초기화했을 때 true 로 세팅되고,
  // 재평가(자세안정성 실행)·재해석(구조해석 실행) 시작 시 clearEditStaleNotice() 로 해제된다.
  // AnalyzePanel 이 이 값을 배너로 노출해 "결과가 왜 사라졌는지"를 사용자에게 알린다.
  editStaleNotice: false,

  // 편집 모드에서 Ctrl+Click 으로 누적된 다중 선택 element 목록 (일괄 삭제용)
  multiSelElements: [],

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

  // 권상 후보 강조 Tolerance(mm). null 이면 모델 높이 기반 자동값(autoHoistToleranceMm)을 쓴다.
  // 자동 최적화 엔진의 Z-밴드 tol 로도 쓰인다(buildHoistPartitionInput). null=auto(가장 넓은 PASS Z-밴드 스윕).
  // (UI 입력은 제거됨 — 이제 항상 null=auto. 값 override 가 필요하면 setHoistTolerance 로만 설정.)
  hoistToleranceMm: null,

  // Circle Guide — 켜면 활성 그룹 첫 노드로 "무게중심 중심 + COG→첫노드 수평거리 반지름" 가상 원(수평 링)을
  // 만들고, 그 원 근처(±hoistCircleTolMm) 노드를 후보로 강조한다(기존 같은-높이 강조는 켜진 동안 OFF).
  circleGuideEnabled: false,
  // Circle Guide 후보 판정 Tolerance(mm) — |수평거리(node,COG) − 반지름| ≤ 이 값. null 이면 모델 크기 기반 자동값.
  hoistCircleTolMm: null,

  // Strict 평가 — 자세안정성 형상 판정의 엄격도. 기본 OFF(=완화). 세션 간 유지(localStorage).
  // 모델 로드/reset 으로 초기화되지 않는다(사용자 환경설정 성격, pipeDiameterThreshold 와 동일).
  strictEvaluation: loadStrictEvaluation(),

  // 권상 리깅 검토 입력(Stage 7). enabled 일 때만 _posture.json 에 liftAnalysis 로 실린다.
  liftAnalysis: { ...DEFAULT_LIFT_ANALYSIS },

  // 무게중심 포락선(Stage 6). enabled 일 때만 model.cogToleranceMm 로 실린다.
  cogTolerance: { ...DEFAULT_COG_TOLERANCE },

  // 활성 권상 그룹의 Z-레벨 가이드 평판(가상판) 3D 표시 여부. 사용자가 뷰가 가려질 때 끌 수 있다(기본 표시).
  showHoistPlate: true,

  // 권상 UX 가이드 토스트 (예: "권상 방식을 먼저 선택해 주세요"). { id, message, kind } | null
  // id 는 새 토스트마다 증가해 같은 메시지여도 자동 dismiss 타이머가 리셋되도록 한다.
  hoistGuide: null,

  setEnabled: (enabled) => set(s => ({
    enabled,
    // 편집 모드 끌 때 다중 선택은 자동 비움 (의도하지 않은 잔재 방지)
    pendingNodeSelection: enabled ? s.pendingNodeSelection : [],
    multiSelElements: enabled ? s.multiSelElements : [],
  })),
  toggleEnabled: () => set(s => ({
    enabled: !s.enabled,
    pendingNodeSelection: s.enabled ? [] : s.pendingNodeSelection,
    multiSelElements: s.enabled ? [] : s.multiSelElements,
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
   * element entity 를 다중 선택 목록에서 토글한다 (이미 있으면 제거, 없으면 추가).
   * Ctrl+Click 흐름에서 호출.
   */
  toggleMultiSelElement: (entity) => {
    if (entity?.id == null) return
    set(s => {
      const has = s.multiSelElements.some(e => e.id === entity.id)
      return {
        multiSelElements: has
          ? s.multiSelElements.filter(e => e.id !== entity.id)
          : [...s.multiSelElements, entity],
      }
    })
  },

  clearMultiSelElements: () => set({ multiSelElements: [] }),

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
   * 권상점 전체 초기화 — 모든 그룹의 노드를 비우고 그룹 수/활성 그룹을 1 로 되돌린다.
   * 권상 방식(mode)·Wire 길이·옵션(tolerance/외경)은 유지한다.
   * 생성된 wire 시각화 제거는 useStabilityStore.reset() 로 별도 처리(스토어 분리 유지).
   */
  resetHoistPoints: () => {
    // 권상점을 초기화하면 직전 구조해석 결과는 무효 → 재해석 잠금(isFinished)을 함께 푼다.
    invalidateStructuralResult()
    set({
      hoistGroups: { 1: [], 2: [], 3: [], 4: [] },
      hoistGroupCount: 1,
      activeHoistGroupId: 1,
    })
  },

  /**
   * 권상 위치 자동 선정 모달의 제안 결과를 실제 Hoist 그룹 상태로 적용한다.
   * - 현재 권상 방식의 최대 그룹 수(Hydro 4/Goliat 3/Ceiling 1)를 넘는 제안은 버린다.
   * - 그룹당 노드는 최대 4개, 노드는 전체 그룹 중 한 곳에만 남긴다.
   * - 모드별 최소 노드 수를 만족하지 못하는 그룹은 평가 불가하므로 적용하지 않는다.
   *
   * @param {Array<Array<number>>} nodeGroups
   * @returns {{ok:boolean, appliedGroupCount?:number, appliedNodeCount?:number, skippedGroupCount?:number, truncatedGroupCount?:number, error?:string}}
   */
  applyAutoHoistGroups: (nodeGroups) => {
    const s = get()
    if (!s.hoistMode) return { ok: false, error: '권상 방식을 먼저 선택해 주세요.' }
    if (!Array.isArray(nodeGroups) || nodeGroups.length === 0) {
      return { ok: false, error: '적용할 자동 선정 결과가 없습니다.' }
    }

    const stage = currentStage()
    const maxGroups = getHoistMaxGroups(s.hoistMode)
    const minNodes = getHoistMinNodesPerGroup(s.hoistMode)
    const nextGroups = { 1: [], 2: [], 3: [], 4: [] }
    const used = new Set()
    let targetGroupId = 1
    let skippedGroupCount = 0
    let truncatedGroupCount = 0

    for (const rawGroup of nodeGroups) {
      if (targetGroupId > maxGroups) {
        skippedGroupCount += 1
        continue
      }
      const rawIds = Array.isArray(rawGroup) ? rawGroup : []
      const ids = []
      for (const nodeId of rawIds) {
        if (nodeId == null || used.has(nodeId)) continue
        if (stage?.nodeMap && !stage.nodeMap.has(nodeId)) continue
        ids.push(nodeId)
        used.add(nodeId)
        if (ids.length === 4) break
      }
      if (rawIds.length > ids.length && ids.length === 4) truncatedGroupCount += 1
      if (ids.length < minNodes) {
        skippedGroupCount += 1
        for (const nodeId of ids) used.delete(nodeId)
        continue
      }
      nextGroups[targetGroupId] = ids
      targetGroupId += 1
    }

    const appliedGroupCount = targetGroupId - 1
    if (appliedGroupCount === 0) {
      return { ok: false, error: `현재 권상 방식은 그룹당 최소 ${minNodes}개 노드가 필요합니다.` }
    }

    const appliedNodeCount = Object.values(nextGroups).reduce((n, ids) => n + ids.length, 0)
    set({
      hoistGroupCount: appliedGroupCount,
      activeHoistGroupId: 1,
      hoistGroups: nextGroups,
    })
    return { ok: true, appliedGroupCount, appliedNodeCount, skippedGroupCount, truncatedGroupCount }
  },

  /**
   * 권상 그룹을 통째로 삭제한다 (단순 비우기가 아니라 카운트도 감소). 삭제된 그룹보다
   * 큰 ID 의 그룹은 한 칸씩 당겨와 ID 가 재정렬된다 (예: 2 삭제 → 기존 3 이 2 가 됨).
   * 최소 1 그룹은 유지하므로 hoistGroupCount === 1 이면 no-op.
   */
  removeHoistGroup: (groupId) => {
    if (!ALL_HOIST_GROUP_IDS.includes(groupId)) return
    let removed = false
    set(s => {
      if (s.hoistGroupCount <= 1) return s
      if (groupId > s.hoistGroupCount) return s
      removed = true
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
    // 그룹 삭제가 실제로 적용됐으면 stability wire 시각화도 동일한 ID 재정렬 규칙으로 맞춘다 —
    // cross-store 불변식을 컴포넌트 관례가 아니라 스토어에서 보장(호출자는 removeHoistGroup 만 호출).
    if (removed) useStabilityStore.getState().dropGroupWires(groupId)
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

  // 권상 후보 강조 Tolerance(mm). 빈 값/0이하/NaN 은 null(자동값)로 처리.
  setHoistTolerance: (val) => {
    const num = (val == null || val === '') ? null : Number(val)
    set({ hoistToleranceMm: Number.isFinite(num) && num > 0 ? num : null })
  },

  // Circle Guide 토글. 켜면 원 기반 후보 강조로 전환된다.
  toggleCircleGuide: () => set(s => ({ circleGuideEnabled: !s.circleGuideEnabled })),
  setCircleGuide: (v) => set({ circleGuideEnabled: !!v }),
  // Circle Guide 후보 Tolerance(mm). 빈 값/0이하/NaN 은 null(자동값)로 처리.
  setHoistCircleTol: (val) => {
    const num = (val == null || val === '') ? null : Number(val)
    set({ hoistCircleTolMm: Number.isFinite(num) && num > 0 ? num : null })
  },

  // 가상판(Z-레벨 가이드 평판) 표시 토글.
  setShowHoistPlate: (v) => set({ showHoistPlate: !!v }),
  toggleHoistPlate: () => set(s => ({ showHoistPlate: !s.showHoistPlate })),

  /**
   * Strict 평가 토글. ON = 형상 위반 시 FAIL(기존 동작), OFF = warn 강등 + 옵티마이저 게이트 완화.
   * 값은 localStorage 에 즉시 영속화된다(세션 간 유지 — 사용자 지시 2026-07-27).
   * 이미 저장된 자세안정성 결과는 이전 엄격도로 평가된 것이므로, 토글을 바꾸면 결과를 무효화해
   * 사용자가 STEP 4 를 다시 실행하도록 유도한다(엄격도와 표시 결과의 불일치 방지).
   */
  setStrictEvaluation: (v) => {
    const next = !!v
    if (get().strictEvaluation === next) return
    persistStrictEvaluation(next)
    set({ strictEvaluation: next })
    // 저장된 리포트는 바뀐 기준과 맞지 않으므로 내린다(wire 오버레이 포함).
    const ss = useStabilityStore.getState()
    if (ss.report || ss.overallStatus) ss.reset()
  },

  /**
   * 권상 리깅 검토 입력(Stage 7) 부분 갱신. enabled 를 켜야 _posture.json 에 실린다.
   * 판정 기준이 달라지므로 strictEvaluation 과 같이 저장된 리포트를 무효화한다.
   */
  setLiftAnalysis: (patch) => {
    set(s => ({ liftAnalysis: { ...s.liftAnalysis, ...patch } }))
    const ss = useStabilityStore.getState()
    if (ss.report || ss.overallStatus) ss.reset()
  },

  /**
   * 무게중심 포락선(Stage 6) 부분 갱신. 공차를 켜거나 바꾸면 전도 판정이 달라지므로
   * 저장된 리포트를 무효화한다.
   */
  setCogTolerance: (patch) => {
    set(s => ({ cogTolerance: { ...s.cogTolerance, ...patch } }))
    const ss = useStabilityStore.getState()
    if (ss.report || ss.overallStatus) ss.reset()
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

  toggleSupportPick: () => set(s => ({
    supportPickActive: !s.supportPickActive,
    supportPickNodes: [],
  })),

  pickSupportNode: (nodeId) => {
    if (nodeId == null) return
    const stage = currentStage()
    if (stage?.nodeMap && !stage.nodeMap.has(nodeId)) return
    const cur = get().supportPickNodes
    if (cur.includes(nodeId)) {
      set({ supportPickNodes: cur.filter(n => n !== nodeId) })
      return
    }
    const next = [...cur, nodeId]
    if (next.length < 2) { set({ supportPickNodes: next }); return }
    const [a, b] = next
    const res = get().addIntent({
      kind: 'addSupportBeam',
      params: { startNode: a, endNode: b, sectionKind: 'L', dims: [100, 100, 10, 10] },
    })
    set({ supportPickNodes: [] })
    if (res.ok) {
      // 구조해석 결과 무효화는 addIntent 가 담당(가서포트는 구조해석만 초기화, 자세안정성 유지).
      get().flashHoistGuide(`가서포트 설치됨 (N${a}↔N${b})`, 'success')
    } else {
      get().flashHoistGuide(res.validation?.errors?.[0] ?? '가서포트 추가 실패', 'error')
    }
  },

  // 프로그램적 추가(테스트/대체 진입점) — 구조 결과 무효화는 addIntent 가 담당.
  addSupportBeam: (a, b) => {
    return get().addIntent({
      kind: 'addSupportBeam',
      params: { startNode: a, endNode: b, sectionKind: 'L', dims: [100, 100, 10, 10] },
    })
  },

  // 구조 결과 무효화는 removeIntent 가 담당(가서포트 제거이므로 자세안정성은 유지).
  removeSupportBeam: (intentId) => {
    get().removeIntent(intentId)
  },

  markEditedModelUploaded: () => set({ editedModelUploaded: true }),

  /**
   * 새 intent 를 추가한다.
   *
   *   addIntent({ kind: 'addRigid', params: { ... } })
   *
   * - validation 결과를 자동으로 채워서 저장한다.
   * - status='error' 면 거절(반환값 false), 그 외에는 저장(true).
   *
   * @param {{ kind: string, params: object }} draft
   * @param {{ batchId?: string|null }} [opts]  한 사용자 액션으로 여러 intent 를 추가할 때 공통 batchId
   *   를 부여하면 Ctrl+Z(undoLastIntent) 가 그 batch 전체를 한 번에 되돌린다.
   * @returns {{ ok: boolean, intent: object|null, validation: object }}
   */
  addIntent: (draft, opts = {}) => {
    const stage = currentStage()
    const intent = createIntent(draft.kind, draft.params, { batchId: opts.batchId })
    const validation = validateIntent(intent, stage, get().intents)
    intent.validation = validation

    if (validation.status === 'error') {
      return { ok: false, intent: null, validation }
    }
    set(s => ({ intents: [...s.intents, intent] }))
    // 편집이 적용되면 직전 해석 결과는 이 모델에 대한 것이 아니게 된다 → 무효화하고 재실행 잠금을 푼다.
    if (invalidateForEdit(draft.kind)) set({ editStaleNotice: true })
    return { ok: true, intent, validation }
  },

  removeIntent: (id) => {
    const removed = get().intents.find(i => i.id === id)
    set(s => ({
      intents: s.intents.filter(i => i.id !== id),
      selectedIntentId: s.selectedIntentId === id ? null : s.selectedIntentId,
    }))
    // 편집을 되돌리는 것도 모델을 바꾸므로 동일하게 무효화한다.
    if (invalidateForEdit(removed?.kind)) set({ editStaleNotice: true })
  },

  clearIntents: () => {
    // rotateModel 은 provenance 전용 intent 로, 실제 회전 상태(useStageStore.modelRotated +
    // rotationStack)와 짝을 이룬다. 여기서 지우면 좌표는 회전된 채 표시만 어긋나므로(3D 착시)
    // rotateModel 은 남기고, 되돌리기는 Sidebar '회전 초기화'(resetRotation)로만 수행한다.
    set(s => ({ intents: s.intents.filter(i => i.kind === 'rotateModel'), selectedIntentId: null }))
    // 편집 제거 = (회전 외) 원본 모델로 복귀 → 자세안정성/구조해석 결과 모두 무효화.
    const invStruct = invalidateStructuralResult()
    const invStab = invalidateStabilityResult()
    if (invStruct || invStab) set({ editStaleNotice: true })
  },

  /**
   * rotateModel provenance intent 를 모두 제거한다. Sidebar '회전 초기화' 가
   * useStageStore.resetRotation()(실제 역회전)과 함께 호출해 표시/실제 상태를 일치시킨다.
   * 결과 무효화는 resetRotation 이 담당하므로 여기서는 intent 만 정리한다.
   */
  clearRotateModelIntents: () => {
    set(s => {
      if (!s.intents.some(i => i.kind === 'rotateModel')) return s
      const selRemoved = s.intents.some(i => i.id === s.selectedIntentId && i.kind === 'rotateModel')
      return {
        intents: s.intents.filter(i => i.kind !== 'rotateModel'),
        selectedIntentId: selRemoved ? null : s.selectedIntentId,
      }
    })
  },

  /**
   * 한 사용자 액션(batch) 단위로 마지막 편집을 되돌린다 (Ctrl+Z).
   * - rotateModel(provenance)은 대상에서 제외 — '회전 초기화'로만 해제한다.
   * - 마지막 되돌릴 intent 가 batchId 를 가지면 같은 batch 전체(일괄 삭제 N건)를 한 번에 제거.
   * - batchId 가 없으면 그 1건만 제거.
   * @returns {{ removed:number }}
   */
  undoLastIntent: () => {
    const intents = get().intents
    const undoable = intents.filter(i => i.kind !== 'rotateModel')
    if (undoable.length === 0) return { removed: 0 }
    const last = undoable[undoable.length - 1]
    const batchId = last.batchId ?? null
    const toRemove = batchId != null
      ? new Set(intents.filter(i => i.batchId === batchId && i.kind !== 'rotateModel').map(i => i.id))
      : new Set([last.id])
    const removedKinds = intents.filter(i => toRemove.has(i.id)).map(i => i.kind)
    set(s => ({
      intents: s.intents.filter(i => !toRemove.has(i.id)),
      selectedIntentId: toRemove.has(s.selectedIntentId) ? null : s.selectedIntentId,
    }))
    // 되돌린 각 편집 kind 에 맞춰 해석 결과 무효화 (removeIntent 와 동일 정책).
    let stale = false
    for (const kind of removedKinds) { if (invalidateForEdit(kind)) stale = true }
    if (stale) set({ editStaleNotice: true })
    return { removed: toRemove.size }
  },

  // 재평가/재해석을 시작하거나 사용자가 확인하면 stale 배너를 내린다.
  clearEditStaleNotice: () => set({ editStaleNotice: false }),

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
    multiSelElements: [],
    hoistMode: 'hydro',
    hoistGroupCount: 1,
    activeHoistGroupId: 1,
    hoistGroups: { 1: [], 2: [], 3: [], 4: [] },
    wireLengthM: HOIST_DEFAULT_WIRE_M.hydro,
    pipeDiameterThreshold: null,
    hoistToleranceMm: null,
    circleGuideEnabled: false,
    hoistCircleTolMm: null,
    showHoistPlate: true,
    hoistGuide: null,
    supportPickActive: false,
    supportPickNodes: [],
    editedModelUploaded: false,
    editStaleNotice: false,
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
    // 이중 실행 가드 — 자세안정성 해석이 이미 running 이면 즉시 거절한다.
    // (구조해석 러너 useUnitStructuralRunner 의 running 가드와 동일 정책. 저장→자동해석 중
    //  버튼 연타로 두 번째 실행이 첫 실행의 결과/파일을 덮어쓰는 레이스를 막는다.)
    if (useStabilityStore.getState().running) {
      return { ok: false, error: '이미 실행 중입니다' }
    }
    const state = get()
    const hoisting = getHoistExport(state)
    const hoistError = validateHoistExport(hoisting)
    if (!hoisting || hoistError) {
      return { ok: false, error: hoistError ?? '권상 설정이 없습니다.' }
    }
    const stage = currentStage()
    const intents = state.intents ?? []
    const results = []

    // 새 자세안정성 평가를 시작하므로 직전 구조해석(허용응력) 결과는 이 권상 구성에 대한 것이
    // 아니게 된다 → 무효화해 구조 Run 버튼 잠금(isFinished='Success')을 푼다. 권상점을 다시 잡고
    // 재평가·재해석하는 반복 워크플로에서 Run 이 '해석 완료'로 잠겨 재실행 불가하던 문제 수정(F1, 2026-07-07).
    invalidateStructuralResult()
    // 재평가를 시작했으므로 편집으로 인한 stale 배너는 내린다.
    set({ editStaleNotice: false })

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
    const cliAvailable = typeof host.runStabilityAnalysis === 'function'
    if (cliAvailable && posturePath) {
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
    } else if (cliAvailable && !posturePath) {
      // CLI 는 있으나 저장 위치의 절대경로를 확인할 수 없어 자동 해석을 못 돌렸다(파일 저장만 완료).
      // 호출 측이 '저장 완료'로 오인하지 않도록 notRun 신호를 명시한다.
      stability = {
        ok: false,
        notRun: true,
        error: '저장 위치 경로를 확인할 수 없어 자세안정성 해석을 자동 실행하지 못했습니다. 저장된 _posture.json 으로 STEP 4에서 다시 실행하세요.',
      }
    }

    return { ok: true, results, stability }
  },

  /**
   * 권상 위치 자동 선정 (Approach B). 방식별 그룹수를 스윕하며 ModuleAnalysis.Cli --optimize 를
   * 자세안정성 평가 절차로 호출하고, 모든 결과를 병합·랭킹해 돌려준다. 검증된 후보만 반환하며
   * 적용(커밋)은 호출 측이 applyAutoHoistGroups(toNodeGroups(후보)) 로 수행한다.
   *
   * @param {{ onProgress?: (p:{done:number,total:number,groupCount:number})=>void }} [opts]
   * @returns {Promise<{ok:boolean, candidates?:Array, hasPass?:boolean, error?:string}>}
   */
  autoSelectHoistPositions: async (opts = {}) => {
    const state = get()
    const mode = state.hoistMode
    if (!mode) return { ok: false, error: '권상 방식(STEP 1)을 먼저 선택해 주세요.' }

    const host = getHost()
    if (typeof host.optimizeHoistPositions !== 'function') {
      return { ok: false, error: 'WorkBench 앱이 권상 위치 최적화 채널을 지원하지 않습니다. WorkBench를 최신 버전으로 실행해 주세요.' }
    }

    const stage = currentStage()
    if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) {
      return { ok: false, error: '모델이 로드되지 않았습니다.' }
    }

    // Stage0 파싱 보장용 시드 hoisting (특히 Crane=그룹1 고정). 옵티마이저는 시드를 무시하고 자체 후보 생성.
    const base = getHoistExport(state)
    if (!base) return { ok: false, error: '권상 방식을 먼저 선택해 주세요.' }
    const seedGroups = base.groups.length > 0
      ? base.groups
      : [{ id: 1, nodeIds: pickSeedNodeIds(stage, 3) }]
    if (!seedGroups[0] || seedGroups[0].nodeIds.length === 0) {
      return { ok: false, error: '권상 시드로 쓸 유효한 노드를 찾지 못했습니다.' }
    }
    const hoisting = { ...base, groupCount: seedGroups.length, groups: seedGroups }

    // 편집 intents 가 있으면 편집 모델 _edited.json 저장(평가 경로와 동일). 없으면 폴백(소스 JSON) 사용.
    const intents = state.intents ?? []
    let editedFileName = null
    if (intents.length > 0) {
      const editedJson = buildEditedStageJson(stage, intents)
      editedFileName = buildEditedStageFileName(stage, formatTimestamp)
      const er = await saveJsonArtifact(editedFileName, JSON.stringify(editedJson, null, 2))
      if (!er.ok) return { ok: false, error: `편집 모델 저장 실패: ${er.error ?? '알 수 없는 오류'}` }
    }

    const allowedNodeIds = [...stage.nodeMap.keys()]
    const pointsPerGroup = mode === 'goliat' ? 4 : mode === 'ceiling' ? 3 : 4
    const groupCounts = hoistSweepGroupCounts(mode)
    const postureFileName = buildPosturePayloadFileName(stage)  // <base>_posture.json 고정(폴백 모델 해석)

    const reports = []
    let lastError = null
    let done = 0
    for (const k of groupCounts) {
      opts.onProgress?.({ done, total: groupCounts.length, groupCount: k })
      const payload = buildPostureStabilityPayload(
        { ...state, hoistOptimization: { desiredGroupCount: k, pointsPerGroup, allowedNodeIds, shapePreference: opts.shapePreference ?? 'auto' } },
        hoisting, stage, editedFileName,
      )
      const sr = await saveJsonArtifact(postureFileName, JSON.stringify(payload, null, 2))
      if (!sr.ok) { lastError = sr.error ?? '입력 저장 실패'; done += 1; continue }

      let posturePath = null
      if (sr.location === 'backend' && sr.remotePath) posturePath = sr.remotePath
      else if (sr.location === 'folder') {
        const folderRef = useStageStore.getState().sourceFolderRef
        if (typeof folderRef === 'string' && folderRef.length > 0) posturePath = joinPath(folderRef, postureFileName)
      }
      if (!posturePath) { lastError = '_posture.json 절대경로를 확인할 수 없습니다.'; done += 1; continue }

      const r = await host.optimizeHoistPositions(posturePath)
      if (r.ok && r.report) reports.push(r.report)
      else lastError = r.error ?? '권상 위치 최적화 실패'
      done += 1
      opts.onProgress?.({ done, total: groupCounts.length, groupCount: k })
    }

    const candidates = rankHoistCandidates(reports)
    if (candidates.length === 0) {
      return { ok: false, error: lastError ?? '평가 가능한 권상 후보를 찾지 못했습니다.' }
    }
    return { ok: true, candidates, hasPass: candidates.some(c => c.overallStatus === 'pass') }
  },

  /**
   * 구역 미니맵용 입력(bbox/nodeEntries/pipeNodes/tolMm)을 반환. 모델 없으면 null.
   * @returns {{bbox, nodeEntries:Array, pipeNodes:Set<number>, tolMm:number}|null}
   */
  getZonePartitionInput: () => {
    const stage = currentStage()
    if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) return null
    return buildHoistPartitionInput(stage, get().hoistToleranceMm, resolveModelCog(stage))
  },

  /**
   * 구역 기반 권상 위치 선정. 사용자가 정의한 각 구역(밴드축·밴드별 하위구역)을 옵티마이저
   * "region"(그 구역 노드 + 구역별 요청 포인트수)으로 만들어 host.optimizeHoistPositions 로 1회
   * 호출한다. 손휴리스틱(최대 spread/최다 Z) 대신 검증된 C# 옵티마이저가 각 구역 안에서 통과 점을
   * 직접 고른다. 검증된 후보를 반환(적용은 호출 측).
   *
   * @param {{bandAxis:'x'|'y', bands:number[], pointsPerZone:number[][], includePipe:boolean}} config
   * @param {{ onProgress?: (p:{done:number,total:number})=>void }} [opts]
   * @returns {Promise<{ok:boolean, candidates?:Array, hasPass?:boolean, error?:string}>}
   */
  zoneSelectHoistPositions: async (config, opts = {}) => {
    const state = get()
    const mode = state.hoistMode
    if (!mode) return { ok: false, error: '권상 방식(STEP 1)을 먼저 선택해 주세요.' }

    const host = getHost()
    if (typeof host.optimizeHoistPositions !== 'function') {
      return { ok: false, error: 'WorkBench 앱이 권상 위치 최적화 채널을 지원하지 않습니다. WorkBench를 최신 버전으로 실행해 주세요.' }
    }

    const stage = currentStage()
    if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) {
      return { ok: false, error: '모델이 로드되지 않았습니다.' }
    }

    const bands = Array.isArray(config?.bands) && config.bands.length > 0 ? config.bands : [1]
    // 실제 권상 그룹 수 = 0점(제외) 아닌 셀 수. 9구역(3×3) 중 일부만 활성화하는 흐름 지원.
    const groupCount = countActiveZones(bands, config?.pointsPerZone)
    const maxGroups = getHoistMaxGroups(mode)
    if (groupCount === 0) {
      return { ok: false, error: '활성 구역이 없습니다 — 최소 한 구역의 포인트 수를 1 이상(0=제외)으로 설정하세요.' }
    }
    if (groupCount > maxGroups) {
      return { ok: false, error: `현재 권상 방식의 최대 그룹 수(${maxGroups})를 초과합니다 — 활성 구역 ${groupCount}개.` }
    }

    const intents = state.intents ?? []
    let editedFileName = null
    if (intents.length > 0) {
      const editedJson = buildEditedStageJson(stage, intents)
      editedFileName = buildEditedStageFileName(stage, formatTimestamp)
      const er = await saveJsonArtifact(editedFileName, JSON.stringify(editedJson, null, 2))
      if (!er.ok) return { ok: false, error: `편집 모델 저장 실패: ${er.error ?? '알 수 없는 오류'}` }
    }

    const base = getHoistExport(state)
    if (!base) return { ok: false, error: '권상 방식을 먼저 선택해 주세요.' }

    // 구역 분할 → 각 구역을 옵티마이저 region 으로. region.nodeIds = 그 구역에 속한 노드(배관 제외 옵션 반영),
    // requestedPointCount = 구역별 포인트 수. 옵티마이저가 region 안에서 통과 점을 직접 고른다.
    const input = buildHoistPartitionInput(stage, state.hoistToleranceMm, resolveModelCog(stage))
    // 무게중심(COG) 기준 분할 — config.cogAnchor !== false(기본 on) 이고 COG 가 있으면 앵커 적용.
    // 앵커가 있으면 2×2 는 분할선 교점이 COG, 그 이상 분할도 격자 중심이 COG 가 된다.
    const anchor = (config?.cogAnchor !== false && input.cog) ? { x: input.cog.x, y: input.cog.y } : undefined
    const zones = partitionZones(input.bbox, { ...config, bands, anchor })
    const byZone = assignNodesToZones(zones, input.nodeEntries)
    const includePipe = !!config?.includePipe
    // 0점(제외) 구역은 region 을 만들지 않고 건너뛴다. groupId 는 활성 구역만 1..N 연속 부여.
    const regions = []
    let gid = 0
    for (const z of zones) {
      const requestedPointCount = zoneCountFor(config, z.bandIndex, z.subIndex, 2)
      if (requestedPointCount === 0) continue   // 제외 구역 (-1 = 자동: 엔진이 2~4점 스윕)
      let nodeIds = (byZone.get(z.id) ?? []).map(nd => nd.id)
      if (!includePipe && input.pipeNodes && input.pipeNodes.size > 0) {
        nodeIds = nodeIds.filter(id => !input.pipeNodes.has(id))
      }
      if (nodeIds.length >= 2) {
        gid += 1
        // 구역별 4점 형상(사용자 규칙 2026-07-03) — 명시 4점 구역만 사각형/일직선을 지정하고,
        // 자동(-1)·2·3점 구역은 'auto'(엔진이 4점 변형에서 사각형·일직선 모두 시도)로 보낸다.
        // 천장 Crane 은 구역별 형상 UI 가 없으므로 항상 'auto'(기존 동작 보존).
        const shape = (mode !== 'ceiling' && requestedPointCount === 4)
          ? zoneShapeFor(config, z.bandIndex, z.subIndex, SHAPE_QUAD) : 'auto'
        regions.push({ id: `zone-${z.bandIndex}-${z.subIndex}`, groupId: gid, requestedPointCount, shape, nodeIds })
      }
    }
    if (regions.length === 0) {
      return { ok: false, error: '활성 구역에서 권상 후보로 쓸 노드를 충분히 찾지 못했습니다. 분할을 줄이거나 배관 포함을 켜 보세요.' }
    }

    // Stage0 파싱 보장용 시드(옵티마이저는 시드를 무시하고 region 안에서 자체 선택).
    const seedGroups = base.groups.length > 0 ? base.groups : [{ id: 1, nodeIds: pickSeedNodeIds(stage, 3) }]
    if (!seedGroups[0] || seedGroups[0].nodeIds.length === 0) {
      return { ok: false, error: '권상 시드로 쓸 유효한 노드를 찾지 못했습니다.' }
    }
    const hoisting = { ...base, groupCount: seedGroups.length, groups: seedGroups }

    opts.onProgress?.({ done: 0, total: 1 })

    // 수동 후보 표시 Tolerance와 자동 추천 Z 탐색폭은 목적이 다르므로 완전히 분리한다.
    // null을 보내면 엔진이 좁은 밴드부터 MaxZDiffMm까지 단계적으로 탐색한다. 사용자가 화면의
    // 후보 표시를 좁혀도 자동 추천의 유효 조합이 함께 사라지지 않는다.
    const optimizeTolMm = null
    const payload = buildPostureStabilityPayload(
      // shapePreference(전역)는 region.shape 폴백용 기본값 'auto'(구역별 shape 로 대체됨, 사용자 규칙 2026-07-03).
      { ...state, hoistOptimization: { regions, tolMm: optimizeTolMm, shapePreference: 'auto' } },
      hoisting, stage, editedFileName,
    )
    const postureFileName = buildPosturePayloadFileName(stage)
    const sr = await saveJsonArtifact(postureFileName, JSON.stringify(payload, null, 2))
    if (!sr.ok) { opts.onProgress?.({ done: 1, total: 1 }); return { ok: false, error: sr.error ?? '입력 저장 실패' } }

    let posturePath = null
    if (sr.location === 'backend' && sr.remotePath) posturePath = sr.remotePath
    else if (sr.location === 'folder') {
      const folderRef = useStageStore.getState().sourceFolderRef
      if (typeof folderRef === 'string' && folderRef.length > 0) posturePath = joinPath(folderRef, postureFileName)
    }
    if (!posturePath) { opts.onProgress?.({ done: 1, total: 1 }); return { ok: false, error: '_posture.json 절대경로를 확인할 수 없습니다.' } }

    const rr = await host.optimizeHoistPositions(posturePath)
    opts.onProgress?.({ done: 1, total: 1 })
    if (!rr.ok || !rr.report) {
      return { ok: false, error: rr.error ?? '권상 위치 최적화 실패' }
    }

    const candidates = rankHoistCandidates([rr.report])
    if (candidates.length === 0) {
      return { ok: false, error: '평가 가능한 권상 후보를 찾지 못했습니다.' }
    }
    // C# 옵티마이저 리포트는 PascalCase(Diagnosis)로 직렬화되므로 camelCase 도 방어적으로 함께 확인한다.
    // PASS 후보를 찾았으면 엔진이 Diagnosis 를 채우지 않으므로(absent/null) 보통 null 이다.
    const diagnosis = rr.report?.diagnosis ?? rr.report?.Diagnosis ?? null
    // searchTrace — 엔진이 조합 탐색 과정(스캔 수·구역별 통계·단계별 FAIL 등)을 담는다.
    // Diagnosis 와 동일하게 camel/Pascal 양쪽을 방어적으로 확인한다.
    const searchTrace = rr.report?.searchTrace ?? rr.report?.SearchTrace ?? null
    return { ok: true, candidates, hasPass: candidates.some(c => c.overallStatus === 'pass'), diagnosis, searchTrace }
  },

  /**
   * 편집(회전·유체비우기·삭제·가서포트·RBE) 반영 최종 모델을 Nastran BDF 로 저장.
   * buildEditedStageJson → host.exportUnitBdf(업로드+백엔드 convert+다운로드+Save-As).
   * host 미지원(구버전 WorkBench 앱·WebHost) 시 안내 메시지를 반환한다(크래시 없음).
   * @returns {Promise<{ ok:boolean, savedPath?:string, stats?:object, canceled?:boolean, error?:string }>}
   */
  exportEditedBdf: async () => {
    const stage = currentStage()
    if (!stage) return { ok: false, error: '모델이 로드되지 않았습니다.' }
    const host = getHost()
    if (typeof host.exportUnitBdf !== 'function') {
      return { ok: false, error: 'BDF 출력은 WorkBench 앱에서 지원됩니다. WorkBench 앱을 최신 버전으로 업데이트하세요.' }
    }
    const intents = get().intents ?? []
    const editedJson = buildEditedStageJson(stage, intents)
    const content = JSON.stringify(editedJson, null, 2)
    const fileName = buildEditedStageFileName(stage, formatTimestamp)
    return host.exportUnitBdf({ fileName, content })
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

/**
 * 권상 구성/자세안정성 평가가 바뀌면 직전 구조해석(허용응력) 결과는 그 구성에 대한 것이
 * 아니게 되므로 무효화한다. 결과가 있을 때만 reset 해 구조 Run 버튼 잠금(isFinished=Success)을
 * 풀어 재해석을 허용한다 — 모델 회전/유체비움(useStageStore)이 쓰는 패턴과 동일(2026-07-07).
 */
function invalidateStructuralResult() {
  const us = useUnitStructuralStore.getState()
  if (us.status || us.result) { us.reset(); return true }
  return false
}

/**
 * 자세안정성(posture) 결과가 남아 있으면 무효화한다. 모델 형상·질량이 바뀌는 편집에서 호출.
 * 결과가 있을 때만 reset 해 초기 편집 단계(아직 평가 전)에는 churn 이 없다.
 * @returns {boolean} 실제로 초기화했으면 true
 */
function invalidateStabilityResult() {
  const ss = useStabilityStore.getState()
  if (ss.report || ss.overallStatus) { ss.reset(); return true }
  return false
}

/**
 * 편집 kind 에 맞춰 해석 결과를 무효화한다.
 * - 구조해석(Unit): 모든 편집에서 무효화.
 * - 자세안정성(posture): 가서포트(addSupportBeam) 는 유지, 그 외 모델 변경 편집은 무효화.
 * @param {string|undefined} kind
 * @returns {boolean} 구조/자세안정성 중 하나라도 실제 초기화했으면 true
 */
function invalidateForEdit(kind) {
  const invStruct = invalidateStructuralResult()
  const invStab = STABILITY_PRESERVING_KINDS.has(kind) ? false : invalidateStabilityResult()
  return invStruct || invStab
}

/**
 * 구역 미니맵·구역 기반 평가의 공통 입력(순수). nodeEntries 는 배열(재순회 가능).
 * @param {import('../data/StageData.js').StageData} stage
 * @param {number|null} hoistToleranceMm
 * @returns {{bbox, nodeEntries:Array, pipeNodes:Set<number>, tolMm:number}|null}
 */
export function buildHoistPartitionInput(stage, hoistToleranceMm, cog = null) {
  if (!stage || !stage.nodeMap || stage.nodeMap.size === 0) return null
  const heightMm = stage.bbox ? Math.max(0, stage.bbox.maxZ - stage.bbox.minZ) : 0
  const tolMm = (Number.isFinite(hoistToleranceMm) && hoistToleranceMm > 0)
    ? hoistToleranceMm
    : Math.max(2, heightMm * 0.004)
  return {
    bbox: stage.bbox,
    nodeEntries: [...stage.nodeMap],
    pipeNodes: pipeNodeIds(stage.elements ?? []),
    tolMm,
    // 무게중심(COG) — 구역 분할 앵커용. null 이면 기하 중심 등분할로 폴백.
    cog: (cog && Number.isFinite(cog.x) && Number.isFinite(cog.y)) ? { x: cog.x, y: cog.y } : null,
  }
}

/** 권상 방식별 그룹수 스윕 목록 (큰 수부터). 슬롯 한계상 4 로 캡. */
export function hoistSweepGroupCounts(mode) {
  if (mode === 'ceiling') return [1]
  const max = Math.min(getHoistMaxGroups(mode) ?? 4, 4)
  const arr = []
  for (let k = max; k >= 1; k--) arr.push(k)
  return arr
}

/** Stage0 파싱용 시드 노드 — 유효 좌표를 가진 앞쪽 n 개 노드 ID. */
function pickSeedNodeIds(stage, n) {
  const ids = []
  if (!stage?.nodeMap) return ids
  for (const [id, node] of stage.nodeMap) {
    if (node && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)) {
      ids.push(id)
      if (ids.length >= n) break
    }
  }
  return ids
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
  // addHoistNode/applyAutoHoistGroups 와 동일하게 "노드는 한 그룹에만" 을 강제한다 —
  // import JSON 의 groups 를 무조건 신뢰하면 같은 nodeId 가 두 그룹에 중복될 수 있다(먼저 나온 그룹 유지).
  const used = new Set()
  let groupCount = 1
  for (const g of hoisting.groups ?? []) {
    if (!ALL_HOIST_GROUP_IDS.includes(g.id)) continue
    if (g.id > max) continue
    const ids = []
    for (const nodeId of (Array.isArray(g.nodeIds) ? g.nodeIds : [])) {
      if (nodeId == null || used.has(nodeId)) continue
      ids.push(nodeId)
      used.add(nodeId)
      if (ids.length === 4) break
    }
    groups[g.id] = ids
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
export function buildPostureStabilityPayload(state, hoisting, stage, editedFileName) {
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
  // ★ 배관 유체 비움(pipeFluidEmptied) 또는 모델 회전(modelRotated) 시 stageSummary 는
  //    회전/유체 전 상태로 계산된 stale 값이므로 무시하고 computeMassFallback 으로 재계산한다.
  //    (이 게이트가 없으면 회전/비움 후 자세안정성 평가를 다시 실행해도 옛 무게중심이 들어간다.)
  const stageState = useStageStore.getState()
  const summary = (stageState.pipeFluidEmptied || stageState.modelRotated) ? null : stageState.stageSummary
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

  const payload = {
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
      // 무게중심 포락선(선택). 있으면 Stage 6 이 XY 네 코너 최악에서 전도를 판정한다.
      // 없으면 후보가 COG 한 점뿐이라 기존 동작과 완전히 같다.
      ...(serializeCogTolerance(state.cogTolerance) ?? {}),
    },
    // 자세안정성 평가 엄격도(Hoist 패널 'Strict 평가' 토글). false 면 엔진이 Stage 1·2 형상 위반을
    // warn 으로 강등하고 옵티마이저 후보 게이트의 형상 검증을 우회한다. Stage 3(wireLengthM≤0)·
    // Stage 6(전도)은 완화 대상이 아니다. 산출물에 남겨 "어떤 기준으로 평가했는지" 추적 가능하게 한다.
    strictEvaluation: state.strictEvaluation === true,
    // 권상 리깅 검토(Stage 7). enabled 일 때만 싣는다 — 없으면 엔진이 skip 하고 화면에서도 숨긴다.
    ...(state.liftAnalysis?.enabled ? { liftAnalysis: serializeLiftAnalysis(state.liftAnalysis) } : {}),
  }
  if (state.hoistOptimization) {
    const opt = state.hoistOptimization
    payload.hoistOptimization = {
      desiredGroupCount: Number.isInteger(opt.desiredGroupCount) ? opt.desiredGroupCount : null,
      pointsPerGroup: Number.isInteger(opt.pointsPerGroup) ? opt.pointsPerGroup : null,
      allowedNodeIds: Array.isArray(opt.allowedNodeIds)
        ? opt.allowedNodeIds.map(Number).filter(Number.isFinite)
        : [],
      lockGroupCount: !!opt.lockGroupCount,
      tolMm: (opt.tolMm != null && Number.isFinite(Number(opt.tolMm))) ? Number(opt.tolMm) : null,
      // 4점 형상 선호: 'auto'(기본) | 'quad'(사각형만) | 'line'(일직선만). 알 수 없는 값은 auto.
      shapePreference: (opt.shapePreference === 'quad' || opt.shapePreference === 'line') ? opt.shapePreference : 'auto',
      regions: Array.isArray(opt.regions) ? opt.regions
        .filter(r => Array.isArray(r.nodeIds) && r.nodeIds.length > 0)
        .map(r => ({
          id: String(r.id ?? ''),
          groupId: Number(r.groupId),
          requestedPointCount: Number(r.requestedPointCount),
          // 구역별 4점 형상(사용자 규칙 2026-07-03): 'quad'(사각형)|'line'(일직선)만 유효, 그 외는 'auto'.
          shape: (r.shape === 'quad' || r.shape === 'line') ? r.shape : 'auto',
          nodeIds: r.nodeIds.map(Number).filter(Number.isFinite),
        }))
        .filter(r => Number.isInteger(r.groupId) && r.groupId > 0 && r.nodeIds.length > 0)
        : [],
    }
  }
  return payload
}

/**
 * 권상 리깅 검토 입력을 _posture.json 스키마로 정규화한다.
 * 빈 문자열·NaN·0 이하는 null 로 떨어뜨려 "그 검사만 생략" 이 되게 한다
 * (엔진이 임의 안전값을 가정하지 않으므로 null 과 0 을 구분해야 한다).
 */
function serializeLiftAnalysis(la) {
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v)
  const pos = (v) => { const n = num(v); return n != null && n > 0 ? n : null }
  return {
    enabled: true,
    daf: pos(la.daf) ?? 1.0,
    weightContingencyPct: num(la.weightContingencyPct) ?? 0,
    allowables: {
      wireSwlTon: pos(la.wireSwlTon),
      shackleSwlTon: pos(la.shackleSwlTon),
      lugSwlTon: pos(la.lugSwlTon),
    },
  }
}

/**
 * 무게중심 포락선을 model 에 얹을 형태로 정규화한다.
 * 꺼져 있거나 세 축이 모두 0/빈값이면 null 을 돌려주고, 호출부는 아무것도 싣지 않는다
 * → 엔진에서 후보가 COG 한 점 = 기존 동작 그대로.
 */
function serializeCogTolerance(ct) {
  if (!ct?.enabled) return null
  const abs = (v) => {
    const n = (v == null || v === '') ? 0 : Number(v)
    return Number.isFinite(n) ? Math.abs(n) : 0
  }
  const x = abs(ct.x), y = abs(ct.y), z = abs(ct.z)
  if (x === 0 && y === 0 && z === 0) return null
  return { cogToleranceMm: { x, y, z } }
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

/** 포인트질량(장비)만의 질량중심 — 뷰어 computeStageCogFallback 과 동일(BEAM 자중 제외). */
function pointMassCogFallback(stage) {
  if (!stage || !Array.isArray(stage.pointMasses) || stage.pointMasses.length === 0) return null
  let total = 0
  const acc = { x: 0, y: 0, z: 0 }
  for (const pm of stage.pointMasses) {
    const n = stage.nodeMap?.get?.(pm.nodeId)
    const mass = Number(pm.mass)
    if (!n || !Number.isFinite(mass) || mass <= 0) continue
    total += mass
    acc.x += n.x * mass; acc.y += n.y * mass; acc.z += n.z * mass
  }
  if (total <= 0) return null
  return { x: acc.x / total, y: acc.y / total, z: acc.z / total }
}

/**
 * 구역 분할 앵커용 모델 무게중심(COG) 해석.
 * ★ 3D 뷰어의 노란색 COG 마커(ThreeViewport getCogMm)와 **완전히 동일한 우선순위**로 해석한다 —
 *   그래야 미니맵의 분할 중심이 뷰어의 실제 COG(노란 원)와 정확히 일치한다.
 *   1) 유체 비움/회전 → mutated stage 재계산(BEAM 자중 포함)
 *   2) stageSummary(_COG.json/00_StageSummary) → 3) stability input → 4) stability model
 *   5) 포인트질량(장비)만의 질량중심(뷰어 최후 폴백과 동일)
 * (과거 버전은 stabilityReport 를 보지 않고 곧장 computeMassFallback(BEAM 자중 지배 → ≈기하 중심)으로
 *  폴백해, 자세안정성 평가로 실제 COG 가 있는데도 미니맵이 기하 중심을 가리키는 버그가 있었다.)
 * @returns {{x:number,y:number,z:number}|null}
 */
export function resolveModelCog(stage) {
  const { pipeFluidEmptied, modelRotated, stageSummary } = useStageStore.getState()
  const stabilityReport = useStabilityStore.getState().report
  const isCog = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)

  if (pipeFluidEmptied || modelRotated) {
    const recomputed = computeMassFallback(stage)?.centerOfGravityMm
    if (isCog(recomputed)) return recomputed
  }
  const fromSummary = stageSummary?.massProperties?.centerOfGravityMm
  if (isCog(fromSummary)) return fromSummary
  const fromStability = stabilityReport?.input?.centerOfGravityMm
  if (isCog(fromStability)) return fromStability
  const fromPosture = stabilityReport?.model?.centerOfGravityMm
  if (isCog(fromPosture)) return fromPosture
  const pmFallback = pointMassCogFallback(stage)
  return isCog(pmFallback) ? pmFallback : null
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
