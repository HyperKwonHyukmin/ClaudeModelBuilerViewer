/**
 * applyEditIntents — StageData(불변) + EditIntent[] 로부터 derived 결과를 계산한다.
 *
 * Phase 2: deleteGroup intent. Phase 3: addRigid intent 가 derivedRigidCount 에 반영되고
 *           addedRigids[] 로 별도 노출되어 미리보기 overlay 가 사용한다.
 *
 * 반환 구조:
 *   {
 *     deletedNodeIds:        Set<number>   // 삭제 대상 노드
 *     deletedElementIds:     Set<number>   // 삭제 대상 BEAM 요소 (deleteGroup + deleteElement 합집합)
 *     brokenRbeIds:          Set<number>   // 삭제로 끊기는 RBE id (일부만 살아남음)
 *     fullyRemovedRbeIds:    Set<number>   // 독립+모든 dep 가 함께 삭제되어 통째로 사라지는 RBE
 *     deletedGroupIds:       Set<number>   // 삭제 intent 가 가리킨 group id
 *     deletedMassIds:        Set<number>   // 노드 삭제로 함께 제거되는 PointMass id
 *     orphanCandidateNodeIds:Set<number>   // element/RBE/PointMass 어디서도 참조되지 않는 살아있는 노드
 *                                          // (deleteOrphanNodes intent 후보 — 자동 삭제는 안 함)
 *     derivedGroupCount:     number        // 삭제 후 남은 group 수
 *     derivedNodeCount:      number        // 삭제 후 남은 노드 수
 *     derivedElementCount:   number        // 삭제 후 남은 BEAM 수 (BEAM 외 element 는 영향 없음)
 *     derivedRigidCount:     number        // 삭제 후 남은 RBE (broken 포함, fully-removed 제외)
 *     derivedPointMassCount: number        // 삭제 후 남은 PointMass
 *     brokenRbeCount:        number        // brokenRbeIds.size (편의용)
 *   }
 *
 * 메모이제이션은 호출자(useMemo) 가 담당.
 */

const EMPTY = Object.freeze({
  deletedNodeIds:         new Set(),
  deletedElementIds:      new Set(),
  brokenRbeIds:           new Set(),
  fullyRemovedRbeIds:     new Set(),
  deletedGroupIds:        new Set(),
  deletedMassIds:         new Set(),
  orphanCandidateNodeIds: new Set(),
  addedRigids:            [],   // [{ intentId, independentNode, dependentNodes, remark, cm }]
  addedSupportBeams:      [],   // [{ intentId, startNode, endNode, dims }]
  derivedGroupCount:      0,
  derivedNodeCount:       0,
  derivedElementCount:    0,
  derivedRigidCount:      0,
  derivedPointMassCount:  0,
  brokenRbeCount:         0,
})

/**
 * @param {import('./StageData.js').StageData|null} stageData
 * @param {object[]} intents
 * @returns {{ deletedNodeIds: Set<number>, deletedElementIds: Set<number>, brokenRbeIds: Set<number>, deletedGroupIds: Set<number>, derivedGroupCount: number }}
 */
