import { useState, useCallback } from 'react'

/**
 * useGroupRefresh — "그룹 새로고침"(미리보기) 동작.
 *
 * 삭제 표시(deleteGroup intent)한 그룹을 목록에서 즉시 내리고 남은 그룹만 보여준다.
 * 실제 모델 반영은 기존대로 "자세안정성 평가 실행" 시 (intent 기반 미리보기).
 *
 * - refresh(): 현재 삭제 표시된 그룹들을 숨김 집합으로 스냅샷 → 목록에서 사라진다.
 * - showAll(): 숨김을 모두 해제해 전체 그룹을 다시 보여준다.
 * - isHidden(id): 새로고침으로 내렸고 + 아직 삭제 의도가 살아있는 그룹만 true.
 *     (삭제 의도가 취소되면 자동으로 다시 보이도록 deletedGroupIds 와 교차 검사.)
 *
 * @param {Set<number>} deletedGroupIds  현재 deleteGroup intent 로 삭제 표시된 그룹 id 집합
 */
export function useGroupRefresh(deletedGroupIds) {
  const [hiddenIds, setHiddenIds] = useState(() => new Set())

  const refresh = useCallback(() => {
    setHiddenIds(new Set(deletedGroupIds))
  }, [deletedGroupIds])

  const showAll = useCallback(() => setHiddenIds(new Set()), [])

  const isHidden = useCallback(
    (id) => hiddenIds.has(id) && deletedGroupIds.has(id),
    [hiddenIds, deletedGroupIds],
  )

  // 실제로 숨겨진(삭제 의도 살아있는) 그룹 수 — 새로고침 버튼 상태 표시용.
  let hiddenCount = 0
  for (const id of hiddenIds) if (deletedGroupIds.has(id)) hiddenCount++

  return { refresh, showAll, isHidden, hiddenCount }
}
