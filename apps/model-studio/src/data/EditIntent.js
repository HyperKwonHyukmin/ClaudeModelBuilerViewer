/**
 * EditIntent — 뷰어에서 사용자가 만든 편집 의도(설계 변경 명령) 1건.
 *
 * Phase 1 범위: 타입 정의 + 검증 + 직렬화/역직렬화.
 * 실제 인텐트 생성 UI(rigid 묶기, 그룹 삭제)는 Phase 2/3 에서 추가.
 *
 *   {
 *     id:          string                       // 고유 ID (crypto.randomUUID() 권장)
 *     kind:        'addRigid' | 'deleteGroup'
 *     createdAt:   string                       // ISO 8601
 *     params:      object                       // kind 별 스키마
 *     validation:  { status, warnings, errors } // 추가 시점 검증 결과
 *   }
 *
 * - addRigid.params:    { independentNode, dependentNodes[], remark?, cm? }
 * - deleteGroup.params: { groupId, memberNodeCount? }
 */

export const EDIT_INTENT_SCHEMA_VERSION = '1.0'

const VALID_KINDS = new Set(['addRigid', 'deleteGroup'])

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

  // cm: 1~6자리 숫자 (선택)
  if (params?.cm != null && params.cm !== '') {
    const cm = String(params.cm)
    if (!/^[1-6]{1,6}$/.test(cm)) {
      errors.push(`DOF(cm) 형식이 올바르지 않습니다: ${cm} (1~6자리, 각 자리 1~6)`)
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
 * @returns {object}
 */
export function serializeIntents(intents, stageData = null) {
  return {
    schemaVersion: EDIT_INTENT_SCHEMA_VERSION,
    stageRef: stageData ? {
      phase:           stageData.meta?.phase ?? null,
      stageName:       stageData.meta?.stageName ?? null,
      sourceTimestamp: stageData.meta?.timestamp ?? null,
    } : null,
    createdAt: new Date().toISOString(),
    createdBy: 'viewer',
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
  return `알 수 없는 intent: ${intent.kind}`
}

// ── 내부 유틸 ────────────────────────────────────────────────────────────

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // fallback — 타임스탬프 + 무작위
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
