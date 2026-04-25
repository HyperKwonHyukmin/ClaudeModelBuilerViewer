/**
 * Computes metric differences between two StageData objects.
 * Returns an array of {label, a, b, delta, deltaPercent} rows.
 *
 * @param {import('./StageData.js').StageData} stageA
 * @param {import('./StageData.js').StageData} stageB
 * @returns {Array<{label:string, a:number, b:number, delta:number, deltaPercent:number}>}
 */
export function stageDiff(stageA, stageB) {
  const ta = stageA?.healthMetrics?.totals ?? {}
  const tb = stageB?.healthMetrics?.totals ?? {}
  const ia = stageA?.healthMetrics?.issues ?? {}
  const ib = stageB?.healthMetrics?.issues ?? {}
  const ca = stageA?.connectivity ?? {}
  const cb = stageB?.connectivity ?? {}

  const row = (label, a, b) => {
    a = a ?? 0; b = b ?? 0
    const delta = b - a
    const deltaPercent = a !== 0 ? (delta / a) * 100 : (b !== 0 ? 100 : 0)
    return { label, a, b, delta, deltaPercent }
  }

  return [
    row('노드 수', ta.nodeCount, tb.nodeCount),
    row('요소 수 (전체)', ta.elementCount, tb.elementCount),
    row('요소 수 (구조)', ta.elementsByCategory?.Structure, tb.elementsByCategory?.Structure),
    row('요소 수 (배관)', ta.elementsByCategory?.Pipe, tb.elementsByCategory?.Pipe),
    row('RBE 수', ta.rigidCount, tb.rigidCount),
    row('질량 수', ta.pointMassCount, tb.pointMassCount),
    row('그룹 수', ca.groupCount, cb.groupCount),
    row('고립 노드', ia.isolatedNodeCount ?? ca.isolatedNodeCount, ib.isolatedNodeCount ?? cb.isolatedNodeCount),
    row('자유단 노드', ia.freeEndNodes, ib.freeEndNodes),
    row('단락 요소', ia.shortElements, ib.shortElements),
    row('고아 노드', ia.orphanNodes, ib.orphanNodes),
  ]
}