export function computeDeleteMask(stageData, intents) {
  if (!stageData || !Array.isArray(intents) || intents.length === 0) {
    if (!stageData) return EMPTY
    const beamCount = (stageData.elements ?? []).filter(e => e.type === 'BEAM').length
    return {
      ...EMPTY,
      orphanCandidateNodeIds: computeOrphanCandidates(stageData, EMPTY.deletedNodeIds, EMPTY.deletedElementIds, EMPTY.fullyRemovedRbeIds, EMPTY.deletedMassIds, []),
      addedRigids:            [],
      derivedGroupCount:      stageData.groups?.length ?? 0,
      derivedNodeCount:       stageData.nodeMap?.size ?? 0,
      derivedElementCount:    beamCount,
      derivedRigidCount:      stageData.rigids?.length ?? 0,
      derivedPointMassCount:  stageData.pointMasses?.length ?? 0,
    }
  }

  const deletedNodeIds    = new Set()
  const deletedElementIds = new Set()
  const deletedGroupIds   = new Set()

  // 주의: rotateModel / emptyPipeFluid 는 geometry/material 을 프론트 in-memory 에서 이미 적용한
  // "부작용 intent" 다. 여기(computeDeleteMask)나 buildEditedStageJson 에서 절대 재적용하지 말 것
  // — 좌표를 두 번 회전하는 등 이중 적용 버그가 생긴다. 이 intent 들은 기록(provenance) 전용이다.
  for (const intent of intents) {
    if (intent.kind !== 'deleteGroup') continue
    const groupId = intent.params?.groupId
    if (groupId == null) continue
    const group = stageData.groups?.find(g => g.id === groupId)
    if (!group) continue

    deletedGroupIds.add(groupId)
    for (const nid of group.nodeIds ?? []) deletedNodeIds.add(nid)
    for (const eid of group.elementIds ?? []) deletedElementIds.add(eid)
  }

  // 개별 요소 삭제 — element 1건만 deletedElementIds 에 누적. 노드는 자동 삭제하지 않는다
  // (양 끝 노드가 다른 element 에서 여전히 쓰일 수 있고, RBE/PointMass 도 참조할 수 있음).
  // 그 결과 발생한 고립 노드는 orphanCandidateNodeIds 로 UI 에 노출되어 사용자가 명시적으로
  // deleteOrphanNodes intent 를 추가하도록 한다.
  for (const intent of intents) {
    if (intent.kind !== 'deleteElement') continue
    const eid = intent.params?.elementId
    if (eid == null) continue
    // 존재하지 않는 element 참조는 무시 (validate 단계에서 걸러지지만 import 등 외부 경로에선 들어올 수 있음)
    if (!(stageData.elements ?? []).some(e => e.id === eid)) continue
    deletedElementIds.add(eid)
  }

  // 부재 종류(구조/배관) 일괄 삭제 — 해당 category 의 BEAM 요소를 모두 deletedElementIds 에 누적.
  // deleteElement 와 동일하게 노드는 자동 삭제하지 않고(공유 노드/ RBE 참조 가능),
  // 그 결과 고립된 노드는 orphanCandidateNodeIds 로 노출되어 사용자가 별도로 정리한다.
  for (const intent of intents) {
    if (intent.kind !== 'deleteCategory') continue
    const category = intent.params?.category
    if (category == null) continue
    for (const e of stageData.elements ?? []) {
      if (e.type === 'BEAM' && e.category === category) deletedElementIds.add(e.id)
    }
  }

  // Orphan 노드 일괄 삭제 — element 참조가 없는 노드만 대상이므로 element/RBE/PointMass cascade 영향 없음
  // (validate 단계에서 nodeMap 존재 여부 확인됨)
  for (const intent of intents) {
    if (intent.kind !== 'deleteOrphanNodes') continue
    const ids = intent.params?.nodeIds
    if (!Array.isArray(ids)) continue
    for (const nid of ids) deletedNodeIds.add(nid)
  }

  // RBE 분류: broken(일부만 삭제) vs fullyRemoved(통째로 사라짐) vs untouched
  const brokenRbeIds       = new Set()
  const fullyRemovedRbeIds = new Set()
  for (const r of stageData.rigids ?? []) {
    if (r.independentNode == null) continue
    const indDeleted = deletedNodeIds.has(r.independentNode)
    const deps = r.dependentNodes ?? []
    let depDeletedCount = 0
    for (const d of deps) if (deletedNodeIds.has(d)) depDeletedCount++
    const allDepsDeleted = deps.length > 0 && depDeletedCount === deps.length

    if (indDeleted && allDepsDeleted) {
      fullyRemovedRbeIds.add(r.id)
    } else if (indDeleted && !allDepsDeleted) {
      brokenRbeIds.add(r.id)        // 독립 사라지고 일부 종속 남음
    } else if (!indDeleted && depDeletedCount > 0 && !allDepsDeleted) {
      brokenRbeIds.add(r.id)        // 독립 살아있고 종속 일부만 삭제
    }
    // 그 외: 영향 없음
  }

  // PointMass: nodeId 가 삭제됐으면 함께 제거
  const deletedMassIds = new Set()
  for (const pm of stageData.pointMasses ?? []) {
    if (deletedNodeIds.has(pm.nodeId)) deletedMassIds.add(pm.id)
  }

  // addRigid intents — 미리보기 overlay 와 derivedRigidCount 에 반영
  // 검증 시점에 errors=0 이라 가정하지만, 호출자가 잘못된 intent 를 강제로 넣을 수 있으니
  // 노드 존재 여부만 한 번 더 점검 (없는 노드 참조면 미리보기에서 제외).
  const addedRigids = []
  for (const intent of intents) {
    if (intent.kind !== 'addRigid') continue
    const { independentNode, dependentNodes, remark, cm } = intent.params ?? {}
    if (independentNode == null || !Array.isArray(dependentNodes) || dependentNodes.length === 0) continue
    if (!stageData.nodeMap?.has(independentNode)) continue
    const validDeps = dependentNodes.filter(d => stageData.nodeMap?.has(d))
    if (validDeps.length === 0) continue
    addedRigids.push({
      intentId: intent.id,
      independentNode,
      dependentNodes: validDeps,
      remark: remark ?? null,
      cm:     cm ?? null,
    })
  }

  // addSupportBeam intents — 미리보기/카운트용. 노드 존재 여부만 확인.
  const addedSupportBeams = []
  for (const intent of intents) {
    if (intent.kind !== 'addSupportBeam') continue
    const { startNode, endNode, dims } = intent.params ?? {}
    if (!Number.isInteger(startNode) || !Number.isInteger(endNode)) continue
    if (!stageData.nodeMap?.has(startNode) || !stageData.nodeMap?.has(endNode)) continue
    addedSupportBeams.push({ intentId: intent.id, startNode, endNode, dims: dims ?? [100, 100, 10, 10] })
  }

  const totalGroups = stageData.groups?.length ?? 0
  const totalNodes  = stageData.nodeMap?.size ?? 0
  const totalBeams  = (stageData.elements ?? []).filter(e => e.type === 'BEAM').length
  const totalRigids = stageData.rigids?.length ?? 0
  const totalMasses = stageData.pointMasses?.length ?? 0

  const orphanCandidateNodeIds = computeOrphanCandidates(
    stageData, deletedNodeIds, deletedElementIds, fullyRemovedRbeIds, deletedMassIds, addedRigids,
  )

  return {
    deletedNodeIds, deletedElementIds, brokenRbeIds, fullyRemovedRbeIds,
    deletedGroupIds, deletedMassIds, orphanCandidateNodeIds, addedRigids,
    addedSupportBeams,
    derivedGroupCount:     Math.max(0, totalGroups - deletedGroupIds.size),
    derivedNodeCount:      Math.max(0, totalNodes  - deletedNodeIds.size),
    derivedElementCount:   Math.max(0, totalBeams  - deletedElementIds.size) + addedSupportBeams.length,
    derivedRigidCount:     Math.max(0, totalRigids - fullyRemovedRbeIds.size) + addedRigids.length,
    derivedPointMassCount: Math.max(0, totalMasses - deletedMassIds.size),
    brokenRbeCount:        brokenRbeIds.size,
  }
}

