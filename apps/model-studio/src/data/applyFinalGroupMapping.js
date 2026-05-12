/**
 * 모든 stage의 부재가 "마지막 stage(보통 Validation) 기준 group ID"로 색·번호 매핑되도록
 * 후처리한다. 데이터 자체(stage.groups, stage.connectivity 등)는 건드리지 않고,
 * 각 stage에 다음 두 필드만 부착한다:
 *
 *   - stage.finalGroups               : 마지막 stage의 groups[] (모든 stage가 공유, 색·번호 기준)
 *   - stage.finalElementGroupMap      : Map<elementId, finalGroupIdx> — 각 stage 부재가 최종적으로
 *                                       어느 그룹에 속하는지. 매핑 없으면 -1 (예: 마지막 stage에서 사라진 분파)
 *
 * 이전 단계의 노드/요소가 마지막 stage에 직접 존재하지 않을 경우, 다음 순서로 재추적한다:
 *   1) elementId 그대로 마지막 stage에 살아있으면 그 group
 *   2) 그 부재의 startNode/endNode가 마지막 stage에 살아있으면 그 노드의 group
 *   3) 사라진 노드는 trace의 NodeMerged(nodeId → relatedNodeId)를 union-find식으로 따라가
 *      후계 노드의 group
 *   4) 끝까지 매핑 안되면 -1 ("기타")
 *
 * @param {Array<import('./StageData.js').StageData>} stages
 */
export function applyFinalGroupMapping(stages) {
  if (!stages?.length) return

  const finalStage = stages[stages.length - 1]
  const finalGroups = finalStage.groups ?? []

  // 마지막 stage 기준 룩업
  const finalNodeToGroup = new Map()      // nodeId  → groupIdx
  const finalElemToGroup = new Map()      // elemId  → groupIdx
  for (const g of finalGroups) {
    for (const nid of g.nodeIds ?? [])    finalNodeToGroup.set(nid, g.id)
    for (const eid of g.elementIds ?? []) finalElemToGroup.set(eid, g.id)
  }

  // 모든 stage의 trace를 합쳐 NodeMerged 후계 사슬 만들기
  // (사실 각 stage의 trace는 누적되어 있으므로 마지막 stage의 trace 하나면 충분하지만,
  //  안전을 위해 마지막 stage에서 가져옴)
  const mergeRedirect = new Map()  // oldId → keptId  (직접 흡수)
  for (const t of finalStage.trace ?? []) {
    if (t.action === 'NodeMerged' && t.nodeId != null && t.relatedNodeId != null) {
      mergeRedirect.set(t.nodeId, t.relatedNodeId)
    }
  }
  // 사슬 따라 최종 keptId까지 추적 (메모이즈)
  const resolved = new Map()
  const resolveNode = (nid) => {
    if (resolved.has(nid)) return resolved.get(nid)
    const seen = new Set()
    let cur = nid
    while (mergeRedirect.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      cur = mergeRedirect.get(cur)
    }
    resolved.set(nid, cur)
    return cur
  }

  for (const stage of stages) {
    const map = new Map()
    for (const e of stage.elements ?? []) {
      // 1) elementId 직접 매칭
      let g = finalElemToGroup.get(e.id)
      if (g != null) { map.set(e.id, g); continue }

      // 2) startNode 또는 endNode 직접 매칭
      g = finalNodeToGroup.get(e.startNode) ?? finalNodeToGroup.get(e.endNode)
      if (g != null) { map.set(e.id, g); continue }

      // 3) NodeMerged 후계 사슬 따라가기
      const sN = resolveNode(e.startNode)
      const eN = resolveNode(e.endNode)
      g = finalNodeToGroup.get(sN) ?? finalNodeToGroup.get(eN)
      if (g != null) { map.set(e.id, g); continue }

      map.set(e.id, -1)
    }
    stage.finalGroups          = finalGroups
    stage.finalElementGroupMap = map
  }
}
