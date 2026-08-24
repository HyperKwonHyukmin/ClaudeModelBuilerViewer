/**
 * 권상 그룹 → 노드 번호 라벨.
 *
 * 자세안정성 리포트(엔진 산출)의 stage results 에는 `groupId` 만 있고 노드 번호가 없다.
 * 그래서 "어느 그룹이 기준을 만족하지 못했다"까지만 알 수 있고, 정작 사용자가 고쳐야 할
 * **어느 노드인지**를 알 수 없었다.
 *
 * 노드 선택은 스튜디오가 소유한 정보다(useEditStore.hoistGroups = { groupId: [nodeId, ...] }).
 * 따라서 엔진을 고치지 않고도 groupId 로 되짚어 노드 번호를 사용자에게 보여줄 수 있다.
 */

/** 노드 번호 목록을 사람이 읽을 문자열로. 너무 길면 앞쪽만 보이고 나머지는 개수로 접는다. */
export function formatNodeIds(nodeIds, max = 8) {
  if (!Array.isArray(nodeIds)) return ''
  const ids = nodeIds.filter(n => n != null)
  if (ids.length === 0) return ''
  const head = ids.slice(0, max).join(', ')
  const more = ids.length > max ? ` 외 ${ids.length - max}개` : ''
  return `${head}${more}`
}

/**
 * "Group 2 (Node 10234, 10251)" 형태의 라벨.
 * 노드를 모르면 "Group 2" 로, groupId 조차 없으면 빈 문자열로 떨어진다(문구가 깨지지 않게).
 *
 * @param {number|string|null|undefined} groupId
 * @param {Record<string|number, Array<number|string>>|null|undefined} hoistGroups
 */
export function groupNodeLabel(groupId, hoistGroups) {
  if (groupId == null) return ''
  const list = formatNodeIds(hoistGroups?.[groupId])
  return list ? `Group ${groupId} (Node ${list})` : `Group ${groupId}`
}

/**
 * stage.results 중 valid=false 인 항목을 모두 모아 "그룹(노드) — 사유" 목록 문자열로.
 * 실패 그룹이 여러 개면 전부 보여준다 — 하나만 고치고 다시 돌리는 왕복을 줄이기 위해서다.
 *
 * @param {Array<object>|null|undefined} results stage.results
 * @param {Record<string|number, Array<number|string>>|null|undefined} hoistGroups
 * @returns {string} 실패 항목이 없으면 빈 문자열
 */
export function describeFailedGroups(results, hoistGroups) {
  if (!Array.isArray(results)) return ''
  const failed = results.filter(r => r?.valid === false)
  if (failed.length === 0) return ''
  return failed
    .map(f => {
      const label = groupNodeLabel(f.groupId, hoistGroups)
      const reason = f.reason ? String(f.reason) : ''
      if (label && reason) return `${label}: ${reason}`
      return label || reason
    })
    .filter(Boolean)
    .join(' / ')
}
