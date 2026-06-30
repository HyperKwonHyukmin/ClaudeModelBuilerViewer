/**
 * EditIntent — 뷰어에서 사용자가 만든 편집 의도(설계 변경 명령) 1건.
 *
 * Phase 1 범위: 타입 정의 + 검증 + 직렬화/역직렬화.
 * 실제 인텐트 생성 UI(rigid 묶기, 그룹 삭제)는 Phase 2/3 에서 추가.
 *
 *   {
 *     id:          string                       // 고유 ID (crypto.randomUUID() 권장)
 *     kind:        'addRigid' | 'deleteGroup' | 'deleteElement' | 'deleteCategory' | 'deleteOrphanNodes'
 *     createdAt:   string                       // ISO 8601
 *     params:      object                       // kind 별 스키마
 *     validation:  { status, warnings, errors } // 추가 시점 검증 결과
 *   }
 *
 * - addRigid.params:           { independentNode, dependentNodes[], remark?, cm? }
 * - deleteGroup.params:        { groupId, memberNodeCount? }
 * - deleteElement.params:      { elementId, category?, startNode?, endNode? }   // 메타 필드는 summary 용
 * - deleteOrphanNodes.params:  { nodeIds: number[] }
 */

export const EDIT_INTENT_SCHEMA_VERSION = '1.0'

const VALID_KINDS = new Set(['addRigid', 'deleteGroup', 'deleteElement', 'deleteCategory', 'deleteOrphanNodes', 'emptyPipeFluid', 'rotateModel', 'addSupportBeam'])

/**
 * 새 EditIntent 1건을 만든다 (검증은 별도, validateIntent 호출 후 합치기).
 * @param {'addRigid'|'deleteGroup'} kind
 * @param {object} params
 * @returns {{ id: string, kind: string, createdAt: string, params: object, validation: { status: 'ok', warnings: [], errors: [] } }}
 */
export function createIntent(kind, params) {
  if (!VALID_KINDS.has(kind)) {
    throw new Error(`Unknown EditIntent kind: ${kind}`)
  }
  return {
    id: makeId(),
    kind,
    createdAt: new Date().toISOString(),
    params: { ...params },
    validation: { status: 'ok', warnings: [], errors: [] },
  }
}

/**
 * intent 1건을 검증해 validation 결과를 반환한다.
 * - status: 'ok' | 'warning' | 'error'
 * - errors[] 가 1개 이상이면 status='error' (추가 차단)
 * - warnings[] 만 있으면 status='warning' (사용자 확인 후 추가 허용)
 *
 * @param {object} intent       createIntent 결과 또는 동등 구조
 * @param {import('./StageData.js').StageData} stageData
 * @param {object[]} existingIntents  현재 스토어에 이미 들어 있는 intents (중복 검사용)
 * @returns {{ status: 'ok'|'warning'|'error', warnings: string[], errors: string[] }}
 */
