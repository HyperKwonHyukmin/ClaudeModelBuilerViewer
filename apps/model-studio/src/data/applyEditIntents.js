/**
 * applyEditIntents — StageData(불변) + EditIntent[] 로부터 derived 결과를 계산한다.
 *
 * Phase 2: deleteGroup intent. Phase 3: addRigid intent 가 derivedRigidCount 에 반영되고
 *           addedRigids[] 로 별도 노출되어 미리보기 overlay 가 사용한다.
 *
 * 반환 구조:
 *   {
 *     deletedNodeIds:       Set<number>   // 삭제 대상 노드
 *     deletedElementIds:    Set<number>   // 삭제 대상 BEAM 요소
 *     brokenRbeIds:         Set<number>   // 삭제로 끊기는 RBE id (일부만 살아남음)
 *     fullyRemovedRbeIds:   Set<number>   // 독립+모든 dep 가 함께 삭제되어 통째로 사라지는 RBE
 *     deletedGroupIds:      Set<number>   // 삭제 intent 가 가리킨 group id
 *     deletedMassIds:       Set<number>   // 노드 삭제로 함께 제거되는 PointMass id
 *     derivedGroupCount:    number        // 삭제 후 남은 group 수
 *     derivedNodeCount:     number        // 삭제 후 남은 노드 수
 *     derivedElementCount:  number        // 삭제 후 남은 BEAM 수 (BEAM 외 element 는 영향 없음)
 *     derivedRigidCount:    number        // 삭제 후 남은 RBE (broken 포함, fully-removed 제외)
 *     derivedPointMassCount:number        // 삭제 후 남은 PointMass
 *     brokenRbeCount:       number        // brokenRbeIds.size (편의용)
 *   }
 *
 * 메모이제이션은 호출자(useMemo) 가 담당.
 */

const EMPTY = Object.freeze({
  deletedNodeIds:        new Set(),
  deletedElementIds:     new Set(),
  brokenRbeIds:          new Set(),
  fullyRemovedRbeIds:    new Set(),
  deletedGroupIds:       new Set(),
  deletedMassIds:        new Set(),
  addedRigids:           [],   // [{ intentId, independentNode, dependentNodes, remark, cm }]
  derivedGroupCount:     0,
  derivedNodeCount:      0,
  derivedElementCount:   0,
  derivedRigidCount:     0,
  derivedPointMassCount: 0,
  brokenRbeCount:        0,
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
      addedRigids:           [],
      derivedGroupCount:     stageData.groups?.length ?? 0,
      derivedNodeCount:      stageData.nodeMap?.size ?? 0,
      derivedElementCount:   beamCount,
      derivedRigidCount:     stageData.rigids?.length ?? 0,
      derivedPointMassCount: stageData.pointMasses?.length ?? 0,
    }
  }

  const deletedNodeIds    = new Set()
  const deletedElementIds = new Set()
  const deletedGroupIds   = new Set()

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

  const totalGroups = stageData.groups?.length ?? 0
  const totalNodes  = stageData.nodeMap?.size ?? 0
  const totalBeams  = (stageData.elements ?? []).filter(e => e.type === 'BEAM').length
  const totalRigids = stageData.rigids?.length ?? 0
  const totalMasses = stageData.pointMasses?.length ?? 0

  return {
    deletedNodeIds, deletedElementIds, brokenRbeIds, fullyRemovedRbeIds,
    deletedGroupIds, deletedMassIds, addedRigids,
    derivedGroupCount:     Math.max(0, totalGroups - deletedGroupIds.size),
    derivedNodeCount:      Math.max(0, totalNodes  - deletedNodeIds.size),
    derivedElementCount:   Math.max(0, totalBeams  - deletedElementIds.size),
    derivedRigidCount:     Math.max(0, totalRigids - fullyRemovedRbeIds.size) + addedRigids.length,
    derivedPointMassCount: Math.max(0, totalMasses - deletedMassIds.size),
    brokenRbeCount:        brokenRbeIds.size,
  }
}

/**
 * deleteMask 가 비어 있는지 빠르게 검사 (씬 적용 단축용).
 */
export function isEmptyDeleteMask(mask) {
  if (!mask) return true
  return (mask.deletedNodeIds?.size ?? 0) === 0
      && (mask.deletedElementIds?.size ?? 0) === 0
}