/**
 * 현재 마스크 적용 후 "어떤 살아남은 노드가 BEAM / 살아남은 RBE / 살아남은 PointMass 어디에서도
 * 참조되지 않는가" 를 계산한다. element 단위 삭제로 새로 발생한 고립 노드를 사용자에게 안내해
 * deleteOrphanNodes intent 후보로 노출하는 용도.
 *
 * - addedRigids 의 노드는 살아있는 것으로 간주 (사용자가 의도적으로 만든 RBE 의 연결점)
 * - deleteGroup 으로 이미 deletedNodeIds 에 들어간 노드는 제외 (orphan 이 아니라 사라질 노드)
 * - 원본에 원래 있던 isolated 노드도 함께 포함되므로 "신규 발생분만" 으로 좁히지 않는다.
 *   (사용자가 한 번에 정리하고 싶을 수 있고, healthMetrics 와 일관됨)
 */
function computeOrphanCandidates(
  stageData, deletedNodeIds, deletedElementIds, fullyRemovedRbeIds, deletedMassIds, addedRigids,
) {
  if (!stageData?.nodeMap) return new Set()

  const usedByElement = new Set()
  for (const e of stageData.elements ?? []) {
    if (e.type !== 'BEAM') continue
    if (deletedElementIds.has(e.id)) continue
    if (e.startNode != null) usedByElement.add(e.startNode)
    if (e.endNode   != null) usedByElement.add(e.endNode)
  }

  const usedByRbe = new Set()
  for (const r of stageData.rigids ?? []) {
    if (fullyRemovedRbeIds.has(r.id)) continue
    if (r.independentNode != null && !deletedNodeIds.has(r.independentNode)) {
      usedByRbe.add(r.independentNode)
    }
    for (const d of r.dependentNodes ?? []) {
      if (!deletedNodeIds.has(d)) usedByRbe.add(d)
    }
  }
  for (const ar of addedRigids ?? []) {
    if (ar.independentNode != null) usedByRbe.add(ar.independentNode)
    for (const d of ar.dependentNodes ?? []) usedByRbe.add(d)
  }

  const usedByMass = new Set()
  for (const pm of stageData.pointMasses ?? []) {
    if (deletedMassIds.has(pm.id)) continue
    if (pm.nodeId != null && !deletedNodeIds.has(pm.nodeId)) {
      usedByMass.add(pm.nodeId)
    }
  }

  const orphans = new Set()
  for (const [id] of stageData.nodeMap) {
    if (deletedNodeIds.has(id)) continue
    if (usedByElement.has(id)) continue
    if (usedByRbe.has(id))     continue
    if (usedByMass.has(id))    continue
    orphans.add(id)
  }
  return orphans
}

/**
 * deleteMask 가 비어 있는지 빠르게 검사 (씬 적용 단축용).
 */
export function isEmptyDeleteMask(mask) {
  if (!mask) return true
  return (mask.deletedNodeIds?.size ?? 0) === 0
      && (mask.deletedElementIds?.size ?? 0) === 0
}
