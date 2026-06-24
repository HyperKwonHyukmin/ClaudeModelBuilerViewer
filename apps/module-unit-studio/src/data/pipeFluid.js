/**
 * pipeFluid — 배관 내부 유체(물) 비우기 순수 헬퍼.
 *
 * 모델은 배관 내부 물을 강재 + 물 등가밀도(예: Steel_Fluid_*, rho > 7.85e-9)로 표현한다.
 * "비우기" = Pipe 요소가 참조하는 material 들의 rho 를 순수 강재값(7.85e-9)으로 되돌리는 것.
 */

// 순수 강재 밀도 (t/mm³, NASTRAN consistent units mm·N·s·t).
export const PIPE_STEEL_RHO = 7.85e-9

/**
 * stage 에서 category==='Pipe' 요소가 참조하는 material id 집합을 모은다.
 * @param {object|null} stage  StageData (elements/propertyMap 보유)
 * @returns {Set<number>}
 */
export function collectPipeMaterialIds(stage) {
  const ids = new Set()
  if (!stage) return ids
  for (const e of stage.elements ?? []) {
    if (e.category !== 'Pipe') continue
    const prop = stage.propertyMap?.get?.(e.propertyId)
    const mid = prop?.materialId
    if (mid != null) ids.add(mid)
  }
  return ids
}

/**
 * 여러 stage 의 materialMap 에서 materialIds 에 해당하는 material rho 를 rho 로 set (in-place).
 * StageData 의 materialMap 값과 materials 배열 항목은 동일 객체 참조라 둘 다 갱신된다.
 * @param {object[]} stages
 * @param {Iterable<number>} materialIds
 * @param {number} [rho]
 * @returns {number}  실제로 값이 바뀐 material 항목 수 (stage 합산)
 */
export function applyPipeFluidEmpty(stages, materialIds, rho = PIPE_STEEL_RHO) {
  if (!Array.isArray(stages) || !materialIds) return 0
  const idSet = materialIds instanceof Set ? materialIds : new Set(materialIds)
  let changed = 0
  for (const stage of stages) {
    for (const mid of idSet) {
      const mat = stage?.materialMap?.get?.(mid)
      if (mat && mat.rho !== rho) { mat.rho = rho; changed++ }
    }
  }
  return changed
}

/**
 * stage 의 모든 Pipe material rho 가 이미 순수 강재값(7.85e-9)인지 판정.
 *
 * 용도: 배관 유체가 이미 비워진(또는 애초에 물 중량이 없던) 모델을 로드했을 때
 * UI 가 "유체 비움 완료" 상태로 인식하도록 한다.
 *
 * 규칙:
 *   - Pipe 요소가 하나도 없으면 false ('비울 유체' 자체가 없음 → 완료가 아니라 '대상 없음').
 *   - Pipe material 중 rho 가 강재값과 (허용오차 초과로) 다른 것이 하나라도 있으면 false.
 *   - 모든 Pipe material rho 가 강재값이면 true.
 *
 * @param {object|null} stage  StageData (elements/propertyMap/materialMap 보유)
 * @param {number} [rho]  순수 강재 밀도 기준값
 * @returns {boolean}
 */
export function isPipeFluidEmpty(stage, rho = PIPE_STEEL_RHO) {
  if (!stage) return false
  const ids = collectPipeMaterialIds(stage)
  if (ids.size === 0) return false
  const tol = Math.abs(rho) * 1e-6   // JSON 왕복/표현 오차를 흡수하는 작은 허용오차
  for (const mid of ids) {
    const mat = stage.materialMap?.get?.(mid)
    if (mat && Math.abs((mat.rho ?? 0) - rho) > tol) return false
  }
  return true
}
