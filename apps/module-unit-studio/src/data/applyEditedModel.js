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
 *  - addRigid              : 새 id (elements+rigids 통합 max+1 …) 부여 후 추가 (RBE2=element ID 네임스페이스 공유)
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

  // 가서포트 주입으로 새 property 가 추가될 수 있으므로 가변 복사본으로 시작.
  const properties = [...(stageData.properties ?? [])]

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
  // ── 신규 id 카운터 (addRigid / addSupportBeam 공유) ────────────────────
  // RBE2 는 Nastran 에서 element ID 네임스페이스를 CBEAM 등과 공유하므로, 새 rigid id 를
  // rigids max 만으로 매기면 (rigids max < elements id 인 경우) 기존 BEAM 과 ID 충돌한다.
  // → addSupportBeam 카운터와 동일하게 (살아남은) elements + rigids 통합 최대값+1 부터 매긴다.
  const usedEid = new Set()
  for (const e of elements) if (e.id != null) usedEid.add(e.id)
  for (const r of rigids)   if (r.id != null) usedEid.add(r.id)
  let nextId = (usedEid.size ? Math.max(...usedEid) : 0) + 1

  // addRigid intents → 새 id 부여 (통합 네임스페이스)
  for (const ar of mask.addedRigids ?? []) {
    rigids.push({
      id: nextId++,
      independentNode: ar.independentNode,
      dependentNodes: [...ar.dependentNodes],
      cm: ar.cm ?? '123456',
      remark: ar.remark ?? null,
    })
  }

  // ── addSupportBeam 주입 (CBEAM + PBEAML L) ────────────────────────────
  // element id 는 위 통합 카운터(nextId)를 이어 사용 → addRigid 로 추가된 id 와도 충돌 없음.
  // ⚠ PID 는 **기존 최대값+1** 이다(2026-09-17 사용자 결정). 레거시 BdfToCsv.py 의 매직넘버
  //   PID 1000 을 예약하지 않는다 — 기존 모델이 그 번호를 이미 쓰고 있을 수 있고(사내
  //   3370_M04.bdf 의 1000 번이 그 모델의 가서포트다), 단면이 3종이라 한 번호로 담기지도 않는다.
  //   가서포트 식별은 아래 element 의 `remark: '가서포트'` 로 한다.
  // ⚠ property 는 **단면별로 1장만** 만든다(치수가 키). 가서포트마다 PBEAML 을 찍으면
  //   같은 규격이 수십 장 중복돼 BDF 가 불필요하게 커지고, 결과 해석에서 PID 로 단면을
  //   묶어 보는 쪽(보고서 부재 표)이 같은 규격을 여러 줄로 본다.
  let nextPropertyId = (properties.length ? Math.max(...properties.map(p => p.id ?? 0)) : 0) + 1
  const supportMaterialId = resolveSupportMaterialId(stageData)
  const supportPropByDims = new Map()
  for (const sb of mask.addedSupportBeams ?? []) {
    const dims = [...(sb.dims ?? [100, 100, 10, 10])]
    const key = dims.join('x')
    let propId = supportPropByDims.get(key)
    if (propId == null) {
      propId = nextPropertyId++
      supportPropByDims.set(key, propId)
      properties.push({
        id: propId, card: 'PBEAML', kind: 'L',
        dims,
        materialId: supportMaterialId,
      })
    }
    elements.push({
      id: nextId++, type: 'CBEAM',
      startNode: sb.startNode, endNode: sb.endNode,
      propertyId: propId,
      orientation: computeSupportOrientation(stageData, sb.startNode, sb.endNode),
      category: 'Structure', modelPart: 'stru',
      remark: '가서포트',
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
    properties,
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
    properties,
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

/**
 * 가서포트가 재사용할 재질 id 결정.
 * 1) category=Structure BEAM 의 property.materialId → 2) 첫 property.materialId → 3) 첫 material id.
 */
function resolveSupportMaterialId(stageData) {
  for (const e of stageData.elements ?? []) {
    if (e.type === 'BEAM' && e.category === 'Structure') {
      const prop = stageData.propertyMap?.get?.(e.propertyId)
      if (prop?.materialId != null) return prop.materialId
    }
  }
  for (const p of stageData.properties ?? []) {
    if (p.materialId != null) return p.materialId
  }
  return stageData.materials?.[0]?.id ?? null
}

/**
 * 부재축에 수직인 비퇴화 orientation 벡터 산출(수직 부재 G0=0 FATAL 회피).
 * up = 부재가 거의 ±Z 면 [1,0,0], 아니면 [0,0,1]; up 의 축수직 성분을 정규화.
 */
function computeSupportOrientation(stageData, startNode, endNode) {
  const a = stageData.nodeMap?.get?.(startNode)
  const b = stageData.nodeMap?.get?.(endNode)
  if (!a || !b) return [0, 0, 1]
  let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
  const len = Math.hypot(dx, dy, dz) || 1
  dx /= len; dy /= len; dz /= len
  const up = Math.abs(dz) > 0.9 ? [1, 0, 0] : [0, 0, 1]
  const dot = up[0] * dx + up[1] * dy + up[2] * dz
  let ox = up[0] - dot * dx, oy = up[1] - dot * dy, oz = up[2] - dot * dz
  const olen = Math.hypot(ox, oy, oz) || 1
  return [ox / olen, oy / olen, oz / olen]
}
