import { StageData } from './StageData.js'
import { computeDeleteMask } from './applyEditIntents.js'

/**
 * 현재 stageData + edit intents 로부터 "편집이 반영된 새 phase JSON" 을 생성한다.
 *
 * 결과는 입력과 동일한 schema (nodes/elements/rigids/properties/materials/pointMasses
 *  + connectivity + healthMetrics + meta + diagnostics + trace) 로 self-contained 하며,
 * connectivity 와 healthMetrics 는 union-find 로 재계산된다 (stale 표시 없음).
 *
 * 편집 의도 적용 규칙:
 *  - deleteGroup           : 해당 그룹의 nodeIds / elementIds 를 모두 제거
 *  - PointMass             : 노드가 사라지면 함께 제거
 *  - 기존 Rigid             : independent 가 사라지면 무효 → 제거.
 *                            independent 살아있고 dependent 일부만 사라지면 살아남은 dep 으로 축소.
 *                            모든 dep 가 사라지면 무효 → 제거.
 *  - addRigid              : 새 id (기존 max+1, 1, 2, ...) 부여 후 추가
 *  - properties / materials: 그대로 보존
 *  - meta                  : 기존 meta + edited:true + editedAt 타임스탬프
 *  - trace                 : 기존 trace 끝에 EditApplied 마커 1개 추가
 *  - diagnostics           : 빈 배열 (편집 후라 stale)
 *  - connectivity / healthMetrics : 임시 StageData 를 만들어 자동 재계산
 *
 * @param {import('./StageData.js').StageData} stageData
 * @param {object[]} intents
 * @returns {object} 새 phase JSON 객체
 */
export function buildEditedStageJson(stageData, intents) {
  if (!stageData) throw new Error('stageData is required')
  const mask = computeDeleteMask(stageData, intents ?? [])

  // ── 노드 ──────────────────────────────────────────────────────────────
  const nodes = []
  for (const [id, n] of stageData.nodeMap) {
    if (mask.deletedNodeIds.has(id)) continue
    nodes.push({
      id,
      x: n.x, y: n.y, z: n.z,
      tags: Array.isArray(n.tags) ? [...n.tags] : [],
    })
  }

  // ── 요소 (BEAM 외 elements 는 deleteGroup 영향 없음 → 그대로) ─────────
  const elements = []
  for (const e of stageData.elements ?? []) {
    if (mask.deletedElementIds.has(e.id)) continue
    elements.push(serializeElement(e))
  }

  // ── Rigid 정리 + addRigid 반영 ────────────────────────────────────────
  const rigids = []
  for (const r of stageData.rigids ?? []) {
    if (mask.fullyRemovedRbeIds.has(r.id)) continue
    if (r.independentNode == null) continue
    if (mask.deletedNodeIds.has(r.independentNode)) continue
    const surviving = (r.dependentNodes ?? []).filter(d => !mask.deletedNodeIds.has(d))
    if (surviving.length === 0) continue
    rigids.push({
      ...r,
      dependentNodes: surviving,
    })
  }
  // addRigid intents → 새 id 부여
  let nextRigidId = (stageData.rigids ?? []).reduce((m, r) => Math.max(m, r.id ?? 0), 0) + 1
  for (const ar of mask.addedRigids ?? []) {
    rigids.push({
      id: nextRigidId++,
      independentNode: ar.independentNode,
      dependentNodes: [...ar.dependentNodes],
      cm: ar.cm ?? '123456',
      remark: ar.remark ?? null,
    })
  }

  // ── PointMass: 노드 삭제 시 함께 제거 ─────────────────────────────────
  const pointMasses = []
  for (const pm of stageData.pointMasses ?? []) {
    if (mask.deletedMassIds.has(pm.id)) continue
    pointMasses.push({ ...pm })
  }

  // ── meta ──────────────────────────────────────────────────────────────
  const editedAt = new Date().toISOString()
  const meta = {
    ...(stageData.meta ?? {}),
    edited: true,
    editedAt,
    sourceStageName: stageData.meta?.stageName ?? null,
  }

  // ── connectivity / healthMetrics 재계산: 임시 StageData 인스턴스 사용 ──
  // _computeGroups / _computeConnectivity / _computeHealthMetrics 가 자동 실행됨.
  const tempStage = new StageData({
    meta,
    nodes,
    elements,
    rigids,
    properties: stageData.properties ?? [],
    materials:  stageData.materials  ?? [],
    pointMasses,
    // connectivity / healthMetrics 를 비워야 fallback 계산이 동작
    connectivity: null,
    healthMetrics: null,
    diagnostics: [],
    trace: [],
  })

  const connectivity = serializeConnectivity(tempStage)
  const healthMetrics = tempStage.healthMetrics

  // ── trace: 원본 + EditApplied 마커 ────────────────────────────────────
  const editTrace = {
    stage: 'EditApplied',
    action: 'EditApplied',
    timestamp: editedAt,
    deletedGroupCount:   mask.deletedGroupIds?.size ?? 0,
    deletedNodeCount:    mask.deletedNodeIds?.size  ?? 0,
    deletedElementCount: mask.deletedElementIds?.size ?? 0,
    fullyRemovedRbeCount: mask.fullyRemovedRbeIds?.size ?? 0,
    addedRigidCount:     mask.addedRigids?.length ?? 0,
  }
  const trace = [...(stageData.trace ?? []), editTrace]

  return {
    meta,
    nodes,
    elements,
    rigids,
    properties: stageData.properties ?? [],
    materials:  stageData.materials  ?? [],
    pointMasses,
    connectivity,
    healthMetrics,
    diagnostics: [],
    trace,
  }
}

function serializeElement(e) {
  // StageData.normalizeElement 가 type 을 'BEAM' 으로 일원화하면서 원본 cardType 을 보존했다.
  // 백엔드/다음 파이프라인이 원본 카드 정보를 살리고 싶을 수 있으므로 cardType 도 함께 내보낸다.
  const out = { ...e }
  if (e.cardType && !out.cardType) out.cardType = e.cardType
  return out
}

function serializeConnectivity(stage) {
  const groups = (stage.groups ?? []).map(g => ({
    id: g.id,
    elementIds: [...(g.elementIds ?? [])],
    nodeIds:    [...(g.nodeIds ?? [])],
    nodeCount:  g.nodeCount ?? (g.nodeIds?.length ?? 0),
  }))
  return {
    groupCount: stage.connectivity?.groupCount ?? groups.length,
    largestGroupNodeCount:    stage.connectivity?.largestGroupNodeCount    ?? (groups[0]?.nodeCount ?? 0),
    largestGroupElementCount: stage.connectivity?.largestGroupElementCount ?? (groups[0]?.elementIds?.length ?? 0),
    isolatedNodeCount:        stage.connectivity?.isolatedNodeCount        ?? 0,
    groups,
  }
}

/**
 * "<source>_edited.json" 파일명. sourceFileName 이 없으면 phase/timestamp 기반.
 */
export function buildEditedStageFileName(stage, formatTimestamp) {
  const src = stage?.sourceFileName
  if (src) {
    const base = src.replace(/\.json$/i, '')
    return `${base}_edited.json`
  }
  const phase = stage?.meta?.phase ?? 'X'
  const ts = formatTimestamp ? formatTimestamp(new Date()) : Date.now()
  return `edited_${phase}_${ts}.json`
}