export function validateIntent(intent, stageData, existingIntents = []) {
  const errors = []
  const warnings = []

  if (intent.kind === 'addRigid') {
    validateAddRigid(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'deleteGroup') {
    validateDeleteGroup(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'deleteElement') {
    validateDeleteElement(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'deleteCategory') {
    validateDeleteCategory(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'deleteOrphanNodes') {
    validateDeleteOrphanNodes(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'emptyPipeFluid') {
    validateEmptyPipeFluid(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'rotateModel') {
    validateRotateModel(intent.params, stageData, existingIntents, errors, warnings)
  } else if (intent.kind === 'addSupportBeam') {
    validateAddSupportBeam(intent.params, stageData, existingIntents, errors, warnings)
  } else {
    errors.push(`알 수 없는 intent kind: ${intent.kind}`)
  }

  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok'
  return { status, warnings, errors }
}

function validateAddRigid(params, stageData, existingIntents, errors, warnings) {
  const indep = params?.independentNode
  const deps  = params?.dependentNodes

  if (indep == null || !Number.isInteger(indep)) {
    errors.push('독립 노드(independentNode) 가 정수가 아닙니다.')
  }
  if (!Array.isArray(deps) || deps.length === 0) {
    errors.push('종속 노드(dependentNodes) 가 비어 있습니다.')
  } else if (deps.some(d => !Number.isInteger(d))) {
    errors.push('종속 노드 배열에 정수가 아닌 값이 있습니다.')
  } else if (indep != null && deps.includes(indep)) {
    errors.push('독립 노드와 종속 노드가 동일합니다.')
  }

  // 노드 존재 여부 — stageData 가 주어졌을 때만
  if (stageData?.nodeMap) {
    if (indep != null && !stageData.nodeMap.has(indep)) {
      errors.push(`독립 노드 #${indep} 가 StageData 에 존재하지 않습니다.`)
    }
    if (Array.isArray(deps)) {
      const missing = deps.filter(d => !stageData.nodeMap.has(d))
      if (missing.length > 0) {
        errors.push(`종속 노드 ${missing.join(',')} 가 StageData 에 존재하지 않습니다.`)
      }
    }
  }

  // cm: 1~6 중복 없는 숫자 1~6자리 (선택). 예: 123, 26, 123456
  if (params?.cm != null && params.cm !== '') {
    const cm = String(params.cm)
    const cmChars = cm.split('')
    // 정규식만으로는 '1111' 같은 중복을 통과시켜, CLI apply-edit 가 exit 65 로 전체 실패한다.
    // C# IsValidCm/NormalizeCm 과 동일하게 각 자리 1~6 + 중복 금지를 함께 검사.
    if (!/^[1-6]{1,6}$/.test(cm) || new Set(cmChars).size !== cmChars.length) {
      errors.push(`DOF(cm) 형식이 올바르지 않습니다: ${cm} (1~6 중 중복 없이 입력, 예: 123, 26)`)
    }
  }

  // 중복 (원본 + 기존 intent)
  if (errors.length === 0 && Array.isArray(deps)) {
    const depKey = [...deps].sort((a, b) => a - b).join(',')
    if (stageData?.rigids?.some(r => {
      if (r.independentNode !== indep) return false
      const existing = [...(r.dependentNodes ?? [])].sort((a, b) => a - b).join(',')
      return existing === depKey
    })) {
      warnings.push('동일한 (독립, 종속) 조합의 RBE 가 원본에 이미 존재합니다.')
    }
    for (const ex of existingIntents) {
      if (ex.kind !== 'addRigid') continue
      if (ex.params?.independentNode !== indep) continue
      const exKey = [...(ex.params.dependentNodes ?? [])].sort((a, b) => a - b).join(',')
      if (exKey === depKey) {
        warnings.push('동일한 (독립, 종속) 조합의 addRigid intent 가 이미 추가되어 있습니다.')
        break
      }
    }
  }
}

function validateDeleteGroup(params, stageData, existingIntents, errors, warnings) {
  const groupId = params?.groupId

  if (groupId == null || !Number.isInteger(groupId)) {
    errors.push('groupId 가 정수가 아닙니다.')
  }

  if (stageData?.groups) {
    const group = stageData.groups.find(g => g.id === groupId)
    if (!group) {
      errors.push(`그룹 #${groupId} 가 StageData.groups 에 존재하지 않습니다.`)
    } else {
      // 삭제 대상 노드가 다른 RBE 의 독립노드인지 검사
      const memberSet = new Set(group.nodeIds ?? [])
      const conflictRbes = stageData.rigids.filter(r =>
        memberSet.has(r.independentNode) &&
        // 종속 중 하나라도 그룹 밖이면 RBE 가 끊긴다
        (r.dependentNodes ?? []).some(d => !memberSet.has(d))
      )
      if (conflictRbes.length > 0) {
        warnings.push(
          `RBE ${conflictRbes.slice(0, 5).map(r => '#' + r.id).join(', ')} 의 독립노드가 삭제 대상에 포함됩니다 (총 ${conflictRbes.length} 개).`
        )
      }
    }
  }

  // 같은 그룹을 두 번 삭제하려는 경우
  for (const ex of existingIntents) {
    if (ex.kind !== 'deleteGroup') continue
    if (ex.params?.groupId === groupId) {
      errors.push(`그룹 #${groupId} 삭제 intent 가 이미 추가되어 있습니다.`)
      break
    }
  }
}

/**
 * intents 배열을 export 용 JSON 객체로 직렬화한다.
 * stageData 가 주어지면 stageRef 메타도 함께 채운다.
 *
 * @param {object[]} intents
 * @param {import('./StageData.js').StageData|null} [stageData]
 * @param {object|null} [hoisting]
 * @returns {object}
 */
export function serializeIntents(intents, stageData = null, hoisting = null) {
  return {
    schemaVersion: EDIT_INTENT_SCHEMA_VERSION,
    stageRef: stageData ? {
      phase:           stageData.meta?.phase ?? null,
      stageName:       stageData.meta?.stageName ?? null,
      sourceTimestamp: stageData.meta?.timestamp ?? null,
    } : null,
    createdAt: new Date().toISOString(),
    createdBy: 'viewer',
    hoisting,
    intents: intents.map(i => ({
      id:         i.id,
      kind:       i.kind,
      createdAt:  i.createdAt,
      params:     i.params,
      validation: i.validation,
    })),
  }
}

/**
 * Export JSON 객체를 다시 intents 배열로 풀어낸다 (Import 흐름용).
 * 스키마 호환성 검사 + 누락 필드 보완.
 *
 * @param {object} json  serializeIntents 결과 또는 동등 구조
 * @returns {{ intents: object[], stageRef: object|null, schemaVersion: string }}
 */
export function parseIntents(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('EditIntent JSON 이 올바르지 않습니다.')
  }
  if (json.schemaVersion !== EDIT_INTENT_SCHEMA_VERSION) {
    throw new Error(`지원하지 않는 schemaVersion: ${json.schemaVersion}`)
  }
  const list = Array.isArray(json.intents) ? json.intents : []
  const intents = list.map(raw => ({
    id:         raw.id ?? makeId(),
    kind:       raw.kind,
    createdAt:  raw.createdAt ?? new Date().toISOString(),
    params:     raw.params ?? {},
    validation: raw.validation ?? { status: 'ok', warnings: [], errors: [] },
  }))
  return {
    intents,
    stageRef: json.stageRef ?? null,
    hoisting: json.hoisting ?? null,
    schemaVersion: json.schemaVersion,
  }
}

/**
 * intent 1건을 사람이 읽기 좋은 한 줄 라벨로 변환한다 (EditPanel 행 표기용).
 */
export function summarizeIntent(intent) {
  if (intent.kind === 'addRigid') {
    const { independentNode, dependentNodes, remark } = intent.params ?? {}
    const dep = Array.isArray(dependentNodes) ? dependentNodes : []
    const head = dep.slice(0, 3).join(',')
    const tail = dep.length > 3 ? `…외 ${dep.length - 3}` : ''
    const tag = remark ? ` (${remark})` : ''
    return `RBE: ${independentNode} ↔ ${head}${tail}${tag}`
  }
  if (intent.kind === 'deleteGroup') {
    const { groupId, memberNodeCount } = intent.params ?? {}
    const cnt = memberNodeCount != null ? ` (${memberNodeCount} 노드)` : ''
    return `그룹 #${groupId} 삭제${cnt}`
  }
  if (intent.kind === 'deleteElement') {
    const { elementId, category, startNode, endNode } = intent.params ?? {}
    const cat = category ? ` ${category}` : ''
    const ends = (startNode != null && endNode != null) ? ` (N${startNode}↔N${endNode})` : ''
    return `요소 #${elementId} 삭제${cat}${ends}`
  }
  if (intent.kind === 'deleteCategory') {
    const { category, elementCount } = intent.params ?? {}
    const label = category === 'Structure' ? '구조' : category === 'Pipe' ? '배관' : category
    const cnt = elementCount != null ? ` (${elementCount}개 요소)` : ''
    return `${label} 부재 일괄 삭제${cnt}`
  }
  if (intent.kind === 'deleteOrphanNodes') {
    const ids = Array.isArray(intent.params?.nodeIds) ? intent.params.nodeIds : []
    const head = ids.slice(0, 4).join(',')
    const tail = ids.length > 4 ? `…외 ${ids.length - 4}` : ''
    return `Orphan 노드 ${ids.length}개 삭제 (${head}${tail})`
  }
  if (intent.kind === 'emptyPipeFluid') {
    const ids = Array.isArray(intent.params?.materialIds) ? intent.params.materialIds : []
    return `배관 내부 유체 비우기 (${ids.length}개 material → ρ=7.85e-9)`
  }
  if (intent.kind === 'rotateModel') {
    const { axis, angleDeg } = intent.params ?? {}
    return `모델 회전 (${axis}축 ${angleDeg}°)`
  }
  if (intent.kind === 'addSupportBeam') {
    const { startNode, endNode } = intent.params ?? {}
    return `가서포트 L100×100×10t (N${startNode}↔N${endNode})`
  }
  return `알 수 없는 intent: ${intent.kind}`
}

function validateDeleteElement(params, stageData, existingIntents, errors, warnings) {
  const elementId = params?.elementId

  if (elementId == null || !Number.isInteger(elementId)) {
    errors.push('elementId 가 정수가 아닙니다.')
    return
  }

  let target = null
  if (stageData?.elements) {
    target = stageData.elements.find(e => e.id === elementId)
    if (!target) {
      errors.push(`요소 #${elementId} 가 StageData.elements 에 존재하지 않습니다.`)
    } else if (target.type !== 'BEAM') {
      // 현재 시각화/삭제 대상은 BEAM 만 지원 (CTRIA/CQUAD 등은 별도 작업)
      errors.push(`요소 #${elementId} 는 BEAM 이 아니라 삭제 대상이 아닙니다 (type=${target.type}).`)
    }
  }

  // 같은 요소를 두 번 삭제하려는 경우
  for (const ex of existingIntents) {
    if (ex.kind !== 'deleteElement') continue
    if (ex.params?.elementId === elementId) {
      errors.push(`요소 #${elementId} 삭제 intent 가 이미 추가되어 있습니다.`)
      break
    }
  }

  // 이미 deleteGroup intent 로 사라질 그룹에 속한 요소면 사용자에게 알림 (중복은 아니지만 무의미)
  if (target && stageData?.groups) {
    const containingGroup = stageData.groups.find(g => (g.elementIds ?? []).includes(elementId))
    if (containingGroup) {
      const groupWillBeDeleted = existingIntents.some(ex =>
        ex.kind === 'deleteGroup' && ex.params?.groupId === containingGroup.id
      )
      if (groupWillBeDeleted) {
        warnings.push(`요소 #${elementId} 가 속한 그룹 #${containingGroup.id} 가 이미 삭제 예정입니다.`)
      }
    }
  }
}

// 부재 종류(구조/배관) 일괄 삭제 — 해당 category 의 BEAM 요소를 통째로 제거한다.
// 연결 그룹이 1개로 합쳐진 모델에서 구조/배관 단위로 정리할 수 있게 하는 진입점.
const DELETABLE_CATEGORIES = new Set(['Structure', 'Pipe'])

function validateDeleteCategory(params, stageData, existingIntents, errors, warnings) {
  const category = params?.category

  if (!DELETABLE_CATEGORIES.has(category)) {
    errors.push(`삭제 가능한 부재 종류가 아닙니다: ${category} (Structure | Pipe)`)
    return
  }

  if (stageData?.elements) {
    const count = stageData.elements.filter(e => e.type === 'BEAM' && e.category === category).length
    if (count === 0) {
      errors.push(`${category} 종류의 BEAM 요소가 없습니다.`)
    } else {
      warnings.push(`${category} 부재 ${count}개를 통째로 삭제합니다. 적용 전까지는 미리보기이며 좌측에서 취소할 수 있습니다.`)
    }
  }

  // 같은 종류를 두 번 삭제하려는 경우
  for (const ex of existingIntents) {
    if (ex.kind !== 'deleteCategory') continue
    if (ex.params?.category === category) {
      errors.push(`${category} 부재 삭제 intent 가 이미 추가되어 있습니다.`)
      break
    }
  }
}

function validateDeleteOrphanNodes(params, stageData, existingIntents, errors, warnings) {
  const ids = params?.nodeIds
  if (!Array.isArray(ids) || ids.length === 0) {
    errors.push('nodeIds 가 비어 있습니다.')
    return
  }
  if (ids.some(n => !Number.isInteger(n))) {
    errors.push('nodeIds 배열에 정수가 아닌 값이 있습니다.')
    return
  }
  if (stageData?.nodeMap) {
    const missing = ids.filter(n => !stageData.nodeMap.has(n))
    if (missing.length > 0) {
      errors.push(`Orphan 노드 ${missing.slice(0, 5).join(',')} 가 StageData 에 존재하지 않습니다.`)
    }
  }
  // 같은 intent 가 이미 있는지 (Set 비교)
  for (const ex of existingIntents) {
    if (ex.kind !== 'deleteOrphanNodes') continue
    const exIds = new Set(ex.params?.nodeIds ?? [])
    if (exIds.size === ids.length && ids.every(n => exIds.has(n))) {
      errors.push('동일한 Orphan 삭제 intent 가 이미 추가되어 있습니다.')
      break
    }
  }
}

function validateEmptyPipeFluid(params, stageData, existingIntents, errors, warnings) {
  const ids = params?.materialIds
  if (!Array.isArray(ids) || ids.length === 0) {
    errors.push('materialIds 가 비어 있습니다 (비울 배관 material 없음).')
    return
  }
  if (ids.some(m => !Number.isInteger(m))) {
    errors.push('materialIds 배열에 정수가 아닌 값이 있습니다.')
    return
  }
  // 단방향 — 같은 intent 중복 추가 차단
  for (const ex of existingIntents) {
    if (ex.kind === 'emptyPipeFluid') {
      errors.push('배관 유체 비우기 intent 가 이미 추가되어 있습니다.')
      return
    }
  }
  // 현재 stage 에 없는 material 은 경고만 (다른 stage 기준일 수 있음)
  if (stageData?.materialMap) {
    const missing = ids.filter(m => !stageData.materialMap.has(m))
    if (missing.length > 0) {
      warnings.push(`material ${missing.slice(0, 5).join(',')} 가 현재 stage 에 없습니다.`)
    }
  }
}

function validateRotateModel(params, stageData, existingIntents, errors, warnings) {
  const axis = params?.axis
  const angleDeg = params?.angleDeg
  if (axis !== 'X' && axis !== 'Y' && axis !== 'Z') {
    errors.push(`회전축이 X/Y/Z 가 아닙니다: ${axis}`)
  }
  if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg)) {
    errors.push('회전 각도(angleDeg) 가 유한한 숫자가 아닙니다.')
  }
  // 누적 회전 허용 — 같은 kind 중복은 막지 않는다.
}

// 가서포트(보강) L beam — 두 노드를 잇는 신규 CBEAM. 동일 쌍(무순서) 중복 차단,
// 이미 직접 BEAM 으로 연결된 노드쌍이면 redundant warning(추가는 허용).
function validateAddSupportBeam(params, stageData, existingIntents, errors, warnings) {
  const a = params?.startNode
  const b = params?.endNode
  if (a == null || !Number.isInteger(a) || b == null || !Number.isInteger(b)) {
    errors.push('가서포트 노드(startNode/endNode)가 정수가 아닙니다.')
    return
  }
  if (a === b) {
    errors.push('가서포트 두 노드가 동일합니다.')
    return
  }
  if (stageData?.nodeMap) {
    if (!stageData.nodeMap.has(a)) errors.push(`가서포트 노드 #${a} 가 StageData 에 존재하지 않습니다.`)
    if (!stageData.nodeMap.has(b)) errors.push(`가서포트 노드 #${b} 가 StageData 에 존재하지 않습니다.`)
    if (errors.length > 0) return
  }
  const key = [a, b].sort((x, y) => x - y).join('-')
  for (const ex of existingIntents) {
    if (ex.kind !== 'addSupportBeam') continue
    const exKey = [ex.params?.startNode, ex.params?.endNode].sort((x, y) => x - y).join('-')
    if (exKey === key) {
      errors.push(`동일한 가서포트(N${a}↔N${b})가 이미 추가되어 있습니다.`)
      return
    }
  }
  // 이미 BEAM 으로 직접 연결돼 있으면 보강 의미가 약함 — 경고만.
  if (stageData?.elements) {
    const connected = stageData.elements.some(e =>
      e.type === 'BEAM' &&
      ((e.startNode === a && e.endNode === b) || (e.startNode === b && e.endNode === a))
    )
    if (connected) warnings.push(`두 노드(N${a}, N${b})는 이미 직접 연결되어 있습니다.`)
  }
}

// ── 내부 유틸 ────────────────────────────────────────────────────────────

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // fallback — 타임스탬프 + 무작위
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
